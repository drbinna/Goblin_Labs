// One-time setup for the RAG knowledge base.
// Usage: MONGODB_URI=... node scripts/setup-rag.mjs
// Creates the goblinlabs.knowledge collection and an Automated Embedding
// vector index (Atlas embeds the `chunk` text field with voyage-4-lite at
// index-time and embeds query text at query-time).
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

const DB = "goblinlabs";
const COL = "knowledge";
const INDEX = "knowledge_auto_embed";
const MODEL = "voyage-4-lite";

const client = new MongoClient(uri);
await client.connect();
console.log("connected ✓");

const db = client.db(DB);
const existing = await db.listCollections({ name: COL }).toArray();
if (existing.length === 0) {
  await db.createCollection(COL);
  console.log(`created collection ${DB}.${COL} ✓`);
} else {
  console.log(`collection ${DB}.${COL} already exists ✓`);
}

const col = db.collection(COL);

// Regular index to make personaId filtering + management queries fast.
await col.createIndex({ personaId: 1, createdAt: -1 });
console.log("btree index on personaId ✓");

// Automated Embedding vector index: type autoEmbed on the text field.
const indexes = await col.listSearchIndexes().toArray().catch(() => []);
if (indexes.some((i) => i.name === INDEX)) {
  console.log(`search index ${INDEX} already exists ✓`);
} else {
  await col.createSearchIndex({
    name: INDEX,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "autoEmbed", path: "chunk", model: MODEL, modality: "text" },
        { type: "filter", path: "personaId" },
      ],
    },
  });
  console.log(`created search index ${INDEX} (model: ${MODEL}) ✓ (build takes ~1 min)`);
}

await client.close();
console.log("done");
