// POST /api/zendesk-tool?action=...  — webhook target for Anne's Anam tools.
// Anam's engine calls this mid-conversation; we execute against Zendesk and
// return JSON the LLM folds into its reply. Secured by a shared secret header
// that only the Anam tool config carries.
import type { VercelRequest, VercelResponse } from "@vercel/node";

function zd() {
  const sub = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;
  if (!sub || !email || !token) throw new Error("Zendesk env not set");
  return {
    base: `https://${sub}.zendesk.com/api/v2`,
    auth: "Basic " + Buffer.from(`${email}/token:${token}`).toString("base64"),
  };
}

async function zdFetch(path: string, init?: RequestInit) {
  const { base, auth } = zd();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: auth, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zendesk ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const slim = (t: any) => ({
  id: t.id,
  subject: t.subject,
  status: t.status,
  priority: t.priority,
  updated_at: t.updated_at,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secret = process.env.TOOL_SHARED_SECRET;
  if (!secret || req.headers["x-tool-secret"] !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const action = String(req.query.action ?? "");
  const args = (req.body ?? {}) as Record<string, any>;

  try {
    if (action === "create_ticket") {
      const { subject, description, requester_email, requester_name, priority } = args;
      if (!subject || !description) return res.status(400).json({ error: "subject and description required" });
      const out = await zdFetch("/tickets.json", {
        method: "POST",
        body: JSON.stringify({
          ticket: {
            subject,
            comment: { body: description },
            priority: ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal",
            ...(requester_email
              ? { requester: { email: requester_email, name: requester_name ?? requester_email } }
              : {}),
            tags: ["created-by-anne"],
          },
        }),
      });
      return res.status(200).json({ ok: true, ticket: slim(out.ticket), message: `Created ticket #${out.ticket.id}` });
    }

    if (action === "search_tickets") {
      const q = String(args.query ?? "").trim();
      if (!q) return res.status(400).json({ error: "query required" });
      const out = await zdFetch(`/search.json?query=${encodeURIComponent(`type:ticket ${q}`)}&sort_by=updated_at&sort_order=desc`);
      const results = (out.results ?? []).slice(0, 5).map(slim);
      return res.status(200).json({ ok: true, count: results.length, tickets: results });
    }

    if (action === "add_note") {
      const id = parseInt(String(args.ticket_id ?? ""), 10);
      const note = String(args.note ?? "").trim();
      if (!id || !note) return res.status(400).json({ error: "ticket_id and note required" });
      const out = await zdFetch(`/tickets/${id}.json`, {
        method: "PUT",
        body: JSON.stringify({ ticket: { comment: { body: `[Anne] ${note}`, public: false } } }),
      });
      return res.status(200).json({ ok: true, ticket: slim(out.ticket), message: `Added internal note to #${id}` });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
