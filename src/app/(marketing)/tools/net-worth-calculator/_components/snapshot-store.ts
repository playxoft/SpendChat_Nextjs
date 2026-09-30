"use client";

import { useSyncExternalStore } from "react";
import { sanitizeSnapshots, toStored, withSnapshot, type Snapshot } from "@/lib/tools/net-worth";

/**
 * Net worth snapshots, kept in the visitor's own `localStorage` — never sent
 * anywhere. A small external store read with `useSyncExternalStore`: the
 * server snapshot is an empty list (what the static page was built with), and
 * the saved list arrives on the render straight after hydration.
 *
 * Every storage access is wrapped: a private window, blocked site data or a
 * full quota means "not remembered", never an error.
 */

type Listener = () => void;

const STORAGE_KEY = "spendchat:tools:net-worth:snapshots";
/** Longest stored value we'll parse — 24 snapshots are a few KB. */
const MAX_STORED_CHARS = 200_000;
const NONE: Snapshot[] = [];

const listeners = new Set<Listener>();
let current: Snapshot[] | null = null;

function load(): Snapshot[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length <= MAX_STORED_CHARS) return sanitizeSnapshots(JSON.parse(raw));
  } catch {
    // Blocked storage or a corrupt value — start with no history.
  }
  return NONE;
}

/** Write the list; false when the browser refused. */
function persist(list: Snapshot[]): boolean {
  try {
    if (list.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(toStored)));
    return true;
  } catch {
    return false;
  }
}

function replace(list: Snapshot[]): boolean {
  current = list;
  listeners.forEach((l) => l());
  return persist(list);
}

function get(): Snapshot[] {
  current ??= load();
  return current;
}

let storageListenerAttached = false;
function subscribe(l: Listener) {
  if (!storageListenerAttached) {
    storageListenerAttached = true;
    // Saved in another tab: re-read, so this one doesn't overwrite it later.
    window.addEventListener("storage", (e) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      current = null;
      listeners.forEach((fn) => fn());
    });
  }
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const serverSnapshot = () => NONE;

/** The saved snapshots, oldest first. Empty on the server. */
export function useSnapshots(): Snapshot[] {
  return useSyncExternalStore(subscribe, get, serverSnapshot);
}

/**
 * Save `snap`, replacing any from the same day. Returns false when storage is
 * blocked — the snapshot still shows for this page view.
 */
export function saveSnapshot(snap: Snapshot): boolean {
  return replace(withSnapshot(get(), snap));
}

/** Forget every snapshot; returns the old list, for an Undo. */
export function clearSnapshots(): Snapshot[] {
  const before = get();
  replace(NONE);
  return before;
}

/** Put a list back (Undo after clearing). */
export function restoreSnapshots(list: Snapshot[]): boolean {
  return replace(sanitizeSnapshots(list.map(toStored)));
}
