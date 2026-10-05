"use client";

import { useCallback, useSyncExternalStore } from "react";
import { setCollapsedSpaces } from "@/actions/settings";
import { toggleCollapsed } from "@/lib/sidebar-spaces";

/**
 * Which sidebar spaces are folded shut — `ui_prefs.sidebar.collapsedSpaces`,
 * read on the server and handed down by the app layout.
 *
 * One module-level store rather than per-component state, because the profile
 * tree renders twice (the desktop sidebar and the mobile sheet) from the same
 * layout props, and those props don't change when a space is toggled (the
 * toggle saves without revalidating). Per-component state would let the sheet
 * mount with the stale list and then save it back over the sidebar's change.
 *
 * The store remembers which server list it grew from (`seedKey`). A component
 * whose props carry that same list reads the store; one with a different list
 * — the layout re-rendered with what the server now holds, which already
 * includes every saved toggle — reads its props. So a fresh server value always
 * wins, and nothing has to be seeded during render.
 */

type Store = { seedKey: string | null; list: string[] };
const store: Store = { seedKey: null, list: [] };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCollapsedSpaces(initial: string[]) {
  const key = initial.join(",");
  const list = useSyncExternalStore(
    subscribe,
    () => (store.seedKey === key ? store.list : initial),
    () => initial,
  );

  const setCollapsed = useCallback(
    (id: string, collapsed: boolean) => {
      const base = store.seedKey === key ? store.list : initial;
      const next = toggleCollapsed(base, id, collapsed);
      store.seedKey = key;
      store.list = next;
      for (const l of listeners) l();
      // Best effort: a lost write only means the space opens again next visit.
      void setCollapsedSpaces(next).catch(() => {});
    },
    [key, initial],
  );

  return { collapsed: list, setCollapsed };
}
