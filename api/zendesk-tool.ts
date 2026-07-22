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

    if (action === "list_tickets") {
      // Real-time /tickets.json (search index lags writes by up to a minute,
      // which would show stale counts right after status changes).
      const status = String(args.status ?? "").trim().toLowerCase();
      const valid = ["new", "open", "pending", "hold", "solved", "closed"];
      const out = await zdFetch("/tickets.json?per_page=100&sort_by=updated_at&sort_order=desc");
      let tickets = (out.tickets ?? []).map(slim);
      if (valid.includes(status)) tickets = tickets.filter((t: any) => t.status === status);
      return res.status(200).json({
        ok: true,
        total_count: tickets.length,
        status: status || "all",
        tickets: tickets.slice(0, 10),
      });
    }

    if (action === "update_status") {
      // Accepts a single ticket_id or ticket_ids (array / comma-separated) for bulk.
      const rawIds = args.ticket_ids ?? args.ticket_id ?? "";
      const ids = (Array.isArray(rawIds) ? rawIds : String(rawIds).split(","))
        .map((x: any) => parseInt(String(x).trim(), 10))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      let status = String(args.status ?? "").trim().toLowerCase();
      if (ids.length === 0 || !status) return res.status(400).json({ error: "ticket_id(s) and status required" });
      // Zendesk: 'closed' cannot be set directly (solved is terminal for agents),
      // and 'hold' is not enabled on this account — map both to supported states.
      let note = "";
      if (status === "closed") { status = "solved"; note = " (Zendesk closes solved tickets automatically)"; }
      if (status === "hold") { status = "pending"; note = " (on-hold isn't enabled here; pending is the waiting state)"; }
      if (!["open", "pending", "solved"].includes(status)) {
        return res.status(400).json({ error: "status must be open, pending, solved, or closed" });
      }
      if (ids.length === 1) {
        const out = await zdFetch(`/tickets/${ids[0]}.json`, {
          method: "PUT",
          body: JSON.stringify({ ticket: { status } }),
        });
        return res.status(200).json({ ok: true, ticket: slim(out.ticket), message: `Ticket #${ids[0]} is now ${status}${note}` });
      }
      // Bulk: Zendesk processes update_many as an async job (completes in seconds).
      await zdFetch(`/tickets/update_many.json?ids=${ids.join(",")}`, {
        method: "PUT",
        body: JSON.stringify({ ticket: { status } }),
      });
      return res.status(200).json({
        ok: true,
        count: ids.length,
        message: `${ids.length} tickets (#${ids.join(", #")}) are being set to ${status}${note} — done within seconds`,
      });
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

    if (action === "search_articles") {
      // Self-service deflection: search the Help Center and hand back the top
      // articles so Anne can answer from published content and share the link,
      // instead of opening a ticket for questions an article already covers.
      const q = String(args.query ?? "").trim();
      if (!q) return res.status(400).json({ error: "query required" });
      const out = await zdFetch(`/help_center/articles/search.json?query=${encodeURIComponent(q)}&per_page=3`);
      const strip = (h: string) =>
        String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const articles = (out.results ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        url: a.html_url,
        snippet: strip(a.body).slice(0, 400),
      }));
      return res.status(200).json({
        ok: true,
        count: articles.length,
        articles,
        message: articles.length
          ? `Found ${articles.length} help center article(s) — answer from these and share the link.`
          : "No articles match — offer to create a ticket instead.",
      });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
