import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { hasVerifiedEmail, verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { syncUserProfile } from "@/lib/identity";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Login-CSRF guard: a cross-site page must never set (or clear) the session
 * cookies — a hostile page could otherwise silently log the victim into the
 * attacker's account with a `text/plain` POST that skips the CORS preflight.
 * Browsers send `Sec-Fetch-Site` on every fetch (and `Origin` on POSTs);
 * a request with neither header comes from a non-browser client, which carries
 * no ambient cookies to abuse.
 */
function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/**
 * The session bridge between Firebase (client-side) and the server.
 *
 * POST { idToken, refreshToken } — the browser sends a fresh Firebase ID token
 * on sign-in and on every hourly refresh (see `AuthBridge`), plus its long-lived
 * refresh token. We verify the ID token and store both in httpOnly cookies:
 * `__session` (read/verified by `getCurrentUser`) and `__refresh` (used to
 * re-mint an ID token once the short-lived one expires). DELETE — sign-out;
 * clears both cookies.
 *
 * Known limitation: sign-out clears cookies only — it does NOT revoke the
 * Firebase refresh token server-side (that needs admin credentials, which this
 * Workers deployment doesn't hold). A stolen `__refresh` value stays usable
 * until Firebase expires/rotates it; "sign out everywhere" is not supported.
 */
export async function POST(request: NextRequest) {
  // Establish the request log context (this route bypasses the `handle()` seam),
  // so the syncUserProfile write below and any error carry requestId + platform.
  return withRequestContext("web", async () => {
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
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
    if (!hasVerifiedEmail(claims)) {
      return Response.json({ error: "email_not_verified" }, { status: 403 });
    }

    // Keep email/name/picture fresh for existing users (no-op for a brand-new
    // user — their row is created on first `getCurrentUser`/`resolveUser`).
    const userId = await syncUserProfile(claims);
    if (userId) setLogContext({ userId });
    const store = await cookies();
    store.set(SESSION_COOKIE, idToken, sessionCookieOptions());
    // The refresh token is what keeps the session alive for the month — re-set it
    // on every sync so its expiry slides forward with each visit.
    if (refreshToken) {
      store.set(REFRESH_COOKIE, refreshToken, sessionCookieOptions());
    }
    return Response.json({ ok: true });
  });
}

export async function DELETE(request: NextRequest) {
  return withRequestContext("web", async () => {
    // Same gate as POST: a cross-site page shouldn't be able to force-log-out.
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    store.delete(REFRESH_COOKIE);
    return Response.json({ ok: true });
  });
}
