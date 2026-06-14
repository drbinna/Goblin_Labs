// Minimal Notion "create lead" helper, used by /api/lead-capture to promote a
// captured contact into the Goblin Labs — Leads (Gabriel) database. Kept
// separate from notion-lead-tool.ts (the Anam webhook target) so the live tool
// stays untouched; both point at the same database.
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

export type NotionLeadInput = {
  name: string;
  email: string;
  company?: string;
  need?: string;
  priority?: string;
};

// Creates a Notion row and returns its page id. Throws on failure so callers
// can decide whether to treat the CRM sync as best-effort.
export async function createNotionLead(input: NotionLeadInput): Promise<string> {
  const { name, email, company, need, priority } = input;
  const res = await fetch(`${NOTION}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: DB_ID },
      properties: {
        Name: { title: rt(name) },
        Email: { email: String(email) },
        ...(company ? { Company: { rich_text: rt(company) } } : {}),
        ...(need ? { Need: { rich_text: rt(need) } } : {}),
        Priority: {
          select: {
            name: ["low", "normal", "high", "urgent"].includes(priority ?? "")
              ? (priority as string)
              : "normal",
          },
        },
        Status: { select: { name: "New" } },
      },
    }),
  });
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${JSON.stringify(body?.message ?? body).slice(0, 200)}`);
  }
  return body.id as string;
}
