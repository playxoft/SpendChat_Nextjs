"use client";

import { useSyncExternalStore } from "react";
import { getToolCurrency } from "@/components/tools/tool-state";
import { defaultDraft, isBlankDraft, sanitizeDraft, type SplitDraft } from "@/lib/tools/split-bill";

/**
 * The split calculator's group, auto-saved to `localStorage` — the same
 * pattern as the invoice draft store (`business-doc/draft-store.ts`): a small
 * external store read with `useSyncExternalStore`, whose server snapshot is the
 * blank group the static page was built with.
 *
 * It's also the hand-off to the app. The draft outlives sign-up (same origin,
 * same storage), and `/app/split/import` reads it back with `useStoredDraft`
 * to create the group for real, then clears it.
 *
 * Everything that touches storage is wrapped: private windows, blocked site
 * data and a full quota degrade to "not remembered", never to an error.
 */

type Listener = () => void;

export const SPLIT_DRAFT_KEY = "spendchat:tools:split:draft";
/** The soft "save it for the group" card was closed — don't bring it back on this device. */
const NUDGE_KEY = "spendchat:tools:split:nudge-dismissed";

/** What the static HTML was built with — a fixed object, so hydration matches. */
const SERVER_DRAFT = defaultDraft("USD");

const listeners = new Set<Listener>();
let current: SplitDraft | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/** `useStoredDraft`'s answer, cached so its snapshot is stable; `undefined` = not read yet. */
let stored: SplitDraft | null | undefined;

/** The stored draft, or null when there's none (or it can't be read). */
function readStored(): SplitDraft | null {
  try {
    const raw = window.localStorage.getItem(SPLIT_DRAFT_KEY);
    // A full group is a few KB; anything far past that isn't ours.
    if (raw && raw.length <= 200_000) return sanitizeDraft(JSON.parse(raw));
  } catch {
    // Blocked storage or a corrupt value.
  }
  return null;
}

function save() {
  clearTimeout(timer);
  timer = undefined;
  if (!current) return;
  try {
    if (isBlankDraft(current)) window.localStorage.removeItem(SPLIT_DRAFT_KEY);
    else window.localStorage.setItem(SPLIT_DRAFT_KEY, JSON.stringify(current));
  } catch {
    // Storage is unavailable — the group still works for this page view.
  }
}

let globalListenersAttached = false;
function attachGlobalListeners() {
  if (globalListenersAttached) return;
  globalListenersAttached = true;
  // Don't lose the last keystrokes when the tab closes or goes to the background.
  window.addEventListener("pagehide", () => timer && save());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) save();
  });
  // Another tab changed the group: show that one rather than overwrite it later.
  window.addEventListener("storage", (e) => {
    if (e.key !== SPLIT_DRAFT_KEY || timer) return;
    current = null;
    stored = undefined;
    listeners.forEach((l) => l());
  });
}

/** The current group. Loaded from storage on first read; a fresh one in the visitor's currency otherwise. */
export function getDraft(): SplitDraft {
  current ??= readStored() ?? defaultDraft(getToolCurrency());
  return current;
}

/** Replace the group and save it (debounced unless `immediate`). */
export function setDraft(next: SplitDraft, { immediate = false } = {}) {
  current = next;
  stored = undefined;
  listeners.forEach((l) => l());
  if (immediate) {
    save();
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(save, 400);
}

/**
 * Forget the group entirely ("Start over", or once the app has imported it).
 * `quiet` leaves the page that's showing it alone — the import page is about
 * to navigate away and shouldn't flash "nothing to bring in" first.
 */
export function clearDraft({ quiet = false } = {}) {
  clearTimeout(timer);
  timer = undefined;
  current = defaultDraft(getToolCurrency());
  stored = null;
  try {
    window.localStorage.removeItem(SPLIT_DRAFT_KEY);
  } catch {
    // Nothing stored, or storage blocked — either way nothing is left behind.
  }
  if (!quiet) listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  attachGlobalListeners();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The live group for the calculator. The blank group on the server. */
export function useDraft(): SplitDraft {
  return useSyncExternalStore(subscribe, getDraft, () => SERVER_DRAFT);
}

// ---------------------------------------------------------------------------
// The app's read: a saved group, or nothing
// ---------------------------------------------------------------------------

function getStored(): SplitDraft | null {
  if (stored === undefined) {
    // A draft with nothing in it isn't something to bring in.
    const draft = current ?? readStored();
    stored = draft && !isBlankDraft(draft) ? draft : null;
  }
  return stored;
}

/**
 * For `/app/split/import`: the group saved on this device, `null` when there
 * isn't one worth importing, and `undefined` on the server and during
 * hydration (storage can't be read there).
 */
export function useStoredDraft(): SplitDraft | null | undefined {
  return useSyncExternalStore(subscribe, getStored, () => undefined);
}

// ---------------------------------------------------------------------------
// The soft prompt's "don't show again"
// ---------------------------------------------------------------------------

const nudgeListeners = new Set<Listener>();
let nudgeDismissed: boolean | null = null;

function readNudge(): boolean {
  if (nudgeDismissed === null) {
    try {
      nudgeDismissed = window.localStorage.getItem(NUDGE_KEY) === "1";
    } catch {
      nudgeDismissed = false;
    }
  }
  return nudgeDismissed;
}

export function dismissNudge() {
  nudgeDismissed = true;
  try {
    window.localStorage.setItem(NUDGE_KEY, "1");
  } catch {
    // Not remembered — it stays closed for this page view.
  }
  nudgeListeners.forEach((l) => l());
}

/** Whether the visitor closed the "save it for the group" card. `true` on the server, so it never flashes in. */
export function useNudgeDismissed(): boolean {
  return useSyncExternalStore(
    (l) => {
      nudgeListeners.add(l);
      return () => nudgeListeners.delete(l);
    },
    readNudge,
    () => true,
  );
}
