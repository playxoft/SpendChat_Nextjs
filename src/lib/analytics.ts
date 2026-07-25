declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

export type TrackEventParams = Record<string, string | number | boolean>;

/**
 * Fires a custom event to whichever analytics scripts are loaded. A no-op
 * until the visitor grants cookie consent, since gtag/clarity aren't defined
 * on `window` until AnalyticsProvider injects them (src/lib/consent.ts) —
 * safe to call unconditionally from anywhere.
 */
export function trackEvent(name: string, params?: TrackEventParams) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, params);
  window.clarity?.("event", name);
}

/**
 * Declarative click tracking: add these two attributes to any element (even
 * from a Server Component — they're plain strings) and AnalyticsProvider's
 * delegated document click listener will call trackEvent() for you.
 *
 *   <Link href="/sign-up"
 *     data-track-event="cta_click"
 *     data-track-params={JSON.stringify({ location: "hero" })}
 *   >
 */
export const TRACK_EVENT_ATTR = "data-track-event";
export const TRACK_PARAMS_ATTR = "data-track-params";
