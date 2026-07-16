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

// Keep users signed in for a month; the refresh token re-mints ID tokens for the
// whole window, and each visit re-sets the cookies (sliding expiration).
const THIRTY_DAYS = 60 * 60 * 24 * 30;

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
