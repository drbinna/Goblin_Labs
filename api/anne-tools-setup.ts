// POST /api/anne-tools-setup — idempotent. Creates the Zendesk webhook tools
// at Anam (if missing), attaches them to Anne, and upgrades her prompt to a
// support role. Clerk-authenticated; triggered from the demo page.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

const ANAM_BASE = "https://api.anam.ai/v1";
const ANNE_ID = "6b4df3c2-c9ce-49e7-a95b-8816e8216586";
const SITE = "https://goblin-labs.vercel.app";

const ORIGINAL_PROMPT = `You are Anne, a warm healthcare navigation persona built by Goblin Labs. You help people understand appointments, care plans, and general wellness questions in plain language. You are calm, empathetic, and concise. You never diagnose conditions or prescribe treatment; for anything clinical you gently suggest speaking with a clinician. Keep replies short and conversational — this is a spoken conversation.`;

const SUPPORT_PROMPT = `You are Anne, a customer support persona for Goblin Labs, integrated live with Zendesk. You can search existing tickets, create new tickets, and add internal notes using your tools.

How to work:
- When a customer describes a problem, gather the essentials conversationally: what happened, their email, and how urgent it feels. Then CREATE a ticket with a clear subject and a description summarizing the issue in your own words.
- If they ask about an existing issue, SEARCH tickets first (by their email or keywords) and tell them what you find — ticket number, status, and what's happening.
- After meaningful updates in the conversation, ADD an internal note to the relevant ticket summarizing what the customer said and what you did.
- Always tell the customer what you just did ("I've opened ticket 42 for you").
- Never invent ticket numbers or statuses — only report what your tools return. If a tool fails, say so honestly and offer to try again.
Keep replies short and conversational — this is a spoken conversation.`;

function toolDefs(secret: string) {
  const base = {
    type: "server",
    subtype: "webhook",
    config_common: {
      method: "POST",
      headers: { "x-tool-secret": secret },
      awaitResponse: true,
    },
  };
  return [
    {
      type: base.type,
      subtype: base.subtype,
      name: "zendesk_create_ticket",
      description:
        "Create a new Zendesk support ticket when the customer reports a problem or requests help that needs follow-up. Summarize the issue in the description.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=create_ticket`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Short ticket subject summarizing the issue" },
            description: { type: "string", description: "Full description of the issue in plain language" },
            requester_email: { type: "string", description: "The customer's email address, if they provided one" },
            requester_name: { type: "string", description: "The customer's name, if known" },
            priority: { type: "string", description: "low, normal, high, or urgent based on how severe it sounds" },
          },
          required: ["subject", "description"],
        },
      },
    },
    {
      type: base.type,
      subtype: base.subtype,
      name: "zendesk_search_tickets",
      description:
        "Search existing Zendesk tickets when the customer asks about a previous issue or the status of a request. Search by their email address or keywords from the issue.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=search_tickets`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search terms: the customer's email (as requester:email) or keywords" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: base.type,
      subtype: base.subtype,
      name: "zendesk_add_note",
      description:
        "Add an internal note to an existing Zendesk ticket to record what the customer said or what was done in this conversation.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=add_note`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "string", description: "The Zendesk ticket number to annotate" },
            note: { type: "string", description: "The note content summarizing the update" },
          },
          required: ["ticket_id", "note"],
        },
      },
    },
  ];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "sign in required" });

  const apiKey = process.env.ANAM_API_KEY;
  const secret = process.env.TOOL_SHARED_SECRET;
  if (!apiKey) return res.status(500).json({ error: "ANAM_API_KEY not set" });
  if (!secret) return res.status(500).json({ error: "TOOL_SHARED_SECRET not set" });
  if (!process.env.ZENDESK_SUBDOMAIN) return res.status(500).json({ error: "ZENDESK_* env not set" });

  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  const steps: string[] = [];
  const mode = String(req.query.mode ?? "setup");

  try {
    if (mode === "teardown") {
      // Restore Anne to care navigator, detach + delete our tools.
      const putRes = await fetch(`${ANAM_BASE}/personas/${ANNE_ID}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ toolIds: [], brain: { systemPrompt: ORIGINAL_PROMPT } }),
      });
      if (!putRes.ok) throw new Error(`restore persona: ${putRes.status}`);
      steps.push("Anne restored to care navigator, tools detached");

      const listRes2 = await fetch(`${ANAM_BASE}/tools`, { headers });
      const listBody2 = await listRes2.json().catch(() => ({}));
      const all: any[] = listBody2.data ?? listBody2.tools ?? (Array.isArray(listBody2) ? listBody2 : []);
      for (const name of ["zendesk_create_ticket", "zendesk_search_tickets", "zendesk_add_note"]) {
        const t = all.find((x) => x.name === name);
        if (!t) continue;
        const del = await fetch(`${ANAM_BASE}/tools/${t.id}`, { method: "DELETE", headers });
        steps.push(del.ok ? `deleted tool ${name}` : `could not delete ${name} (${del.status})`);
      }
      return res.status(200).json({ ok: true, steps });
    }

    // Existing tools (idempotency)
    const listRes = await fetch(`${ANAM_BASE}/tools`, { headers });
    const listBody = await listRes.json().catch(() => ({}));
    if (!listRes.ok) throw new Error(`list tools: ${listRes.status} ${JSON.stringify(listBody).slice(0, 200)}`);
    const existing: any[] = listBody.data ?? listBody.tools ?? (Array.isArray(listBody) ? listBody : []);

    const toolIds: string[] = [];
    for (const def of toolDefs(secret)) {
      const found = existing.find((t) => t.name === def.name);
      if (found) {
        toolIds.push(found.id);
        steps.push(`tool ${def.name} exists`);
        continue;
      }
      const createRes = await fetch(`${ANAM_BASE}/tools`, {
        method: "POST",
        headers,
        body: JSON.stringify(def),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(`create ${def.name}: ${createRes.status} ${JSON.stringify(created).slice(0, 300)}`);
      toolIds.push(created.id);
      steps.push(`created tool ${def.name}`);
    }

    // Attach to Anne + support prompt
    const putRes = await fetch(`${ANAM_BASE}/personas/${ANNE_ID}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ toolIds, brain: { systemPrompt: SUPPORT_PROMPT } }),
    });
    const putBody = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(`update persona: ${putRes.status} ${JSON.stringify(putBody).slice(0, 300)}`);
    steps.push(`attached ${toolIds.length} tools to Anne + support prompt`);

    return res.status(200).json({ ok: true, steps, toolIds });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), steps });
  }
}
