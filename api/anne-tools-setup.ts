// POST /api/anne-tools-setup — idempotent. Creates the Zendesk webhook tools
// at Anam (if missing), attaches them to Anne, and upgrades her prompt to a
// support role. Clerk-authenticated; triggered from the demo page.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

const ANAM_BASE = "https://api.anam.ai/v1";
const ANNE_ID = "6b4df3c2-c9ce-49e7-a95b-8816e8216586";
const SITE = "https://goblin-labs.vercel.app";
const LLM_ID = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7"; // GPT-4o-mini — PUT replaces brain wholesale, so always resend

const PLAIN_SUPPORT_PROMPT = `You are Anne, a customer support persona built by Goblin Labs. You listen to problems carefully, ask the right follow-up questions, summarize the issue back clearly, and explain what would happen next in a support workflow. You are calm, capable, and concise. You do not currently have live access to ticketing systems, so you never claim to have created or updated a ticket — you describe what you would do. Always respond in English unless the person clearly speaks another language first. Keep replies short and conversational — this is a spoken conversation.`;

const SUPPORT_PROMPT = `You are Anne, Goblin Labs' Zendesk support operator. You work INSIDE the lab's own Zendesk and can see and manage every ticket in it. You are not gatekeeping a customer account — never ask for an email address, account verification, or identity before looking things up. Just use your tools.

How to work:
- "How many tickets do we have / what's open?" -> LIST tickets (optionally by status) and report the count and the notable ones.
- Asked about a specific issue or topic -> SEARCH by keywords from the conversation and report ticket number, subject, and status.
- A new problem is described -> CREATE a ticket with a clear subject and a description in your own words. Ask for a requester email ONLY if they say the ticket is on behalf of a specific customer; otherwise create it without one.
- Asked to update, close, or reopen a ticket -> UPDATE its status: open, pending (waiting), or solved (closing a ticket means marking it solved).
- Worth recording -> ADD an internal note to the relevant ticket.
- Always state what you did and the ticket number. Never invent ticket numbers, counts, or statuses — only report what your tools return. If a tool fails, say so honestly and retry once.
Always respond in English unless the person clearly speaks another language first. Keep replies short and conversational — this is a spoken conversation.`;

function toolDefs(secret: string) {
  const base = {
    type: "SERVER_WEBHOOK",
    config_common: {
      method: "POST",
      headers: { "x-tool-secret": secret },
      awaitResponse: true,
    },
  };
  return [
    {
      type: base.type,
      name: "zendesk_list_tickets",
      description:
        "List tickets in the helpdesk and get the total count, optionally filtered by status (new, open, pending, hold, solved, closed). Use this whenever asked how many tickets exist or what is currently open — no email or identity needed.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=list_tickets`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", description: "Optional status filter: new, open, pending, hold, solved, or closed. Omit for all tickets." },
          },
          required: [],
        },
      },
    },
    {
      type: base.type,
      name: "zendesk_search_tickets",
      description:
        "Search tickets by keywords from the conversation (subject words, topic, product, or a requester email if one was mentioned). Use when asked about a specific issue. Never ask the user for an email just to search.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=search_tickets`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search keywords, e.g. words from the ticket subject or topic" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: base.type,
      name: "zendesk_create_ticket",
      description:
        "Create a new ticket when a new problem or request is described. Summarize the issue in the description. requester_email is optional — include it only if the ticket is on behalf of a specific customer.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=create_ticket`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Short ticket subject summarizing the issue" },
            description: { type: "string", description: "Full description of the issue in plain language" },
            requester_email: { type: "string", description: "Optional: customer email if on behalf of a specific customer" },
            requester_name: { type: "string", description: "Optional: customer name" },
            priority: { type: "string", description: "low, normal, high, or urgent based on severity" },
          },
          required: ["subject", "description"],
        },
      },
    },
    {
      type: base.type,
      name: "zendesk_update_status",
      description:
        "Change a ticket's status: open, pending, or solved. Use when asked to close a ticket (= solved), reopen one, or mark it waiting (= pending).",
      config: {
        url: `${SITE}/api/zendesk-tool?action=update_status`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "string", description: "The ticket number to update" },
            status: { type: "string", description: "open, pending, solved, or closed (closed maps to solved)" },
          },
          required: ["ticket_id", "status"],
        },
      },
    },
    {
      type: base.type,
      name: "zendesk_add_note",
      description:
        "Add an internal note to an existing ticket to record context or what was done in this conversation.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=add_note`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "string", description: "The ticket number to annotate" },
            note: { type: "string", description: "The note content" },
          },
          required: ["ticket_id", "note"],
        },
      },
    },
  ];
}

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
        body: JSON.stringify({ name: "Anne — Support", toolIds: [], brain: { systemPrompt: PLAIN_SUPPORT_PROMPT, llmId: LLM_ID } }),
      });
      if (!putRes.ok) throw new Error(`restore persona: ${putRes.status}`);
      steps.push("Anne restored to tool-less support persona, tools detached");

      const listRes2 = await fetch(`${ANAM_BASE}/tools`, { headers });
      const listBody2 = await listRes2.json().catch(() => ({}));
      const all: any[] = listBody2.data ?? listBody2.tools ?? (Array.isArray(listBody2) ? listBody2 : []);
      for (const name of ["zendesk_create_ticket", "zendesk_search_tickets", "zendesk_add_note", "zendesk_list_tickets", "zendesk_update_status"]) {
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
      body: JSON.stringify({ name: "Anne — Support", toolIds, brain: { systemPrompt: SUPPORT_PROMPT, llmId: LLM_ID } }),
    });
    const putBody = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(`update persona: ${putRes.status} ${JSON.stringify(putBody).slice(0, 300)}`);
    steps.push(`attached ${toolIds.length} tools to Anne + support prompt`);

    return res.status(200).json({ ok: true, steps, toolIds });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), steps });
  }
}
