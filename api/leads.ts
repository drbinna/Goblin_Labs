// GET /api/leads — operator view of captured leads (read-only, Mongo).
//
// Auth: a signed-in Clerk user OR the shared tool secret (x-tool-secret).
// Optionally restrict to specific operators by setting LEADS_ADMIN_USER_IDS to
// a comma-separated list of Clerk user ids; when set, only those users (or the
// secret) may read. Returns lead PII, so keep the allowlist in mind.
//
// Query params (all optional):
//   limit     number  1..200 (default 50)
//   persona   string  filter by personaId
//   status    string  "visited" | "contact_captured"
//   withEmail "true"   only leads with a valid email
//   since     ISO date only leads seen on/after this time
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";
import { leadsCollection } from "./_leads";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  // ---- auth ----------------------------------------------------------------
  const userId = await getUserId(req);
  const secretOk =
    !!process.env.TOOL_SHARED_SECRET &&
    req.headers["x-tool-secret"] === process.env.TOOL_SHARED_SECRET;
  const adminIds = (process.env.LEADS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const userOk = !!userId && (adminIds.length === 0 || adminIds.includes(userId));
  if (!userOk && !secretOk) return res.status(401).json({ error: "unauthorized" });

  // ---- params --------------------------------------------------------------
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
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
