/**
 * Cookie-consent state for the marketing site's analytics (GA4 + Clarity).
 * Consent is "block until granted": AnalyticsProvider only renders the
 * tracking scripts once this cookie reads "granted", so nothing loads —
 * and trackEvent() stays a no-op — until the visitor accepts.
 */
import { SIX_MONTHS_SECONDS, readCookie, writeCookie } from "@/lib/cookies";

export type ConsentValue = "granted" | "denied";

const COOKIE_NAME = "cookie_consent";

/** Fired on the window whenever consent is recorded, so AnalyticsProvider can react. */
export const CONSENT_CHANGE_EVENT = "spendchat:cookie-consent-change";
/** Fired to re-show the banner, e.g. from a "Cookie settings" footer link. */
export const CONSENT_REOPEN_EVENT = "spendchat:cookie-consent-reopen";

export function readConsent(): ConsentValue | null {
  // Anything else — an empty value, or a hand-edited one — reads as "not
  // decided yet", which keeps the scripts blocked and re-asks.
  const value = readCookie(COOKIE_NAME);
  if (value === "granted" || value === "denied") return value;
  // A browser sending Global Privacy Control has already said no: treat it as
  // a decline (no banner, no analytics) unless the visitor explicitly accepts
  // from the Cookie Policy page, which writes the cookie above. The Privacy
  // and Cookie policies promise this; California, Colorado and others require it.
  return hasGlobalPrivacyControl() ? "denied" : null;
}

/** `navigator.globalPrivacyControl`, the GPC signal (https://globalprivacycontrol.org). */
export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function writeConsent(value: ConsentValue) {
  writeCookie(COOKIE_NAME, value, SIX_MONTHS_SECONDS);
  window.dispatchEvent(new CustomEvent<ConsentValue>(CONSENT_CHANGE_EVENT, { detail: value }));
}

export function reopenConsentBanner() {
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
}

/**
 * useSyncExternalStore bindings for reading the cookie: the cookie lives
 * outside React and only changes via writeConsent()'s dispatched event, so a
 * plain useState+useEffect would either miss updates or set state
 * synchronously on mount (a lint error and a hydration-mismatch risk, since
 * the server has no cookie to read). getServerSnapshot returning null keeps
 * SSR and the first client render in sync.
 */
export function subscribeConsent(callback: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, callback);
}

export function getConsentSnapshot(): ConsentValue | null {
  return readConsent();
}

export function getConsentServerSnapshot(): ConsentValue | null {
  return null;
}
