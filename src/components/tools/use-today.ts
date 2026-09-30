"use client";

import { useSyncExternalStore } from "react";

/**
 * Today's date in the visitor's time zone, as `YYYY-MM-DD` — or `null` on the
 * server and during hydration.
 *
 * Tool pages are prerendered at deploy time, so "today" must never be baked
 * into the HTML: it would be the build day, and hydrating against the
 * visitor's real today would mismatch. The server snapshot is `null`, so date
 * tools render their waiting state first and fill in straight after.
 *
 * The value moves on at local midnight, and is re-read when a tab that slept
 * through midnight comes back into view.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, localToday, serverToday);
}

function localToday(): string {
  const now = new Date();
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function serverToday(): null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const now = new Date();
    // A second past midnight, so the new date is certainly in effect.
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, next.getTime() - now.getTime());
  };
  arm();
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}
