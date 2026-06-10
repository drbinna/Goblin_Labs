// POST /api/rag-query  { personaId, query, k? }
// Atlas Automated Embedding lets $vectorSearch take the raw text query and
// embed it server-side with the same model as the index. Node runtime.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { knowledgeCollection, VECTOR_INDEX } from "./_rag.js";

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
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
