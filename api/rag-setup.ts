// POST /api/rag-setup — idempotent setup. Dynamic import so any module-load
// error in _rag surfaces as JSON instead of FUNCTION_INVOCATION_FAILED.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { ensureSetup } = await import("./_rag.js");
    const { steps } = await ensureSetup();
    return res.status(200).json({ ok: true, steps });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e), stack: (e?.stack ?? "").split("\n").slice(0, 4) });
  }
}
