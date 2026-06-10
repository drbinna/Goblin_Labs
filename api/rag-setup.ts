// POST /api/rag-setup — idempotent: creates the knowledge collection and the
// Automated Embedding vector index. Exists because dev sandboxes often can't
// open raw TCP to Atlas, but Vercel's Node runtime can. Safe to re-run.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureSetup } from "./_rag";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { steps } = await ensureSetup();
    return res.status(200).json({ ok: true, steps });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
