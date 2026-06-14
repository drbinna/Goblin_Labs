export const config = { runtime: "edge" };

const ANAM_BASE = "https://api.anam.ai/v1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Constant-time string compare so the token check can't be timing-attacked.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// GET is public (Talk pages, demos, link verification all read personas).
// Every mutating method requires the shared write token, supplied either as
// `x-goblin-write-token: <token>` or `authorization: Bearer <token>`.
// Without PERSONAS_WRITE_TOKEN set in the environment, writes are refused
// outright rather than silently left open.
function isAuthorizedWrite(req: Request): boolean {
  const expected = process.env.PERSONAS_WRITE_TOKEN;
  if (!expected) return false;
  const header =
    req.headers.get("x-goblin-write-token") ??
    (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return header.length > 0 && safeEqual(header, expected);
}

export default async function handler(req: Request): Promise<Response> {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) return json(500, { error: "ANAM_API_KEY not set" });

  const method = req.method.toUpperCase();
  // POST (create) stays public so the sign-in-free Studio keeps working — the
  // browser can't safely hold a token anyway. The destructive operations on
  // EXISTING personas (overwrite / delete), which is how the demo personas got
  // wiped during launch, require the shared write token.
  const isProtected = method === "PUT" || method === "PATCH" || method === "DELETE";
  if (isProtected && !isAuthorizedWrite(req)) {
    return json(401, { error: "unauthorized: modifying or deleting a persona requires a valid write token" });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // Batch create: POST { batch: [personaConfig, ...] } -> per-item results.
  // Single-object POST bodies behave exactly as before.
  if (method === "POST" && !id) {
    const bodyText = await req.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      /* fall through; upstream will reject malformed JSON */
    }
    const batch = Array.isArray((parsed as { batch?: unknown[] })?.batch)
      ? ((parsed as { batch: unknown[] }).batch)
      : null;
    if (batch) {
      if (batch.length === 0 || batch.length > 20) {
        return json(400, { error: "batch must contain 1-20 persona configs" });
      }
      const results = await runBatch(batch, apiKey);
      const allOk = results.every((r) => r.ok);
      // 201 when everything created; 207 when partial so callers must check items.
      return json(allOk ? 201 : 207, { results });
    }
    return proxy(`${ANAM_BASE}/personas`, "POST", bodyText, apiKey);
  }

  const target = id
    ? `${ANAM_BASE}/personas/${encodeURIComponent(id)}`
    : `${ANAM_BASE}/personas`;
  const body =
    method !== "GET" && method !== "DELETE" ? await req.text() : undefined;
  return proxy(target, method, body, apiKey);
}

async function proxy(
  target: string,
  method: string,
  body: string | undefined,
  apiKey: string,
): Promise<Response> {
  const upstream = await fetch(target, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

type BatchItem = { ok: boolean; id?: string; name?: string; error?: string };

// Limited-concurrency fan-out so a 20-persona batch doesn't trip Anam rate
// limits; order of results matches the order of the submitted configs.
async function runBatch(configs: unknown[], apiKey: string): Promise<BatchItem[]> {
  const CONCURRENCY = 4;
  const results: BatchItem[] = new Array(configs.length);
  let next = 0;

  async function worker() {
    while (next < configs.length) {
      const i = next++;
      const cfg = configs[i] as { name?: string };
      try {
        const r = await fetch(`${ANAM_BASE}/personas`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(cfg),
        });
        const text = await r.text();
        if (!r.ok) {
          results[i] = { ok: false, name: cfg?.name, error: `${r.status}: ${text.slice(0, 200)}` };
          continue;
        }
        const p = JSON.parse(text) as { id?: string; name?: string };
        if (!p.id) {
          results[i] = { ok: false, name: cfg?.name, error: "upstream returned no persona id" };
          continue;
        }
        results[i] = { ok: true, id: p.id, name: p.name ?? cfg?.name };
      } catch (e) {
        results[i] = { ok: false, name: cfg?.name, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, configs.length) }, worker),
  );
  return results;
}
