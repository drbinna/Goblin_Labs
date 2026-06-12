// Node runtime (NOT edge): Anam one-shot avatar creation can take 30s–2min,
// and Edge functions are hard-killed if they haven't responded within ~25s.
// Node + maxDuration (set in vercel.json) gives this route up to 5 minutes.
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ANAM_BASE = "https://api.anam.ai/v1";

// @vercel/node's helpers parse json/urlencoded/text bodies into req.body but
// leave multipart on the stream. Handle both: use req.body when populated,
// otherwise read raw bytes so the multipart boundary survives untouched.
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANAM_API_KEY not set" });
    return;
  }

  const contentType = req.headers["content-type"] || "";
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
  };
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "DELETE") {
    const raw = await readRawBody(req);
    if (contentType.startsWith("multipart/form-data")) {
      init.body = new Uint8Array(raw);
      headers["content-type"] = contentType; // keep the boundary intact
    } else {
      init.body = raw.toString("utf8");
      headers["content-type"] = "application/json";
    }
    init.duplex = "half"; // required by Node's fetch when sending a body
  }

  const upstream = await fetch(`${ANAM_BASE}/avatars`, init);
  const text = await upstream.text();

  // Only cache idempotent reads. Writes/deletes must always go upstream.
  const isRead = req.method === "GET";
  const cacheControl = isRead
    ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
    : "no-store";

  res.status(upstream.status);
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", cacheControl);
  res.send(text);
}
