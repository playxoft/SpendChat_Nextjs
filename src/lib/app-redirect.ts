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

import { SIX_MONTHS_SECONDS, deleteCookie, readCookie, writeCookie } from "@/lib/cookies";
import { SESSION_HINT_COOKIE } from "@/lib/session-cookie";

const PREF_COOKIE = "sc_go_to_app";

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
  // Six months, the same lifetime as the consent choice beside it.
  if (value) writeCookie(PREF_COOKIE, "1", SIX_MONTHS_SECONDS);
  else deleteCookie(PREF_COOKIE);
  notifyHandoffChange();
}

export function isPromptDismissed(): boolean {
  try {
    // `typeof sessionStorage` is inside the try on purpose: the check itself
    // resolves the property, and the getter is what throws (Chrome with all
    // cookies blocked, a partitioned context, Safari in private mode). Left
    // outside, the guard against storage throwing would be the throw — on a
    // path `useSyncExternalStore` runs during every render of the landing page.
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
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
 * Forget a dismissal. Called when the visitor arrives on `?stay=1`, which is a
 * deliberate request for this card — it's the only place the preference can be
 * turned off. Without this, one ✕ earlier in the tab would outrank the escape
 * hatch and hand back the one-way door `?stay=1` exists to prevent.
 */
export function clearPromptDismissal() {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing was stored if storage throws — the caller's own state is enough.
  } finally {
    notifyHandoffChange();
  }
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
  // Back/forward can add or drop `?stay=1` without a reload. `pageshow` covers
  // a bfcache restore, where the cookies may have changed in another tab while
  // this page sat frozen; `visibilitychange` and `focus` cover that same tab
  // coming back without a restore (signing out elsewhere should stop this page
  // offering the app).
  //
  // A same-page `pushState` — a `<Link>` from `/?stay=1` to `/` — is *not*
  // observed: there's no event for it short of patching `history`, which isn't
  // worth doing to a public page. The cost is bounded to `stay` reading stale
  // for the rest of that visit, and the outcome of a stale `stay` is the card
  // instead of the redirect, which is the safe direction. Nothing here decides
  // the redirect anyway — `AppHandoff` latches that at arrival.
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
     * The visitor was **already** signed in with the preference on when this
     * page loaded — `signedIn && prefers` as at arrival, latched by the caller.
     *
     * The handoff is an arrival decision, and this is what keeps it one. Two
     * things would otherwise navigate someone away from a page they had settled
     * on: ticking the box (the preference is for *next* time — acting on it now
     * makes a checkbox a one-click one-way door out of the only page that can
     * untick it), and the session hint landing mid-visit, which happens
     * whenever a signed-out reader signs in elsewhere and comes back to this
     * tab, since the preference cookie outlives the hint by five months.
     */
    arrivedWithPreference?: boolean;
    /** The redirect was started and never arrived. Show the card — it holds the
     * only working way out (a real link, and the checkbox). */
    stalled?: boolean;
  } = {},
): HandoffView {
  if (!signedIn) return "hidden";
  // `prefers` is read live as well, so unticking during a stalled redirect
  // takes effect immediately rather than waiting for a reload.
  if (options.arrivedWithPreference && prefers && !stay && !options.stalled) return "redirect";
  if (dismissed) return "hidden";
  return "card";
}
