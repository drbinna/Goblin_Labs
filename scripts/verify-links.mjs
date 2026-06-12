#!/usr/bin/env node
// Verify that persona share links resolve to the RIGHT persona before you
// send or embed them. Checks, for each id:
//   1. the API returns the persona (link is live)
//   2. the returned id matches the requested id (no crosstalk)
//   3. avatar + voice are present (identity is complete; the Talk page will
//      refuse to render a persona that's missing either)
//
// Usage:
//   node scripts/verify-links.mjs <id-or-/p/-url> [more ids or urls...]
//   GOBLIN_BASE_URL=http://localhost:5173 node scripts/verify-links.mjs ...
//
// Exit code 0 = every link safe to send; 1 = at least one failed.

const BASE = process.env.GOBLIN_BASE_URL ?? "https://www.usegoblin.xyz";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/verify-links.mjs <personaId|/p/url> ...");
  process.exit(1);
}

// Accept raw ids, /p/<id> paths, or full URLs.
const ids = args.map((a) => {
  const m = a.match(/\/p\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : a.trim();
});

let failures = 0;

for (const id of ids) {
  const label = `${BASE}/p/${id}`;
  try {
    const res = await fetch(`${BASE}/api/personas?id=${encodeURIComponent(id)}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) {
      failures++;
      console.log(`FAIL ${label}\n     API returned ${res.status} — persona missing or deleted`);
      continue;
    }
    const p = await res.json();
    if (!p?.id) {
      failures++;
      console.log(`FAIL ${label}\n     response carried no persona id`);
      continue;
    }
    if (p.id !== id) {
      failures++;
      console.log(`FAIL ${label}\n     ID MISMATCH: asked for ${id}, got ${p.id} (${p.name ?? "?"})`);
      continue;
    }
    const avatar = p.avatar?.id;
    const voice = p.voice?.id;
    if (!avatar || !voice) {
      failures++;
      console.log(`FAIL ${label}\n     persona "${p.name}" is missing ${!avatar ? "avatar" : "voice"} — link will refuse to render`);
      continue;
    }
    const prompt = (p.brain?.systemPrompt ?? "").replace(/\s+/g, " ").slice(0, 70);
    console.log(`OK   ${label}`);
    console.log(`     name="${p.name}"  avatar=${avatar.slice(0, 8)}…  voice=${voice.slice(0, 8)}…`);
    console.log(`     prompt: ${prompt}${prompt.length >= 70 ? "…" : ""}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${label}\n     ${e?.message ?? e}`);
  }
}

console.log(`\n${ids.length - failures}/${ids.length} links verified.`);
process.exit(failures === 0 ? 0 : 1);
