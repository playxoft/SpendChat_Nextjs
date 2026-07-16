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

/**
 * Fail-closed email-verification gate: a token that carries an email must carry
 * `email_verified: true` (Google always does; email/password gets it after the
 * verify-email flow). Checking `=== false` instead would pass a token where the
 * claim is merely absent. Applied at every trust boundary — the session route,
 * the API bearer path, and both `getCurrentUser` verify paths.
 */
export function hasVerifiedEmail(claims: FirebaseTokenClaims): boolean {
  return !claims.email || claims.email_verified === true;
}

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

/**
 * Exchange a Firebase **refresh token** for a fresh ID token via Google's Secure
 * Token REST API. This is how the web session survives past the ID token's ~1h
 * life without `firebase-admin` (which is Node-only, unfit for Workers): the
 * refresh token is long-lived, so `getCurrentUser` re-mints an ID token from it
 * whenever the cookie's token has expired. Throws a 401 if the refresh token is
 * revoked/invalid (password change, sign-out elsewhere) → reads as signed-out.
 */
export async function refreshFirebaseIdToken(
  refreshToken: string,
): Promise<{ idToken: string; refreshToken: string }> {
  const { apiKey } = firebaseConfig();
  let res: Response;
  try {
    res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
  } catch {
    throw unauthorized("could not reach the token service");
  }
  if (!res.ok) throw unauthorized("refresh token rejected");
  const data = (await res.json()) as { id_token?: string; refresh_token?: string };
  if (!data.id_token) throw unauthorized("token service returned no id_token");
  return { idToken: data.id_token, refreshToken: data.refresh_token ?? refreshToken };
}
