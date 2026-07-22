// POST /api/mia-tools-setup — idempotent. Gives Mia (Lab Concierge) grounded
// self-service answers: attaches the shared zendesk_search_articles tool and
// appends a Help Center behavior section to her existing prompt WITHOUT
// replacing her personality (unlike anne-tools-setup, which swaps the brain
// wholesale — Mia is live on the homepage, so we merge instead of overwrite).
// Auth: signed-in user (Clerk) or the shared tool secret.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

const ANAM_BASE = "https://api.anam.ai/v1";
const MIA_ID = "77b7e33a-c096-4bb4-b70f-bdc988cf8925";
const SITE = "https://goblin-labs.vercel.app";

const HELP_MARKER = "## Help Center answers";
const HELP_SECTION = `

${HELP_MARKER}
- When a visitor asks a how-to, product, billing, account, or troubleshooting question, SEARCH ARTICLES first with keywords from their question.
- If an article answers it, reply from the article in your own words — short and conversational, this is spoken — and offer the link for the full steps.
- If no article covers it, say so plainly and suggest they reach the team through the site. Never invent an answer or a link.
- Never claim to have checked tickets or internal systems — articles are your only support source.`;

function articleToolDef(secret: string) {
  return {
    type: "SERVER_WEBHOOK",
    name: "zendesk_search_articles",
    description:
      "Search the public help center for articles answering how-to, product, billing, or troubleshooting questions. ALWAYS try this before saying you don't know — answer from the article and share its link. Returns title, url, and a snippet for the top matches.",
    config: {
      url: `${SITE}/api/zendesk-tool?action=search_articles`,
      method: "POST",
      headers: { "x-tool-secret": secret },
      awaitResponse: true,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords from the visitor's question, e.g. 'charged twice refund' or 'add persona to website'.",
          },
        },
        required: ["query"],
      },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const userId = await getUserId(req);
  const secretHeaderOk =
    !!process.env.TOOL_SHARED_SECRET &&
    req.headers["x-tool-secret"] === process.env.TOOL_SHARED_SECRET;
  if (!userId && !secretHeaderOk) return res.status(401).json({ error: "sign in required" });

  const apiKey = process.env.ANAM_API_KEY;
  const secret = process.env.TOOL_SHARED_SECRET;
  if (!apiKey) return res.status(500).json({ error: "ANAM_API_KEY not set" });
  if (!secret) return res.status(500).json({ error: "TOOL_SHARED_SECRET not set" });

  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  const steps: string[] = [];

  try {
    // 1. Find or create the shared article-search tool (Anne may already have it).
    const listRes = await fetch(`${ANAM_BASE}/tools`, { headers });
    const listBody = await listRes.json().catch(() => ({}));
    if (!listRes.ok) throw new Error(`list tools: ${listRes.status}`);
    const existing: any[] = listBody.data ?? listBody.tools ?? (Array.isArray(listBody) ? listBody : []);
    let tool = existing.find((t) => t.name === "zendesk_search_articles");
    if (!tool) {
      const createRes = await fetch(`${ANAM_BASE}/tools`, {
        method: "POST",
        headers,
        body: JSON.stringify(articleToolDef(secret)),
      });
      tool = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(`create tool: ${createRes.status} ${JSON.stringify(tool).slice(0, 200)}`);
      steps.push("created zendesk_search_articles tool");
    } else {
      steps.push("zendesk_search_articles tool exists");
    }

    // 2. Fetch Mia as she is today — merge, don't overwrite.
    const getRes = await fetch(`${ANAM_BASE}/personas/${MIA_ID}`, { headers });
    const mia = await getRes.json().catch(() => ({}));
    if (!getRes.ok) throw new Error(`get persona: ${getRes.status}`);

    const currentPrompt: string = mia.brain?.systemPrompt ?? mia.systemPrompt ?? "";
    const newPrompt = currentPrompt.includes(HELP_MARKER) ? currentPrompt : currentPrompt + HELP_SECTION;
    const currentToolIds: string[] = (mia.tools ?? []).map((t: any) => t.id ?? t).filter(Boolean);
    const toolIds = currentToolIds.includes(tool.id) ? currentToolIds : [...currentToolIds, tool.id];
    const llmId = mia.brain?.llmId ?? mia.llmId;

    const putRes = await fetch(`${ANAM_BASE}/personas/${MIA_ID}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: mia.name ?? "Mia — Lab Concierge",
        ...(llmId ? { llmId } : {}),
        toolIds,
        brain: { systemPrompt: newPrompt, ...(llmId ? { llmId } : {}) },
      }),
    });
    const putBody = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(`update persona: ${putRes.status} ${JSON.stringify(putBody).slice(0, 300)}`);
    steps.push(
      currentPrompt.includes(HELP_MARKER)
        ? "prompt already had Help Center section"
        : "appended Help Center section to Mia's prompt",
      `Mia now has ${toolIds.length} tool(s) attached`,
    );

    return res.status(200).json({ ok: true, steps, toolId: tool.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), steps });
  }
}
