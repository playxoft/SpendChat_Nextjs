/**
 * The httpOnly cookie that carries the Firebase ID token to the server.
 *
 * Firebase Auth is client-side; server components/route handlers can't call the
 * client SDK. So after sign-in (and on every hourly token refresh) the browser
 * posts its fresh ID token to `POST /api/auth/session`, which sets this cookie.
 * `getCurrentUser` reads + verifies it with `jose`. Cookie WRITES only ever
 * happen in that route handler — never during render (Next forbids it, and
 * there's no edge middleware on Workers).
 */
export const SESSION_COOKIE = "__session";

const FIVE_DAYS = 60 * 60 * 24 * 5;

export function sessionCookieOptions(maxAge: number = FIVE_DAYS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
