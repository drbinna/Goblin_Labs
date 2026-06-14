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
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { leadsCollection, type Lead, type LeadUtm } from "./_leads";
import { createNotionLead } from "./_notion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

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
          $setOnInsert: { visitorId, firstSeenAt: now, status: emailValid ? "contact_captured" : "visited" },
          $set: set,
        },
        { upsert: true, returnDocument: "after" },
      );

      const lead = (updated && (updated as any).value !== undefined ? (updated as any).value : updated) as Lead | null;

      // Promote to Notion once, only when we have a real email.
      let syncedToNotion = lead?.syncedToNotion ?? false;
      if (emailValid && lead && !lead.syncedToNotion) {
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
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
