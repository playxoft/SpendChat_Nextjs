import { NextResponse, type NextRequest } from "next/server";
import { hasVerifiedEmail, verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { resolveUser, syncUserProfile } from "@/lib/identity";
import { attributionInputSchema, type AttributionInput } from "@/lib/attribution";
import { ApiError } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  sessionCookieOptions,
  sessionHintCookieOptions,
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
 * POST { idToken, refreshToken, attribution? } — the browser sends a fresh Firebase ID token
 * on sign-in and on every hourly refresh (see `AuthBridge`), plus its long-lived
 * refresh token. We verify the ID token and store both in httpOnly cookies:
 * `__session` (read/verified by `getCurrentUser`) and `__refresh` (used to
 * re-mint an ID token once the short-lived one expires). DELETE — sign-out;
 * clears both cookies.
 *
 * The cookies are written on the **response**, not through `cookies()` from
 * `next/headers`. Next only lets `cookies()` mutate while the request is in its
 * "action" phase, and flips it to "after" the moment the connection closes —
 * which happens whenever the browser navigates or reloads while this handler is
 * still awaiting the database (1–4s in dev against remote Neon). The `set` at
 * the end then threw "Cookies can only be modified in a Server Action or Route
 * Handler" and logged a 500 for a client that had already left. Response
 * cookies don't depend on the phase: if the client is gone the headers are
 * simply never delivered, which is the right outcome.
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
    // First-touch attribution from the browser (`lib/attribution.ts`). Only
    // consulted if this sign-in creates the account; anything that fails the
    // strict schema is dropped rather than stored.
    let attribution: AttributionInput | null = null;
    try {
      const body = (await request.json()) as {
        idToken?: string;
        refreshToken?: string;
        attribution?: unknown;
      };
      idToken = body?.idToken;
      refreshToken = body?.refreshToken;
      const parsed = attributionInputSchema.safeParse(body?.attribution);
      if (parsed.success) attribution = parsed.data;
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

    // Keep email/name/picture fresh for an existing user. A brand-new account
    // gets its row here rather than lazily on the first page render, so the
    // attribution above lands on the INSERT — the only time `resolveUser`
    // stores it.
    let userId = await syncUserProfile(claims);
    if (!userId) {
      try {
        userId = (await resolveUser(claims, { acquisition: attribution })).id;
      } catch (err) {
        // A deliberate refusal (an unverified email claiming an existing
        // account) is the caller's answer, with its own status — not a 500.
        if (err instanceof ApiError) {
          return Response.json({ error: err.code, message: err.message }, { status: err.status });
        }
        // Anything else must not cost the person their session: create the
        // row without the attribution and say so in the logs.
        logger.warn(`Sign-in fell back to creating the account without attribution: ${describeError(err)}`, {
          event: "auth.attribution_dropped",
        });
        userId = (await resolveUser(claims)).id;
      }
    }
    setLogContext({ userId });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, idToken, sessionCookieOptions());
    // Readable by the statically-rendered landing page, which has no other way
    // to know a visitor is signed in. A hint only — never an access decision.
    // `Secure` from this request's own scheme, so it matches the preference
    // cookie the landing page writes beside it (see `sessionHintCookieOptions`).
    res.cookies.set(
      SESSION_HINT_COOKIE,
      "1",
      sessionHintCookieOptions(new URL(request.url).protocol === "https:"),
    );
    // The refresh token is what keeps the session alive for the month — re-set it
    // on every sync so its expiry slides forward with each visit.
    if (refreshToken) {
      res.cookies.set(REFRESH_COOKIE, refreshToken, sessionCookieOptions());
    }
    return res;
  });
}

export async function DELETE(request: NextRequest) {
  return withRequestContext("web", async () => {
    // Same gate as POST: a cross-site page shouldn't be able to force-log-out.
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    // Expire each cookie with the same path it was set with, or the browser
    // treats the deletion as a different cookie and keeps the original.
    res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    res.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0));
    // Must go with them, or `/` keeps offering the app to someone signed out.
    res.cookies.set(
      SESSION_HINT_COOKIE,
      "",
      sessionHintCookieOptions(new URL(request.url).protocol === "https:", 0),
    );
    return res;
  });
}
