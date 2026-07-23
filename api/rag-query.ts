// POST /api/rag-query  { personaId, query, k? }
// Atlas Automated Embedding lets $vectorSearch take the raw text query and
// embed it server-side with the same model as the index. Node runtime.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { knowledgeCollection, VECTOR_INDEX, getClient } from "./_rag.js";
import { getUserId } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { personaId, query, k } = (req.body ?? {}) as {
      personaId?: string;
      query?: string;
      k?: number;
    };
    if (!personaId) return res.status(400).json({ error: "personaId required" });
    if (!query?.trim()) return res.status(400).json({ error: "query required" });

    // A persona's knowledge base is private to its owner. Callers must either
    // be the signed-in owner, or present the server-to-server tool secret (for
    // when this is wired as an Anam persona tool). Anonymous access is refused
    // so nobody can dump another operator's ingested documents.
    const toolSecret = process.env.TOOL_SHARED_SECRET;
    const viaTool = !!toolSecret && req.headers["x-tool-secret"] === toolSecret;
    if (!viaTool) {
      const userId = await getUserId(req);
      if (!userId) return res.status(401).json({ error: "sign in required" });
      const owned = await (await getClient())
        .db("goblinlabs")
        .collection("personas")
        .findOne({ userId, anamPersonaId: personaId });
      if (!owned) return res.status(403).json({ error: "not your persona" });
    }

    const limit = Math.min(Math.max(k ?? 4, 1), 10);
    const col = await knowledgeCollection();

    const results = await col
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "chunk",
            query: query.trim(), // raw text — embedded server-side by Atlas
            numCandidates: limit * 15,
            limit,
            filter: { personaId },
          },
        },
        {
          $project: {
            _id: 0,
            chunk: 1,
            sourceTitle: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    return res.status(200).json({ results });
  } catch (e: any) {
    console.error("[rag-query]", e?.message ?? e);
    return res.status(500).json({ error: "query failed" });
  }
}
