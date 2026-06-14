// Shared MongoDB helper for the leads collection.
// Runs on Vercel's Node runtime (the Mongo driver needs TCP). Reuses the
// cached client from _rag so we don't open a second connection pool.
import type { Collection, Document } from "mongodb";
import { getClient } from "./_rag";

const DB_NAME = "goblinlabs";
export const LEADS_COLLECTION = "leads";

export type LeadUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

export type Lead = {
  visitorId: string; // anonymous, stable per browser — the primary key
  personaId: string | null;
  status: "visited" | "contact_captured";
  // attribution (captured at landing)
  referrer?: string;
  utm?: LeadUtm;
  userAgent?: string;
  // contact (captured via the typed card or, later, an avatar prefill)
  name?: string;
  email?: string;
  company?: string;
  need?: string;
  emailValid?: boolean;
  // CRM sync
  notionPageId?: string;
  syncedToNotion?: boolean;
  // timestamps
  firstSeenAt: Date;
  lastSeenAt: Date;
  capturedAt?: Date;
};

let indexesReady: Promise<void> | null = null;

export async function leadsCollection(): Promise<Collection<Lead & Document>> {
  const client = await getClient();
  const coll = client.db(DB_NAME).collection<Lead & Document>(LEADS_COLLECTION);
  // Ensure indexes once per warm lambda. createIndex is idempotent and cheap.
  if (!indexesReady) {
    indexesReady = Promise.all([
      coll.createIndex({ visitorId: 1 }, { unique: true }),
      coll.createIndex({ email: 1 }, { sparse: true }),
      coll.createIndex({ personaId: 1, firstSeenAt: -1 }),
    ])
      .then(() => undefined)
      .catch((e) => {
        indexesReady = null; // let a later request retry index creation
        throw e;
      });
  }
  await indexesReady.catch(() => {}); // don't block writes if index build races
  return coll;
}
