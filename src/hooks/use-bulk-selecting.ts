"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the tracker feed has a multi-select up, for the composer — which
 * lives in another tree and has to stand down while it does.
 *
 * Hiding the composer isn't enough on its own: its shortcuts (⌘E, "a", the
 * voice hold on M, ⌘↵ / Enter to save an AI review list) are bound to `window`,
 * so a hidden composer would still save drafts nobody can see, or start
 * recording with no UI. Each of those reads this flag next to `switching`,
 * the guard they already carry for the same reason.
 *
 * A module-level store rather than context: the feed and the composer are
 * siblings under a server page, with no client ancestor in common to hold it.
 */
let selecting = false;
const listeners = new Set<() => void>();

export function setBulkSelecting(next: boolean) {
  if (selecting === next) return;
  selecting = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBulkSelecting(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => selecting,
    () => false,
  );
}
