import "server-only";
import { ensureBootstrap, getUserSettings, type SessionUser } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";
import { verifyAccessToken } from "@/lib/jwt";

/**
 * Authentication for the mobile REST API (`/api/v1/*`).
 *
 * Unlike the web app — which reads the Neon Auth session cookie via
 * `getCurrentUser()` — mobile clients authenticate with a bearer JWT
 * (`Authorization: Bearer <token>`). This mirrors the app's `requireUser()` /
 * `getAppContext()` helpers but returns 401s (never a redirect), which is the
 * correct behaviour for an API.
 */

/** Extract the `Authorization: Bearer <token>` value, or null. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Resolve the authenticated user from the bearer token, or 401. */
export async function requireApiUser(request: Request): Promise<SessionUser> {
  const token = getBearerToken(request);
  if (!token) throw unauthorized("Missing bearer token");
  const claims = await verifyAccessToken(token);
  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    name: (claims.name as string | undefined) ?? null,
  };
}

/**
 * Resolve the authenticated user + their settings, bootstrapping defaults on
 * first use. The API analogue of `getAppContext()`.
 */
export async function getApiContext(request: Request) {
  const user = await requireApiUser(request);
  await ensureBootstrap(user.id);
  const settings = await getUserSettings(user.id);
  return { user, settings };
}
