// GET /api/zendesk-activity — recent tickets feed for the demo panel.
// Clerk-authenticated (the person running the demo is signed in).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "sign in required" });

  const sub = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;
  if (!sub || !email || !token) return res.status(500).json({ error: "Zendesk env not set" });

  try {
    const auth = "Basic " + Buffer.from(`${email}/token:${token}`).toString("base64");
    const r = await fetch(
      `https://${sub}.zendesk.com/api/v2/tickets.json?sort_by=updated_at&sort_order=desc&per_page=10`,
      { headers: { authorization: auth } },
    );
    const body = await r.json();
    if (!r.ok) return res.status(500).json({ error: `Zendesk ${r.status}` });
    const tickets = (body.tickets ?? []).map((t: any) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      updated_at: t.updated_at,
      created_at: t.created_at,
      via_anne: (t.tags ?? []).includes("created-by-anne"),
    }));
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ tickets });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
