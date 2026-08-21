/**
 * The httpOnly cookies that carry the Firebase session to the server.
 *
 * Firebase Auth is client-side; server components/route handlers can't call the
 * client SDK. So after sign-in (and on every hourly token refresh) the browser
 * posts its fresh ID token to `POST /api/auth/session`, which sets `__session`.
 * `getCurrentUser` reads + verifies it with `jose`.
 *
 * The ID token lives only ~1 hour, so on its own the user would be bounced to
 * sign-in an hour after closing the app. To keep the session alive for a month,
 * the browser also posts its long-lived Firebase **refresh token**, stored in
 * `__refresh`. When the ID token is expired, `getCurrentUser` re-mints one from
 * the refresh token server-side (Google's Secure Token REST API).
 *
 * Cookie WRITES only ever happen in the `/api/auth/session` route handler —
 * never during render (Next forbids it, and there's no edge middleware on
 * Workers).
 */
export const SESSION_COOKIE = "__session";
export const REFRESH_COOKIE = "__refresh";

/**
 * A **non-httpOnly** breadcrumb saying "this browser has a session", set and
 * cleared alongside `__session`.
 *
 * It carries no token and no identity — just `"1"`. It exists because the
 * marketing landing page is statically rendered and must stay that way (see
 * AGENTS.md § SEO): it has no server-side auth, and the real session cookies
 * are httpOnly, so nothing on that page can otherwise tell a signed-in visitor
 * from a stranger. Reading this synchronously in the browser lets `/` offer
 * "go to the app" without a DB call, an auth round-trip, or giving up static
 * rendering.
 *
 * **Never gate access on this.** It is a UI hint that any visitor can forge
 * from the console. Every real authorisation decision goes through
 * `getCurrentUser`/`requireUser`, which verify the signed `__session` token.
 * The worst a forged value can do is show someone a "go to the app" prompt,
 * and `/app` then bounces them to sign-in exactly as it would have anyway.
 */
export const SESSION_HINT_COOKIE = "sc_signed_in";

// Keep users signed in for a month; the refresh token re-mints ID tokens for the
// whole window, and each visit re-sets the cookies (sliding expiration).
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Options for `SESSION_HINT_COOKIE`: identical to the session cookies' — same
 * expiry, so the hint disappears exactly when the session does — except that
 * the browser must be able to read it.
 */
export function sessionHintCookieOptions(maxAge: number = THIRTY_DAYS) {
  return { ...sessionCookieOptions(maxAge), httpOnly: false };
}

export function sessionCookieOptions(maxAge: number = THIRTY_DAYS) {
  return {
    httpOnly: true,
    // Fail closed: only plain `next dev` may drop Secure. Deriving this from
    // NODE_ENV === "production" would silently ship insecure cookies whenever a
    // deployed environment sets the var to anything else.
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
