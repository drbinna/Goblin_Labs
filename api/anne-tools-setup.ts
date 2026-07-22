// POST /api/anne-tools-setup — idempotent. Creates the Zendesk webhook tools
// at Anam (if missing), attaches them to Anne, and upgrades her prompt to a
// support role. Clerk-authenticated; triggered from the demo page.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";

const ANAM_BASE = "https://api.anam.ai/v1";
const ANNE_ID = "6b4df3c2-c9ce-49e7-a95b-8816e8216586";
const MIA_ID = "77b7e33a-c096-4bb4-b70f-bdc988cf8925";
const MIA_HELP_MARKER = "## Help Center answers";
const MIA_HELP_SECTION = `

${MIA_HELP_MARKER}
- When a visitor asks a how-to, product, billing, account, or troubleshooting question, SEARCH ARTICLES first with keywords from their question.
- If an article answers it, reply from the article in your own words — short and conversational, this is spoken — and offer the link for the full steps.
- If no article covers it, say so plainly and suggest they reach the team through the site. Never invent an answer or a link.
- Never claim to have checked tickets or internal systems — articles are your only support source.`;
const SITE = "https://goblin-labs.vercel.app";
const LLM_ID = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7"; // GPT-4o-mini — PUT replaces brain wholesale, so always resend

const PLAIN_SUPPORT_PROMPT = `You are Anne, the customer support persona for Goblin Labs. You are calm, capable, and friendly.

What you know about Goblin Labs:
- Goblin Labs is a frontier lab for building and deploying AI personas — lifelike, real-time avatars that see, hear, and speak with people in live conversation.
- The Persona Studio on the website lets anyone build a persona in minutes: pick a face and a voice, choose a role or vertical (support, lead gen, education, or custom), shape the personality, preview it live, then deploy.
- Deploying gives the persona a shareable talk link at usegoblin.xyz — anyone can open it in a browser and have a face-to-face conversation. Builders sign in to deploy and manage their personas under "My personas."
- Personas can be grounded in a builder's own knowledge so they answer from real documents instead of guessing.
- The site showcases three deployed personas: you (Anne, support), Gabriel (lead generation — captures leads and books meetings), and Mia (the lab's concierge).
- Sessions take a few seconds to connect while the avatar warms up; once live, responses feel immediate.

How to behave:
- Help visitors understand the product and how to build or deploy a persona.
- Troubleshoot the basics: microphone permission, refreshing the page, starting a new conversation, trying a different browser.
- When someone reports a problem, gather the essentials (what happened, when, what they expected), summarize it back clearly, and let them know the team will look into it.
- Be honest about your limits: you do NOT have live access to ticketing or internal systems, so never claim to have created, updated, or checked a ticket.
- Pricing isn't published yet — invite people to reach out through the site for details.
- If you don't know something, say so plainly rather than guessing.
Always respond in English unless the person clearly speaks another language first. Keep replies short and conversational — this is a spoken conversation.`;

