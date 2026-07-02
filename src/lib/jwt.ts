import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { unauthorized } from "@/lib/errors";

/**
 * Verifies the access tokens that mobile clients send as `Authorization:
 * Bearer <jwt>`.
 *
 * The tokens are minted by Neon Auth's Better Auth JWT plugin: EdDSA
 * (Ed25519), `sub` = user id, the user object inlined as claims, and
 * `iss`/`aud` = the auth base URL. We verify the signature against the auth
 * server's public JWKS (`/.well-known/jwks.json`) — because the key is
 * asymmetric, a valid signature cryptographically proves the token came from
 * this project's auth server. Verification is stateless (no DB or upstream
 * round-trip per request); `createRemoteJWKSet` caches and rotates keys.
 */

export type AccessTokenClaims = JWTPayload & {
  sub: string;
  email?: string | null;
  name?: string | null;
};

/** `https://<project>.neonauth.…/.well-known/jwks.json` */
function jwksUrl(): URL {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new Error("NEON_AUTH_BASE_URL is not set");
  return new URL(`${base.replace(/\/$/, "")}/.well-known/jwks.json`);
}

// Cache the remote key set across requests (module scope survives per isolate).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(jwksUrl());
  return jwks;
}

/**
 * Optional issuer pinning. Signature verification alone is sufficient (the key
 * is project-specific), but setting `NEON_AUTH_JWT_ISSUER` adds a defence-in-depth
 * check once the exact issuer string is confirmed against a real token.
 */
function verifyOptions() {
  const issuer = process.env.NEON_AUTH_JWT_ISSUER;
  return issuer ? { issuer } : {};
}

/**
 * Verify a bearer JWT and return its claims. Throws a 401 `ApiError` for any
 * invalid, expired, or malformed token — never returns for a bad token.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), verifyOptions());
    if (!payload.sub) throw new Error("token has no subject");
    return payload as AccessTokenClaims;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "invalid token";
    throw unauthorized(`Invalid or expired token: ${reason}`);
  }
}
