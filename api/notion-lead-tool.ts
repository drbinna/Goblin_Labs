// POST /api/notion-lead-tool?action=...  — webhook target for Gabriel's tools.
// create_lead: new row in the Notion leads database.
// book_appointment: find lead by email, set Appointment + Status, append note.
import type { VercelRequest, VercelResponse } from "@vercel/node";

const NOTION = "https://api.notion.com/v1";
const DB_ID = "16de2fb8ebdd41528577969c2b1404f6"; // Goblin Labs — Leads (Gabriel)

function headers() {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error("NOTION_API_TOKEN not set");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}

const rt = (s: string) => [{ type: "text", text: { content: String(s).slice(0, 1900) } }];

async function nf(path: string, init?: RequestInit) {
  const res = await fetch(`${NOTION}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion ${res.status}: ${JSON.stringify(body?.message ?? body).slice(0, 200)}`);
  return body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const secret = process.env.TOOL_SHARED_SECRET;
  if (!secret || req.headers["x-tool-secret"] !== secret) return res.status(401).json({ error: "unauthorized" });

  const action = String(req.query.action ?? "");
  const args = (req.body ?? {}) as Record<string, any>;

  try {
    if (action === "create_lead") {
      const { name, email, company, need, priority } = args;
      if (!name || !email) return res.status(400).json({ error: "name and email required" });
      const page = await nf("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: DB_ID },
          properties: {
            Name: { title: rt(name) },
            Email: { email: String(email) },
            ...(company ? { Company: { rich_text: rt(company) } } : {}),
            ...(need ? { Need: { rich_text: rt(need) } } : {}),
            Priority: { select: { name: ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal" } },
            Status: { select: { name: "New" } },
          },
        }),
      });
      return res.status(200).json({ ok: true, lead_id: page.id, message: `Lead created for ${name}` });
    }

    if (action === "book_appointment") {
      const { email, datetime, notes } = args;
      if (!email || !datetime) return res.status(400).json({ error: "email and datetime required" });
      const found = await nf(`/databases/${DB_ID}/query`, {
        method: "POST",
        body: JSON.stringify({
          filter: { property: "Email", email: { equals: String(email) } },
          page_size: 1,
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        }),
      });
      const page = found.results?.[0];
      if (!page) return res.status(404).json({ error: `No lead found for ${email} — create the lead first.` });
      await nf(`/pages/${page.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          properties: {
            Appointment: { date: { start: String(datetime) } },
            Status: { select: { name: "Meeting booked" } },
            ...(notes ? { Notes: { rich_text: rt(notes) } } : {}),
          },
        }),
      });
      return res.status(200).json({ ok: true, message: `Appointment booked for ${email} at ${datetime}` });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
