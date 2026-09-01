"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the visitor has asked their OS for reduced motion.
 *
 * The marketing demos script themselves — a sentence types itself out, a
 * waveform moves, draft rows appear one by one. For someone with a vestibular
 * disorder that's not decoration, and the `prefers-reduced-motion` block in
 * `globals.css` can't help here because the motion is driven by timers rather
 * than CSS transitions. Every scripted demo reads this and, when it's true,
 * renders the finished state immediately instead of animating toward it.
 *
 * Read through `useSyncExternalStore` for the same reason as `useIsMobile`:
 * `useState` plus an effect leaves the value one render stale, and the lint
 * rule against `setState` in an effect body exists to push code here instead.
 * The server snapshot is `false` — SSR has no media queries, and assuming
 * "motion is fine" matches the browser default.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
