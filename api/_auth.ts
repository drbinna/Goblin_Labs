// Clerk JWT verification for API routes. Uses Clerk's public JWKS, so no
// secret key is needed server-side for verification.
import type { VercelRequest } from "@vercel/node";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER =
  process.env.CLERK_ISSUER ?? "https://clerk.usegoblin.xyz";

const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

// Returns the Clerk user id, or null if the request isn't authenticated.
export async function getUserId(req: VercelRequest): Promise<string | null> {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
