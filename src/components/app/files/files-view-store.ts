"use client";

import { useSyncExternalStore } from "react";

/**
 * The vault's view mode (grid / list / macOS-style columns), persisted in
 * localStorage. Same external-store pattern as `entry-mode-store.ts`: SSR
 * renders the default, the client re-reads after mount — no hydration
 * mismatch — and the `storage` event keeps other tabs in step. (Stored legacy
 * "folder"/"chat" values from removed views fall back to "grid".)
 */
export type FilesView = "grid" | "list" | "column";

const KEY = "spendchat.files-view";
const VIEWS: FilesView[] = ["grid", "list", "column"];
const listeners = new Set<() => void>();

function read(): FilesView {
  try {
    const raw = localStorage.getItem(KEY);
    return VIEWS.includes(raw as FilesView) ? (raw as FilesView) : "grid";
  } catch {
    return "grid";
  }
}

function setFilesView(view: FilesView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* storage unavailable — the toggle still works for this render tree */
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** `[view, setView]`, mirroring `useState`, but backed by localStorage. */
export function useFilesView(): [FilesView, (view: FilesView) => void] {
  const view = useSyncExternalStore(subscribe, read, (): FilesView => "grid");
  return [view, setFilesView];
}