const SUPPORT_PROMPT = `You are Anne, Goblin Labs' Zendesk support operator. You work INSIDE the lab's own Zendesk and can see and manage every ticket in it. You are not gatekeeping a customer account — never ask for an email address, account verification, or identity before looking things up. Just use your tools.

How to work:
- Asked who you are or what you can do -> give a quick, friendly plain-language rundown: you can check the queue, find tickets, open new ones, update or close them, and leave internal notes — then offer to start with a queue check. No jargon.
- "How many tickets do we have / what's open?" -> LIST tickets (optionally by status) and report the count and the notable ones.
- Asked about a specific issue or topic -> SEARCH by keywords from the conversation and report ticket number, subject, and status.
- Asked a how-to, product, billing, or troubleshooting question -> SEARCH ARTICLES first; if one answers it, reply from the article in your own words and share its link instead of opening a ticket. Only create a ticket when no article covers it or the person asks for one.
- A new problem is described -> CREATE a ticket with a clear subject and a description in your own words. Ask for a requester email ONLY if they say the ticket is on behalf of a specific customer; otherwise create it without one.
- Asked to update, close, or reopen tickets -> UPDATE status: open, pending (waiting), or solved (closing = solved). For bulk requests like "close all open tickets": first LIST the tickets with that status to get their numbers, then UPDATE them all in ONE call with the comma-separated ids, and report how many you changed.
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
      name: "zendesk_search_articles",
      description:
        "Search the public help center for articles answering how-to, product, billing, or troubleshooting questions. ALWAYS try this before creating a ticket for a question — answer from the article and share its link. Returns title, url, and a snippet for the top matches.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=search_articles`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keywords from the visitor's question, e.g. 'charged twice refund' or 'studio freezes preview'." },
          },
          required: ["query"],
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
        "Change ticket status: open, pending, or solved (closing = solved). Works on ONE ticket or MANY at once — pass ticket_ids as a comma-separated list for bulk requests like closing all open tickets.",
      config: {
        url: `${SITE}/api/zendesk-tool?action=update_status`,
        ...base.config_common,
        parameters: {
          type: "object",
          properties: {
            ticket_ids: { type: "string", description: "Ticket number(s) to update — a single id or comma-separated list, e.g. '41' or '12,15,33'" },
            status: { type: "string", description: "open, pending, solved, or closed (closed maps to solved)" },
          },
          required: ["ticket_ids", "status"],
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
        body: JSON.stringify({ name: "Anne — Support", llmId: LLM_ID, toolIds: [], brain: { systemPrompt: PLAIN_SUPPORT_PROMPT, llmId: LLM_ID } }),
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

    if (String(req.query.persona ?? "") === "mia") {
      // Mia mode: attach ONLY the article-search tool and append the Help
      // Center section — merge with her live persona, never overwrite it.
      const listResM = await fetch(`${ANAM_BASE}/tools`, { headers });
      const listBodyM = await listResM.json().catch(() => ({}));
      if (!listResM.ok) throw new Error(`list tools: ${listResM.status}`);
      const allTools: any[] = listBodyM.data ?? listBodyM.tools ?? (Array.isArray(listBodyM) ? listBodyM : []);
      const articleDef = toolDefs(secret).find((d) => d.name === "zendesk_search_articles")!;
      let artTool = allTools.find((t) => t.name === articleDef.name);
      if (!artTool) {
        const cr = await fetch(`${ANAM_BASE}/tools`, { method: "POST", headers, body: JSON.stringify(articleDef) });
        artTool = await cr.json().catch(() => ({}));
        if (!cr.ok) throw new Error(`create article tool: ${cr.status}`);
        steps.push("created zendesk_search_articles tool");
      } else steps.push("zendesk_search_articles tool exists");

      const getRes = await fetch(`${ANAM_BASE}/personas/${MIA_ID}`, { headers });
      const mia = await getRes.json().catch(() => ({}));
      if (!getRes.ok) throw new Error(`get Mia: ${getRes.status}`);
      const cur: string = mia.brain?.systemPrompt ?? mia.systemPrompt ?? "";
      const newPrompt = cur.includes(MIA_HELP_MARKER) ? cur : cur + MIA_HELP_SECTION;
      const curIds: string[] = (mia.tools ?? []).map((t: any) => t.id ?? t).filter(Boolean);
      const ids = curIds.includes(artTool.id) ? curIds : [...curIds, artTool.id];
      const miaLlm = mia.brain?.llmId ?? mia.llmId;
      const putM = await fetch(`${ANAM_BASE}/personas/${MIA_ID}`, {
        method: "PUT", headers,
        body: JSON.stringify({
          name: mia.name ?? "Mia — Lab Concierge",
          ...(miaLlm ? { llmId: miaLlm } : {}),
          toolIds: ids,
          brain: { systemPrompt: newPrompt, ...(miaLlm ? { llmId: miaLlm } : {}) },
        }),
      });
      if (!putM.ok) throw new Error(`update Mia: ${putM.status} ${(await putM.text()).slice(0, 200)}`);
      steps.push("Mia: help-center tool attached + prompt section merged");
      return res.status(200).json({ ok: true, steps, toolId: artTool.id });
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
      body: JSON.stringify({ name: "Anne — Support", llmId: LLM_ID, toolIds, brain: { systemPrompt: SUPPORT_PROMPT, llmId: LLM_ID } }),
    });
    const putBody = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(`update persona: ${putRes.status} ${JSON.stringify(putBody).slice(0, 300)}`);
    steps.push(`attached ${toolIds.length} tools to Anne + support prompt`);

    return res.status(200).json({ ok: true, steps, toolIds });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), steps });
  }
}
