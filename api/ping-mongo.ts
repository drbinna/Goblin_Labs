// Probe: imports the mongodb driver but never connects. If ping-node works and
// this fails, the crash is the driver import/bundling.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MongoClient } from "mongodb";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, driverLoaded: typeof MongoClient === "function", uriSet: Boolean(process.env.MONGODB_URI) });
}
