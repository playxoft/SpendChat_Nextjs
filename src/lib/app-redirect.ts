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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  // Escape the name: it lands in a regex, and a future rename containing a
  // metacharacter would otherwise silently match the wrong thing.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ?? null;
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
  document.cookie = value
    ? `${PREF_COOKIE}=1; path=/; max-age=${PREF_MAX_AGE_SECONDS}; samesite=lax`
    : `${PREF_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new Event(APP_REDIRECT_CHANGE_EVENT));
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
    // Non-fatal: the prompt reappears on the next navigation, which is a far
    // better failure than a thrown error on the marketing site.
  }
  window.dispatchEvent(new Event(APP_REDIRECT_CHANGE_EVENT));
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
  // Back/forward can add or drop `?stay=1` without a reload.
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener(APP_REDIRECT_CHANGE_EVENT, callback);
    window.removeEventListener("popstate", callback);
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
