export const config = { runtime: "edge" };

const ANAM_BASE = "https://api.anam.ai/v1";

export default async function handler(req: Request): Promise<Response> {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANAM_API_KEY not set" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const contentType = req.headers.get("content-type") || "";
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
  };
  const init: RequestInit = { method: req.method, headers };

  if (req.method !== "GET" && req.method !== "DELETE") {
    if (contentType.startsWith("multipart/form-data")) {
      // Forward the multipart body byte-for-byte, preserving the boundary
      init.body = await req.arrayBuffer();
      headers["content-type"] = contentType;
    } else {
      init.body = await req.text();
      headers["content-type"] = "application/json";
    }
  }

  const upstream = await fetch(`${ANAM_BASE}/avatars`, init);
  const text = await upstream.text();

  // The catalog (≈10 avatars) is near-static, but the upstream Anam call is slow
  // (~3s). Serve fresh for 10 min, then serve the cached copy instantly for up to
  // a day while revalidating in the background — so users almost never wait on it.
  // New custom avatars still show immediately because the uploading client adds
  // them locally; the shared cache catches up within the window.
  const cacheControl = isRead
    ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
    : "no-store";

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "application/json",
      "cache-control": cacheControl,
    },
  });
}
