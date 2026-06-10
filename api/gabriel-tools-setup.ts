// POST /api/gabriel-tools-setup[?mode=teardown] — idempotent wiring for the
// lead-gen persona. Creates Notion webhook tools at Anam, attaches to Gabriel
// with a lead-gen prompt. Teardown detaches/deletes tools and leaves a
// tool-less lead-gen prompt (his positioning is permanent; the wiring isn't).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

const ANAM_BASE = "https://api.anam.ai/v1";
const GABRIEL_ID = "b62e6dbb-cee3-4787-9c6b-9a2ea5e2d557";
const SITE = "https://goblin-labs.vercel.app";
const LLM_ID = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7"; // GPT-4o-mini — PUT replaces brain wholesale, so always resend

const LEADGEN_PROMPT_TOOLS = `You are Gabriel, a lead-generation persona for Goblin Labs, connected live to the CRM. Your job: have a natural conversation with a prospect, understand what they need, capture them as a lead, and book a meeting.

How to work:
- Converse first, capture second. Learn their name, email, company, and what they're trying to solve before reaching for tools. Ask for the email naturally and confirm the spelling back to them.
- Once you have name + email + need, CREATE the lead with a priority that matches how urgent they sound.
- Then offer to set up a meeting. When they give a time, convert it to an ISO 8601 datetime and BOOK the appointment against their email.
- Always tell them what you did ("You're in the system — I've got us down for Thursday at 2").
- Never invent CRM state; only report what your tools return. If a tool fails, say so and offer to retry.
Always respond in English unless the person clearly speaks another language first. Keep replies short and conversational — this is a spoken conversation.`;

const LEADGEN_PROMPT_PLAIN = `You are Gabriel, a lead-generation persona for Goblin Labs. You have natural conversations with prospects, understand what they need, collect their name, email, and company, and offer to set up a meeting with the team. You are warm, sharp, and never pushy. Always respond in English unless the person clearly speaks another language first. Keep replies short and conversational — this is a spoken conversation.`;

function toolDefs(secret: string) {
  const common = { method: "POST", headers: { "x-tool-secret": secret }, awaitResponse: true };
  return [
    {
      type: "SERVER_WEBHOOK",
      name: "crm_create_lead",
      description:
        "Create a new lead in the CRM once you have the prospect's name, email, and what they need. Use a priority matching how urgent or high-value they sound.",
      config: {
        url: `${SITE}/api/notion-lead-tool?action=create_lead`,
        ...common,
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "The prospect's full name" },
            email: { type: "string", description: "The prospect's email address, confirmed with them" },
            company: { type: "string", description: "Their company or organization, if mentioned" },
            need: { type: "string", description: "One or two sentences on what they need, in your words" },
            priority: { type: "string", description: "low, normal, high, or urgent" },
          },
          required: ["name", "email"],
        },
      },
    },
    {
      type: "SERVER_WEBHOOK",
      name: "crm_book_appointment",
      description:
        "Book a meeting for an existing lead after they agree on a time. Requires the lead to have been created first. Convert spoken times to ISO 8601.",
      config: {
        url: `${SITE}/api/notion-lead-tool?action=book_appointment`,
        ...common,
        parameters: {
          type: "object",
          properties: {
            email: { type: "string", description: "The lead's email address used when creating the lead" },
            datetime: { type: "string", description: "Meeting time as ISO 8601 datetime, e.g. 2026-06-12T14:00:00-07:00" },
            notes: { type: "string", description: "Optional context for the meeting" },
          },
          required: ["email", "datetime"],
        },
      },
    },
  ];
}

const TOOL_NAMES = ["crm_create_lead", "crm_book_appointment"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  // Auth: a signed-in user (demo page button) OR the shared tool secret
  // (operator trigger) — same trust level as the tool webhooks themselves.
  const userId = await getUserId(req);
  const secretHeaderOk =
    !!process.env.TOOL_SHARED_SECRET &&
    req.headers["x-tool-secret"] === process.env.TOOL_SHARED_SECRET;
  if (!userId && !secretHeaderOk) return res.status(401).json({ error: "sign in required" });

  const apiKey = process.env.ANAM_API_KEY;
  const secret = process.env.TOOL_SHARED_SECRET;
  if (!apiKey) return res.status(500).json({ error: "ANAM_API_KEY not set" });
  if (!secret) return res.status(500).json({ error: "TOOL_SHARED_SECRET not set" });
  if (!process.env.NOTION_API_TOKEN) return res.status(500).json({ error: "NOTION_API_TOKEN not set" });

  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  const steps: string[] = [];
  const mode = String(req.query.mode ?? "setup");

  try {
    const listRes = await fetch(`${ANAM_BASE}/tools`, { headers });
    const listBody = await listRes.json().catch(() => ({}));
    if (!listRes.ok) throw new Error(`list tools: ${listRes.status}`);
    const existing: any[] = listBody.data ?? listBody.tools ?? (Array.isArray(listBody) ? listBody : []);

    if (mode === "teardown") {
      const putRes = await fetch(`${ANAM_BASE}/personas/${GABRIEL_ID}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ llmId: LLM_ID, toolIds: [], brain: { systemPrompt: LEADGEN_PROMPT_PLAIN, llmId: LLM_ID } }),
      });
      if (!putRes.ok) throw new Error(`restore persona: ${putRes.status}`);
      steps.push("Gabriel detached from tools (lead-gen prompt kept)");
      for (const name of TOOL_NAMES) {
        const t = existing.find((x) => x.name === name);
        if (!t) continue;
        const del = await fetch(`${ANAM_BASE}/tools/${t.id}`, { method: "DELETE", headers });
        steps.push(del.ok ? `deleted tool ${name}` : `could not delete ${name} (${del.status})`);
      }
      return res.status(200).json({ ok: true, steps });
    }

    const toolIds: string[] = [];
    for (const def of toolDefs(secret)) {
      const found = existing.find((t) => t.name === def.name);
      if (found) {
        toolIds.push(found.id);
        steps.push(`tool ${def.name} exists`);
        continue;
      }
      const createRes = await fetch(`${ANAM_BASE}/tools`, { method: "POST", headers, body: JSON.stringify(def) });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(`create ${def.name}: ${createRes.status} ${JSON.stringify(created).slice(0, 300)}`);
      toolIds.push(created.id);
      steps.push(`created tool ${def.name}`);
    }

    const putRes = await fetch(`${ANAM_BASE}/personas/${GABRIEL_ID}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "Gabriel — Lead Gen", llmId: LLM_ID, toolIds, brain: { systemPrompt: LEADGEN_PROMPT_TOOLS, llmId: LLM_ID } }),
    });
    if (!putRes.ok) {
      const b = await putRes.json().catch(() => ({}));
      throw new Error(`update persona: ${putRes.status} ${JSON.stringify(b).slice(0, 300)}`);
    }
    steps.push(`attached ${toolIds.length} tools to Gabriel + lead-gen prompt`);
    return res.status(200).json({ ok: true, steps, toolIds });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), steps });
  }
}
