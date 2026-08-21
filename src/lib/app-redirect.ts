/**
 * "Take me straight to the app" — the landing page's handoff for people who
 * are already signed in.
 *
 * Two cookies drive it, both read in the browser only:
 *
 * - `SESSION_HINT_COOKIE` (see `session-cookie.ts`) says a session exists. The
 *   real session cookies are httpOnly and `/` is statically rendered, so this
 *   breadcrumb is the only thing on that page that can tell a signed-in visitor
 *   from a stranger. It is a hint, never an access decision.
 * - `PREF_COOKIE` here records that they asked to skip the landing page.
 *
 * Both are read synchronously from `document.cookie`, which is the point: the
 * redirect can fire on the first client render, and `/` keeps its static
 * rendering (and therefore its caching and indexability — AGENTS.md § SEO).
 * A crawler carries neither cookie, so it always gets the plain landing page.
 *
 * Deliberately a cookie and not `user_settings.ui_prefs`: reading the account
 * setting would mean auth plus a DB round-trip on the highest-traffic public
 * page, which is exactly the cost static rendering exists to avoid. The
 * trade-off is that the preference is per-browser rather than per-account.
 */

import { deleteCookie, readCookie, writeCookie } from "@/lib/cookies";
import { SESSION_HINT_COOKIE } from "@/lib/session-cookie";

const PREF_COOKIE = "sc_go_to_app";
const PREF_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days, like cookie consent

/**
 * Query param that suppresses the redirect for one visit, so someone who turned
 * this on can still reach the landing page (`/?stay=1`). Without it the
 * preference would be a one-way door — the page that hosts the "off" switch
 * would be the one page they could never load.
 */
export const STAY_PARAM = "stay";

/** Session-scoped dismissal, so declining the prompt doesn't re-ask on every
 * navigation back to `/` — but does ask again on a fresh visit. */
const DISMISSED_KEY = "spendchat:app-handoff-dismissed";

/** Fired when the preference changes, so the prompt can re-render. */
export const APP_REDIRECT_CHANGE_EVENT = "spendchat:app-redirect-change";

/**
 * Tell the store its cookies may have changed. The writers below call it; so
 * does `AuthBridge`, because the session hint is written **server-side** by
 * `/api/auth/session` — nothing on this side can observe that write, so without
 * the nudge the feature stays inert for the whole visit in which a session
 * first appears.
 */
export function notifyHandoffChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_REDIRECT_CHANGE_EVENT));
}

/** Whether this browser holds a session. A hint for UI only — see the module doc. */
export function hasSessionHint(): boolean {
  return readCookie(SESSION_HINT_COOKIE) === "1";
}

/** Whether the visitor asked to be taken straight to the app from `/`. */
export function prefersApp(): boolean {
  return readCookie(PREF_COOKIE) === "1";
}

export function setPrefersApp(value: boolean) {
  if (value) writeCookie(PREF_COOKIE, "1", PREF_MAX_AGE_SECONDS);
  else deleteCookie(PREF_COOKIE);
  notifyHandoffChange();
}

export function isPromptDismissed(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Safari in private mode throws on sessionStorage access; treat it as
    // "not dismissed" rather than letting the landing page fail to render.
    return false;
  }
}

export function dismissPrompt() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Non-fatal, and *not* what makes the close button work: the caller keeps
    // its own in-memory dismissal for this render (see `AppHandoff`). This
    // write is only the durable half — it's what keeps the card down when the
    // visitor navigates back to `/` later in the same tab.
  }
  notifyHandoffChange();
}

/**
 * `useSyncExternalStore` bindings. The state lives in cookies and
 * sessionStorage — outside React — and only changes through the writers above,
 * which dispatch the change event. The server snapshot is a frozen "signed out,
 * no preference": the server has no cookies to read, and returning a fresh
 * object each call would loop the store.
 */
export type HandoffState = {
  signedIn: boolean;
  prefers: boolean;
  dismissed: boolean;
  /** `?stay=1` is present — suppress the redirect for this visit. */
  stay: boolean;
};

const SERVER_SNAPSHOT: HandoffState = {
  signedIn: false,
  prefers: false,
  dismissed: false,
  stay: false,
};

/** Reading the URL through the store, rather than `useSearchParams`, keeps `/`
 * out of a Suspense boundary and therefore statically rendered. */
function hasStayParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(STAY_PARAM) === "1";
}

let cached: HandoffState = SERVER_SNAPSHOT;

export function subscribeHandoff(callback: () => void) {
  window.addEventListener(APP_REDIRECT_CHANGE_EVENT, callback);
  // Back/forward can add or drop `?stay=1` without a reload — and so can a soft
  // navigation, which fires `pushState` instead of `popstate`, so re-read on
  // both. `pageshow` covers a bfcache restore, where the cookies may have
  // changed in another tab while this page sat frozen; `visibilitychange` and
  // `focus` cover that same tab coming back without a restore (signing out
  // elsewhere should stop this page offering the app).
  window.addEventListener("popstate", callback);
  window.addEventListener("pageshow", callback);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener(APP_REDIRECT_CHANGE_EVENT, callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("pageshow", callback);
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

/** Must return a stable reference while nothing has changed, or
 * `useSyncExternalStore` re-renders forever. */
export function getHandoffSnapshot(): HandoffState {
  const next = {
    signedIn: hasSessionHint(),
    prefers: prefersApp(),
    dismissed: isPromptDismissed(),
    stay: hasStayParam(),
  };
  if (
    next.signedIn !== cached.signedIn ||
    next.prefers !== cached.prefers ||
    next.dismissed !== cached.dismissed ||
    next.stay !== cached.stay
  ) {
    cached = next;
  }
  return cached;
}

export function getHandoffServerSnapshot(): HandoffState {
  return SERVER_SNAPSHOT;
}

/** What the landing page shows a visitor: nothing, the card, or the cover while
 * it hands them over to `/app`. */
export type HandoffView = "redirect" | "card" | "hidden";

/**
 * The single place the four inputs are weighed, kept pure so every combination
 * is testable — the gating used to be a chain of early returns in the component,
 * where `dismissed && !prefers` quietly made the close button a no-op for
 * exactly the visitors most likely to press it.
 */
export function handoffView(
  { signedIn, prefers, dismissed, stay }: HandoffState,
  options: {
    /**
     * The visitor changed the preference during *this* visit. The box records
     * what should happen next time; acting on a tick immediately would turn a
     * checkbox into a one-click one-way door out of the only page that can
     * untick it.
     */
    changedHere?: boolean;
    /** The redirect was started and never arrived. Show the card — it holds the
     * only working way out (a real link, and the checkbox). */
    stalled?: boolean;
  } = {},
): HandoffView {
  if (!signedIn) return "hidden";
  if (prefers && !stay && !options.changedHere && !options.stalled) return "redirect";
  if (dismissed) return "hidden";
  return "card";
}
