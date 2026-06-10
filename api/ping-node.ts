// Probe: bare Node-runtime function, no imports. If this fails, the issue is
// the Node runtime setup itself, not our code.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, runtime: "node", node: process.version });
}
