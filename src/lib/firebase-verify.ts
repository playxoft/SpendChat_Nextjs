import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { unauthorized } from "@/lib/errors";
import { firebaseConfig } from "@/lib/firebase-config";

/**
 * Verifies Firebase Authentication **ID tokens** — used both for the web
 * session cookie and the mobile API's `Authorization: Bearer <idToken>`.
 *
 * Firebase ID tokens are RS256 JWTs signed by Google's Secure Token service.
 * We verify them statelessly against Google's public JWKS (no `firebase-admin`,
 * which is Node-only and unfit for Cloudflare Workers) and pin the issuer +
 * audience to this project. `createRemoteJWKSet` caches + rotates the keys
 * (module scope survives per isolate), exactly like the previous Neon verifier.
 *
 * Claims of interest: `sub` = Firebase UID, plus `email`, `email_verified`,
 * `name`, `picture`. We translate the UID → our internal user id in
 * `resolveUser` (`src/lib/identity.ts`); nothing downstream sees the Firebase id.
 */

export type FirebaseTokenClaims = JWTPayload & {
  sub: string;
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  picture?: string | null;
};

/** Google's Secure Token public keys, in JWKS form (not the x509 endpoint). */
const JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

// Cache the remote key set across requests (module scope survives per isolate).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(JWKS_URL);
  return jwks;
}

function projectId(): string {
  return firebaseConfig().projectId;
}

/**
 * Verify a Firebase ID token and return its claims. Pins `alg=RS256`,
 * `iss=https://securetoken.google.com/<projectId>`, `aud=<projectId>`, and
 * requires a subject. Throws a 401 `ApiError` for any invalid/expired/malformed
 * token — never returns for a bad token.
 */
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseTokenClaims> {
  try {
    const pid = projectId();
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${pid}`,
      audience: pid,
    });
    if (!payload.sub) throw new Error("token has no subject");
    return payload as FirebaseTokenClaims;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "invalid token";
    throw unauthorized(`Invalid or expired token: ${reason}`);
  }
}
