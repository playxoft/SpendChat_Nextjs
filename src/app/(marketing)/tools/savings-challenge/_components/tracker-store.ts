"use client";

import { useSyncExternalStore } from "react";
import { pruneTrackers, sanitizeTrackers, type SavedTracker } from "@/lib/tools/savings-challenge";

/**
 * The savings-challenge ticks, remembered in `localStorage` — one tracker per
 * challenge configuration (see `trackerKey`), so switching from the 52-week
 * challenge to the envelopes and back keeps both.
 *
 * A small external store read with `useSyncExternalStore`. The server
 * snapshot is "nothing ticked", which is what the static page is built with;
 * the saved ticks arrive on the render straight after hydration, with no
 * mismatch and no setState in an effect. Every storage access is wrapped:
 * a private window or blocked site data means "not remembered", never an error.
 */

type Listener = () => void;

const STORAGE_KEY = "spendchat:tools:savings-challenge";
/** Refuse to parse anything this large — it isn't ours. */
const MAX_STORED_CHARS = 200_000;

const listeners = new Set<Listener>();
let cache: Record<string, SavedTracker> | null = null;
let attached = false;

function load(): Record<string, SavedTracker> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length <= MAX_STORED_CHARS) return sanitizeTrackers(JSON.parse(raw));
  } catch {
    // Blocked storage or a corrupt value — start empty.
  }
  return {};
}

function attach() {
  if (attached) return;
  attached = true;
  // Ticked in another tab: show those ticks here too.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    cache = null;
    listeners.forEach((l) => l());
  });
}

function all(): Record<string, SavedTracker> {
  if (!cache) {
    cache = load();
    attach();
  }
  return cache;
}

function commit(next: Record<string, SavedTracker>) {
  cache = pruneTrackers(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Not remembered — the ticks still work for this page view.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The saved tracker for `key`, or null — always null on the server and during hydration. */
export function useTracker(key: string): SavedTracker | null {
  return useSyncExternalStore(
    subscribe,
    () => all()[key] ?? null,
    () => null,
  );
}

/**
 * Tick or untick step `id`. The first tick creates the tracker and pins
 * `start` — the date the challenge is running from — so reopening the page
 * next week doesn't slide the dates forward.
 */
export function setTick(key: string, id: number, ticked: boolean, start: string | null) {
  const current = all()[key];
  const ticks = new Set(current?.ticks ?? []);
  if (ticked) ticks.add(id);
  else ticks.delete(id);
  commit({
    ...all(),
    [key]: {
      ticks: [...ticks].sort((a, b) => a - b),
      start: current?.start ?? start,
      at: Date.now(),
    },
  });
}

/** Move a saved tracker's start date — the visitor picked a new one. No-op when nothing's saved. */
export function setTrackerStart(key: string, start: string) {
  const current = all()[key];
  if (!current || current.start === start) return;
  commit({ ...all(), [key]: { ...current, start, at: Date.now() } });
}

/** Forget a tracker; returns what was there, for Undo. */
export function clearTracker(key: string): SavedTracker | null {
  const current = all()[key] ?? null;
  if (!current) return null;
  const next = { ...all() };
  delete next[key];
  commit(next);
  return current;
}

/** Put a cleared tracker back. */
export function restoreTracker(key: string, tracker: SavedTracker) {
  commit({ ...all(), [key]: { ...tracker, at: Date.now() } });
}
