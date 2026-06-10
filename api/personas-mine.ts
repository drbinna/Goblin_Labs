// GET  /api/personas-mine        -> list the signed-in user's personas
// POST /api/personas-mine        -> save a deployed persona { anamPersonaId, name, vertical }
// Ownership records live in Mongo (goblinlabs.personas), keyed by Clerk user id.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserId } from "./_auth.js";
import { getClient } from "./_rag.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: "sign in required" });

    const client = await getClient();
    const col = client.db("goblinlabs").collection("personas");

    if (req.method === "GET") {
      const personas = await col
        .find({ userId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      return res.status(200).json({ personas });
    }

    if (req.method === "POST") {
      const { anamPersonaId, name, vertical } = (req.body ?? {}) as {
        anamPersonaId?: string;
        name?: string;
        vertical?: string;
      };
      if (!anamPersonaId || !name) {
        return res.status(400).json({ error: "anamPersonaId and name required" });
      }
      await col.updateOne(
        { userId, anamPersonaId },
        {
          $set: { name, vertical: vertical ?? null },
          $setOnInsert: { userId, anamPersonaId, createdAt: new Date() },
        },
        { upsert: true },
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
