export const config = { runtime: "edge" };

const ANAM_BASE = "https://api.anam.ai/v1";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANAM_API_KEY not set" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = await fetch(`${ANAM_BASE}/voices`, {
    headers: { authorization: `Bearer ${apiKey}` },
    // Anam's voice catalog rarely changes; let the Vercel runtime cache the upstream
    // fetch too so a hot edge can skip the round-trip entirely.
    // @ts-expect-error - Vercel edge fetch supports `next.revalidate`
    next: { revalidate: 600 },
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "application/json",
      // Edge CDN: serve cached for 5 min, allow stale for 30 min while revalidating.
      // Browsers: trust the edge, don't cache locally (so admins see changes promptly).
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
