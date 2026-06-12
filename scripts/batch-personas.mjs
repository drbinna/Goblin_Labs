#!/usr/bin/env node
// Batch-create personas and print their share links.
//
// Usage:
//   node scripts/batch-personas.mjs personas.json
//   GOBLIN_BASE_URL=http://localhost:5173 node scripts/batch-personas.mjs personas.json
//
// personas.json is an array of persona configs:
// [
//   {
//     "name": "Acme Concierge",
//     "systemPrompt": "You are Acme Inc's website concierge. ...",
//     "avatarId": "30fa96d0-26c4-4e55-94a0-517025942e18",
//     "voiceId": "6bfbe25a-979d-40f3-a92b-5394170af54b",
//     "llmId": "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7"
//   }
// ]
// llmId and avatarModel are optional (sensible defaults applied here).

import { readFileSync } from "node:fs";

const BASE = process.env.GOBLIN_BASE_URL ?? "https://www.usegoblin.xyz";
const DEFAULT_LLM_ID = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7";
const DEFAULT_AVATAR_MODEL = "cara-3";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/batch-personas.mjs <personas.json>");
  process.exit(1);
}

const specs = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(specs) || specs.length === 0 || specs.length > 20) {
  console.error("personas.json must be an array of 1-20 persona configs");
  process.exit(1);
}

for (const [i, s] of specs.entries()) {
  for (const field of ["name", "systemPrompt", "avatarId", "voiceId"]) {
    if (!s[field]) {
      console.error(`spec[${i}] (${s.name ?? "unnamed"}) is missing required field: ${field}`);
      process.exit(1);
    }
  }
}

const batch = specs.map((s) => ({
  llmId: DEFAULT_LLM_ID,
  avatarModel: DEFAULT_AVATAR_MODEL,
  ...s,
}));

console.log(`Creating ${batch.length} persona(s) via ${BASE}/api/personas ...`);
const res = await fetch(`${BASE}/api/personas`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ batch }),
});
const text = await res.text();
if (!res.ok && res.status !== 207) {
  console.error(`batch create failed: ${res.status}\n${text.slice(0, 500)}`);
  process.exit(1);
}

const { results } = JSON.parse(text);
let failures = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`  OK   ${r.name}\n       ${BASE}/p/${r.id}`);
  } else {
    failures++;
    console.log(`  FAIL ${r.name ?? "(unnamed)"} — ${r.error}`);
  }
}

console.log(`\n${results.length - failures}/${results.length} created.`);
if (failures === 0) {
  console.log("Verify the links before sending:");
  console.log(
    `  node scripts/verify-links.mjs ${results.map((r) => r.id).join(" ")}`,
  );
} else {
  process.exit(1);
}
