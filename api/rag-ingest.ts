// POST /api/rag-ingest  { personaId, title?, text? | url? }
// Stores plain-text chunks; Atlas Automated Embedding vectorizes the `chunk`
// field server-side (voyage-4-lite) — no embedding code on our side.
// Node runtime (Mongo driver needs TCP); do NOT mark as edge.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { knowledgeCollection, chunkText, htmlToText, getClient } from "./_rag.js";
import { getUserId } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: "sign in required" });

    const { personaId, title, text, url } = (req.body ?? {}) as {
      personaId?: string;
      title?: string;
      text?: string;
      url?: string;
    };

    if (!personaId) return res.status(400).json({ error: "personaId required" });

    // Only the persona's owner may add knowledge to it.
    const client = await getClient();
    const owned = await client
      .db("goblinlabs")
      .collection("personas")
      .findOne({ userId, anamPersonaId: personaId });
    if (!owned) return res.status(403).json({ error: "not your persona" });

    let raw = (text ?? "").trim();
    let sourceTitle = (title ?? "").trim();

    if (!raw && url) {
      const u = new URL(url); // throws on invalid
      if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: "http(s) URLs only" });
      const page = await fetch(u.toString(), {
        headers: { "user-agent": "GoblinLabs-KnowledgeBot/1.0" },
        redirect: "follow",
      });
      if (!page.ok) return res.status(400).json({ error: `fetch failed: ${page.status}` });
      raw = htmlToText(await page.text());
      if (!sourceTitle) sourceTitle = u.hostname + u.pathname;
    }

    if (!raw) return res.status(400).json({ error: "text or url required" });
    if (!sourceTitle) sourceTitle = raw.slice(0, 60);

    const chunks = chunkText(raw);
    if (chunks.length === 0) return res.status(400).json({ error: "no usable text" });
    if (chunks.length > 400) return res.status(400).json({ error: "source too large (max ~400 chunks)" });

    const col = await knowledgeCollection();
    const now = new Date();
    await col.insertMany(
      chunks.map((chunk, seq) => ({ personaId, sourceTitle, chunk, seq, createdAt: now })),
    );

    return res.status(200).json({ ok: true, sourceTitle, chunks: chunks.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
