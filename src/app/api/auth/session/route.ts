import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { syncUserProfile } from "@/lib/identity";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * The session bridge between Firebase (client-side) and the server.
 *
 * POST { idToken } — the browser sends a fresh Firebase ID token on sign-in and
 * on every hourly refresh (see `AuthBridge`). We verify it and store it in the
 * httpOnly `__session` cookie that server components read via `getCurrentUser`.
 * DELETE — sign-out; clears the cookie.
 */
export async function POST(request: NextRequest) {
  let idToken: string | undefined;
  try {
    const body = (await request.json()) as { idToken?: string };
    idToken = body?.idToken;
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
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
