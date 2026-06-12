export const config = { runtime: "edge" };

const ANAM_BASE = "https://api.anam.ai/v1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async function handler(req: Request): Promise<Response> {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) return json(500, { error: "ANAM_API_KEY not set" });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // Batch create: POST { batch: [personaConfig, ...] } -> per-item results.
  // Single-object POST bodies behave exactly as before.
  if (req.method === "POST" && !id) {
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
    req.method !== "GET" && req.method !== "DELETE" ? await req.text() : undefined;
  return proxy(target, req.method, body, apiKey);
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
