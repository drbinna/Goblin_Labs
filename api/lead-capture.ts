// POST /api/lead-capture — the single ingest point for leads.
//
//   event: "visit"   → logged the moment a visitor lands on a persona page,
//                       before they click Start. Captures attribution so even
//                       a 3-second bounce becomes a known, sourced lead.
//   event: "contact" → name/email/company captured via the typed card. Email
//                       is validated; a valid one is promoted to Notion once.
//
// Mongo is the system of record (survives Anam's 30-day window, holds partial
// and anonymous leads). Notion is a downstream, best-effort CRM view.
//
// GET /api/lead-capture (and /api/leads via rewrite) → operator read view:
// funnel summary + recent leads.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { leadsCollection, type Lead, type LeadUtm } from "./_leads.js";
import { createNotionLead } from "./_notion.js";
import { getUserId } from "./_auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Leads are stored in Mongo (the system of record). Notion mirroring is off for
// now — flip to true to start promoting valid-email leads into the CRM again.
const SYNC_TO_NOTION = false;

function cleanUtm(u: unknown): LeadUtm | undefined {
  if (!u || typeof u !== "object") return undefined;
  const src = u as Record<string, unknown>;
  const out: LeadUtm = {};
  for (const k of ["source", "medium", "campaign", "term", "content"] as const) {
    const v = src[k];
    if (typeof v === "string" && v) out[k] = v.slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}

const str = (v: unknown, max = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

// ---- GET (operator read view) ---------------------------------------------
// Served at /api/leads via a vercel.json rewrite. Lives here rather than in its
// own api/leads.ts because this project hits a deploy-time serverless-function
// ceiling at 16 functions; folding read+write into one keeps us under it.
// The read view exposes lead PII (names, emails, companies), so it is never
// public. Callers must be signed in; if LEADS_OPERATOR_IDS is set (comma-
// separated Clerk user ids) only those operators pass. The public site never
// calls this GET — only the operator dashboard does — so gating it is invisible
// to visitors.
async function authorizeOperator(req: VercelRequest): Promise<boolean> {
  const userId = await getUserId(req);
  if (!userId) return false;
  const allow = (process.env.LEADS_OPERATOR_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.length === 0 ? true : allow.includes(userId);
}

async function readLeads(req: VercelRequest, res: VercelResponse) {
  if (!(await authorizeOperator(req))) return res.status(401).json({ error: "operator sign-in required" });
  const q = req.query;
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const limit = Math.min(Math.max(parseInt(String(one(q.limit) ?? "50"), 10) || 50, 1), 200);
  const persona = typeof one(q.persona) === "string" && one(q.persona) ? String(one(q.persona)) : undefined;
  const status = typeof one(q.status) === "string" && one(q.status) ? String(one(q.status)) : undefined;
  const withEmail = String(one(q.withEmail) ?? "") === "true";
  const sinceRaw = typeof one(q.since) === "string" ? String(one(q.since)) : undefined;
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const sinceValid = since && !Number.isNaN(since.getTime()) ? since : undefined;

  // Scope = persona/time window the funnel is computed over.
  const scope: Record<string, any> = {};
  if (persona) scope.personaId = persona;
  if (sinceValid) scope.lastSeenAt = { $gte: sinceValid };

  // Filter = scope plus the narrowing the list view applies.
  const filter: Record<string, any> = { ...scope };
  if (status) filter.status = status;
  if (withEmail) filter.emailValid = true;

  try {
    const coll = await leadsCollection();

    const [total, withValidEmail, contactCaptured, byStatusAgg, byPersonaAgg, items] =
      await Promise.all([
        coll.countDocuments(scope),
        coll.countDocuments({ ...scope, emailValid: true }),
        coll.countDocuments({ ...scope, status: "contact_captured" }),
        coll.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
        coll
          .aggregate([
            { $match: scope },
            {
              $group: {
                _id: "$personaId",
                leads: { $sum: 1 },
                withEmail: { $sum: { $cond: [{ $eq: ["$emailValid", true] }, 1, 0] } },
              },
            },
            { $sort: { leads: -1 } },
            { $limit: 25 },
          ])
          .toArray(),
        coll.find(filter).sort({ lastSeenAt: -1 }).limit(limit).toArray(),
      ]);

    const leads = (items as any[]).map((l) => ({
      visitorId: l.visitorId,
      personaId: l.personaId ?? null,
      name: l.name ?? null,
      email: l.email ?? null,
      company: l.company ?? null,
      status: l.status,
      emailValid: !!l.emailValid,
      referrer: l.referrer ?? null,
      utm: l.utm ?? null,
      firstSeenAt: l.firstSeenAt,
      lastSeenAt: l.lastSeenAt,
      capturedAt: l.capturedAt ?? null,
    }));

    return res.status(200).json({
      ok: true,
      summary: {
        total,
        contactCaptured,
        withValidEmail,
        byStatus: Object.fromEntries((byStatusAgg as any[]).map((s) => [s._id ?? "unknown", s.n])),
        byPersona: (byPersonaAgg as any[]).map((p) => ({
          personaId: p._id ?? null,
          leads: p.leads,
          withEmail: p.withEmail,
        })),
      },
      count: leads.length,
      leads,
    });
  } catch (e: any) {
    console.error("[lead-capture]", e?.message ?? e);
    return res.status(500).json({ error: "server error" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return readLeads(req, res);
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });

  const body = (req.body ?? {}) as Record<string, any>;
  const visitorId = str(body.visitorId, 100);
  const event = String(body.event ?? "");
  if (!visitorId) return res.status(400).json({ error: "visitorId required" });

  const personaId = str(body.personaId, 100) ?? null;
  const now = new Date();

  try {
    const coll = await leadsCollection();

    if (event === "visit") {
      await coll.updateOne(
        { visitorId },
        {
          $setOnInsert: { visitorId, firstSeenAt: now, status: "visited" as const },
          $set: {
            personaId,
            lastSeenAt: now,
            ...(str(body.referrer, 500) ? { referrer: str(body.referrer, 500) } : {}),
            ...(cleanUtm(body.utm) ? { utm: cleanUtm(body.utm) } : {}),
            ...(str(body.userAgent, 500) ? { userAgent: str(body.userAgent, 500) } : {}),
          },
        },
        { upsert: true },
      );
      return res.status(200).json({ ok: true });
    }

    if (event === "contact") {
      const email = str(body.email, 200)?.toLowerCase();
      const emailValid = !!email && EMAIL_RE.test(email);
      const name = str(body.name, 200);
      const company = str(body.company, 200);
      const need = str(body.need, 1000);

      const set: Partial<Lead> = {
        lastSeenAt: now,
        capturedAt: now,
        emailValid,
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(company ? { company } : {}),
        ...(need ? { need } : {}),
        ...(personaId ? { personaId } : {}),
        ...(emailValid ? { status: "contact_captured" as const } : {}),
      };

      const updated = await coll.findOneAndUpdate(
        { visitorId },
        {
          // status lives in $set when emailValid; only seed it on insert
          // otherwise, so the same path is never in both operators (Mongo
          // rejects that, which is what made valid submissions fail).
          $setOnInsert: { visitorId, firstSeenAt: now, ...(emailValid ? {} : { status: "visited" as const }) },
          $set: set,
        },
        { upsert: true, returnDocument: "after" },
      );

      const lead = (updated && (updated as any).value !== undefined ? (updated as any).value : updated) as Lead | null;

      // Promote to Notion once, only when we have a real email — disabled for
      // now (SYNC_TO_NOTION=false); leads live in Mongo only.
      let syncedToNotion = lead?.syncedToNotion ?? false;
      if (SYNC_TO_NOTION && emailValid && lead && !lead.syncedToNotion) {
        try {
          const title = lead.name || company || email!.split("@")[0] || "Website lead";
          const pageId = await createNotionLead({
            name: title,
            email: email!,
            company: lead.company,
            need: lead.need,
          });
          await coll.updateOne(
            { visitorId },
            { $set: { syncedToNotion: true, notionPageId: pageId } },
          );
          syncedToNotion = true;
        } catch (e) {
          // Best-effort: the lead is safe in Mongo regardless of Notion.
          console.warn("[lead-capture] Notion sync failed:", (e as Error)?.message);
        }
      }

      return res.status(200).json({ ok: true, emailValid, syncedToNotion });
    }

    return res.status(400).json({ error: `unknown event: ${event}` });
  } catch (e: any) {
    console.error("[lead-capture]", e?.message ?? e);
    return res.status(500).json({ error: "server error" });
  }
}
