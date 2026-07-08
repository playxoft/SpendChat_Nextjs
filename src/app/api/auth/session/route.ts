import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { syncUserProfile } from "@/lib/identity";
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * The session bridge between Firebase (client-side) and the server.
 *
 * POST { idToken, refreshToken } — the browser sends a fresh Firebase ID token
 * on sign-in and on every hourly refresh (see `AuthBridge`), plus its long-lived
 * refresh token. We verify the ID token and store both in httpOnly cookies:
 * `__session` (read/verified by `getCurrentUser`) and `__refresh` (used to
 * re-mint an ID token once the short-lived one expires). DELETE — sign-out;
 * clears both cookies.
 */
export async function POST(request: NextRequest) {
  let idToken: string | undefined;
  let refreshToken: string | undefined;
  try {
    const body = (await request.json()) as { idToken?: string; refreshToken?: string };
    idToken = body?.idToken;
    refreshToken = body?.refreshToken;
  } catch {
    // fall through to the missing-token response
  }
  if (!idToken) {
    return Response.json({ error: "Missing idToken" }, { status: 400 });
  }

  let claims;
  try {
    claims = await verifyFirebaseIdToken(idToken);
  } catch {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Email/password accounts must verify their email before getting a session
  // (Google is always verified). Firebase itself allows unverified sign-in, so
  // we gate here — the client keeps the live user for the /verify-email flow.
  if (claims.email_verified === false) {
    return Response.json({ error: "email_not_verified" }, { status: 403 });
  }

  // Keep email/name/picture fresh for existing users (no-op for a brand-new
  // user — their row is created on first `getCurrentUser`/`resolveUser`).
  await syncUserProfile(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE, idToken, sessionCookieOptions());
  // The refresh token is what keeps the session alive for the month — re-set it
  // on every sync so its expiry slides forward with each visit.
  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, sessionCookieOptions());
  }
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(REFRESH_COOKIE);
  return Response.json({ ok: true });
}
