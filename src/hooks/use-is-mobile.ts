"use client";

import { useSyncExternalStore } from "react";

/**
 * True below Tailwind's `md` breakpoint (768px) — i.e. phone-width viewports.
 *
 * Read through `useSyncExternalStore` rather than `useState` + an effect so the
 * value is never a render behind the viewport, matching how the transaction
 * table reads its column prefs.
 *
 * `getServerSnapshot` returns false because SSR has no viewport: the server
 * renders the desktop shape and hydration corrects it on a phone. Only use this
 * for behaviour CSS genuinely can't express (picking a different component
 * tree). For anything that is purely presentational, prefer a `md:` class —
 * those are right on the first paint, with no hydration correction at all.
 */
const QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  // `resize` as well as the media query: the `change` event has been seen to
  // miss when the viewport crosses the breakpoint without a user-driven resize
  // (rotation, a resized embedding window). `useSyncExternalStore` compares the
  // snapshot and bails out when it's unchanged, so the extra events cost a
  // boolean read, not a render.
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
