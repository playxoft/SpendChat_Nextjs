"use client";

import { useSyncExternalStore } from "react";
import type { EntryMode } from "./entry-mode-toggle";

/**
 * Persist the composer's Manual/AI choice in localStorage so a refresh or a
 * re-login (same browser) reopens the same mode. A `useSyncExternalStore` store,
 * like the transactions column view-pref: SSR/hydration render "manual" (the
 * server can't read localStorage), then the client re-reads once mounted — no
 * hydration mismatch, and no `setState` in an effect. It's a device-local UI
 * pref, not user-scoped; switching accounts on the same browser inherits it.
 */
const KEY = "spendchat.entry-mode";
const listeners = new Set<() => void>();

function read(): EntryMode {
  try {
    return localStorage.getItem(KEY) === "ai" ? "ai" : "manual";
  } catch {
    return "manual";
  }
}

function setEntryMode(mode: EntryMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable (private mode / quota) — the toggle still works */
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep other tabs in step when the value changes elsewhere.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** `[mode, setMode]`, mirroring `useState`, but backed by localStorage. */
export function useEntryMode(): [EntryMode, (mode: EntryMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, (): EntryMode => "manual");
  return [mode, setEntryMode];
}
