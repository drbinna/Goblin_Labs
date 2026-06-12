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
      const body = (req.body ?? {}) as {
        anamPersonaId?: string;
        name?: string;
        vertical?: string;
        personas?: { anamPersonaId?: string; name?: string; vertical?: string }[];
      };
      // Accept either a single record (back-compat) or { personas: [...] }.
      const items = Array.isArray(body.personas)
        ? body.personas
        : body.anamPersonaId
          ? [body]
          : [];
      if (items.length === 0 || items.length > 50) {
        return res.status(400).json({
          error: "provide anamPersonaId+name, or personas: [1-50 records]",
        });
      }
      const invalid = items.find((p) => !p.anamPersonaId || !p.name);
      if (invalid) {
        return res.status(400).json({ error: "every record needs anamPersonaId and name" });
      }
      const now = new Date();
      await col.bulkWrite(
        items.map((p) => ({
          updateOne: {
            filter: { userId, anamPersonaId: p.anamPersonaId },
            update: {
              $set: { name: p.name, vertical: p.vertical ?? null },
              $setOnInsert: { userId, anamPersonaId: p.anamPersonaId, createdAt: now },
            },
            upsert: true,
          },
        })),
      );
      return res.status(200).json({ ok: true, saved: items.length });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
