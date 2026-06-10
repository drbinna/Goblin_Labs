// Shared MongoDB helpers for the RAG endpoints.
// NOTE: these run on Vercel's Node runtime (the Mongo driver needs TCP, which
// the edge runtime doesn't provide). Do not add `runtime: "edge"` to routes
// that import this file.
import { MongoClient, type Collection, type Document } from "mongodb";

const DB_NAME = "goblinlabs";
export const KNOWLEDGE_COLLECTION = "knowledge";
export const VECTOR_INDEX = "knowledge_auto_embed";
export const EMBED_MODEL = "voyage-4-lite";

// Cache the client across warm lambda invocations.
let clientPromise: Promise<MongoClient> | null = null;

export function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5 }).connect();
    clientPromise.catch(() => {
      clientPromise = null; // allow retry after a failed connect
    });
  }
  return clientPromise;
}

export type KnowledgeChunk = {
  personaId: string;
  sourceTitle: string;
  chunk: string; // plain text — Atlas Automated Embedding vectorizes this field
  seq: number;
  createdAt: Date;
};

export async function knowledgeCollection(): Promise<Collection<KnowledgeChunk & Document>> {
  const client = await getClient();
  return client.db(DB_NAME).collection<KnowledgeChunk & Document>(KNOWLEDGE_COLLECTION);
}

// Split text into ~1200-char chunks on paragraph/sentence boundaries with overlap.
export function chunkText(text: string, target = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + target, clean.length);
    if (end < clean.length) {
      // Prefer to break at a paragraph, then sentence, then space.
      const slice = clean.slice(start, end);
      const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
      if (breakAt > target * 0.5) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

// Idempotent setup: collection + btree index + Automated Embedding vector index.
// Safe to call repeatedly; used by /api/rag-setup since local sandboxes often
// can't open raw TCP to Atlas but Vercel can.
export async function ensureSetup(): Promise<{ steps: string[] }> {
  const steps: string[] = [];
  const client = await getClient();
  const db = client.db(DB_NAME);

  const existing = await db.listCollections({ name: KNOWLEDGE_COLLECTION }).toArray();
  if (existing.length === 0) {
    await db.createCollection(KNOWLEDGE_COLLECTION);
    steps.push(`created collection ${KNOWLEDGE_COLLECTION}`);
  } else steps.push(`collection ${KNOWLEDGE_COLLECTION} exists`);

  const col = db.collection(KNOWLEDGE_COLLECTION);
  await col.createIndex({ personaId: 1, createdAt: -1 });
  steps.push("btree index ok");

  const indexes = await col.listSearchIndexes().toArray().catch(() => [] as any[]);
  if (indexes.some((i: any) => i.name === VECTOR_INDEX)) {
    steps.push(`search index ${VECTOR_INDEX} exists`);
  } else {
    await col.createSearchIndex({
      name: VECTOR_INDEX,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "autoEmbed", path: "chunk", model: EMBED_MODEL },
          { type: "filter", path: "personaId" },
        ],
      },
    } as any);
    steps.push(`created search index ${VECTOR_INDEX} (${EMBED_MODEL}) — builds in ~1 min`);
  }
  return { steps };
}

// Very light HTML → text for URL ingestion.
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}
