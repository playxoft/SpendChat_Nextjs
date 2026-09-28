"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MAX_DOC_FILE_CHARS, defaultDoc, sanitizeDoc, type BusinessDoc, type DocKind } from "@/lib/tools/invoice";

/**
 * The invoice and quotation drafts, auto-saved to `localStorage` — one key
 * each, so working on a quote never touches the invoice you're halfway
 * through.
 *
 * A small external store read with `useSyncExternalStore`: the server
 * snapshot is the blank document the static page was built with, and the
 * saved draft replaces it on the render straight after hydration — no
 * setState in an effect, no mismatch. Both drafts live in this one module, so
 * "Convert to invoice" writes the invoice draft in memory and the invoice
 * page shows it immediately after a client-side navigation.
 *
 * Everything that touches storage is wrapped: private windows, blocked site
 * data and a full quota must degrade to "not remembered", never to an error.
 */

type Listener = () => void;

const STORAGE_KEY: Record<DocKind, string> = {
  invoice: "spendchat:tools:invoice:draft",
  quotation: "spendchat:tools:quotation:draft",
};

/** What the static HTML was built with — a fixed object, so hydration matches. */
const SERVER_DOC: Record<DocKind, BusinessDoc> = {
  invoice: defaultDoc("invoice"),
  quotation: defaultDoc("quotation"),
};

type Slot = {
  current: BusinessDoc | null;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Warn once per page view when the logo had to be left out of storage. */
  warnedLogo: boolean;
};

const slots: Record<DocKind, Slot> = {
  invoice: { current: null, listeners: new Set(), timer: undefined, warnedLogo: false },
  quotation: { current: null, listeners: new Set(), timer: undefined, warnedLogo: false },
};

function load(kind: DocKind): BusinessDoc {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY[kind]);
    if (raw && raw.length <= MAX_DOC_FILE_CHARS) {
      const doc = sanitizeDoc(JSON.parse(raw), kind);
      if (doc) return doc;
    }
  } catch {
    // Blocked storage or a corrupt value — start from a blank document.
  }
  return defaultDoc(kind);
}

function save(kind: DocKind) {
  const slot = slots[kind];
  clearTimeout(slot.timer);
  slot.timer = undefined;
  const doc = slot.current;
  if (!doc) return;
  try {
    window.localStorage.setItem(STORAGE_KEY[kind], JSON.stringify(doc));
    return;
  } catch {
    // Most likely the quota: the logo is by far the biggest thing in here.
  }
  if (!doc.logo) return;
  try {
    window.localStorage.setItem(STORAGE_KEY[kind], JSON.stringify({ ...doc, logo: null }));
    if (!slot.warnedLogo) {
      slot.warnedLogo = true;
      toast.warning("Your logo couldn't be saved in this browser, so it'll be gone next visit. Everything else is saved.");
    }
  } catch {
    // Storage is unavailable — the draft still works for this page view.
  }
}

function scheduleSave(kind: DocKind) {
  const slot = slots[kind];
  clearTimeout(slot.timer);
  // Debounced: typing fires a write per keystroke otherwise, each one
  // re-serialising a logo that can be a few hundred KB.
  slot.timer = setTimeout(() => save(kind), 400);
}

function flushAll() {
  for (const kind of Object.keys(slots) as DocKind[]) {
    if (slots[kind].timer) save(kind);
  }
}

let globalListenersAttached = false;
function attachGlobalListeners() {
  if (globalListenersAttached) return;
  globalListenersAttached = true;
  // Don't lose the last few keystrokes when the tab closes or goes to the background.
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  // Another tab saved a draft: show that one rather than overwrite it later.
  window.addEventListener("storage", (e) => {
    for (const kind of Object.keys(slots) as DocKind[]) {
      if (e.key === STORAGE_KEY[kind] && !slots[kind].timer) {
        slots[kind].current = null;
        slots[kind].listeners.forEach((l) => l());
      }
    }
  });
}

/** The current draft of `kind`. Loaded from storage on first read. */
export function getDraft(kind: DocKind): BusinessDoc {
  const slot = slots[kind];
  slot.current ??= load(kind);
  return slot.current;
}

/** Replace the draft of `kind` and save it (debounced unless `immediate`). */
export function setDraft(kind: DocKind, next: BusinessDoc, { immediate = false } = {}) {
  const slot = slots[kind];
  slot.current = next;
  slot.listeners.forEach((l) => l());
  if (immediate) save(kind);
  else scheduleSave(kind);
}

/** Forget the saved draft entirely (the "Clear all" button). */
export function clearDraft(kind: DocKind) {
  setDraft(kind, defaultDoc(kind), { immediate: true });
  try {
    window.localStorage.removeItem(STORAGE_KEY[kind]);
  } catch {
    // Nothing stored, or storage blocked — either way nothing is left behind.
  }
}

function makeSubscribe(kind: DocKind) {
  return (l: Listener) => {
    attachGlobalListeners();
    slots[kind].listeners.add(l);
    return () => {
      slots[kind].listeners.delete(l);
    };
  };
}

// Stable per kind, so `useSyncExternalStore` doesn't resubscribe every render.
const subscribe: Record<DocKind, (l: Listener) => () => void> = {
  invoice: makeSubscribe("invoice"),
  quotation: makeSubscribe("quotation"),
};
const snapshot: Record<DocKind, () => BusinessDoc> = {
  invoice: () => getDraft("invoice"),
  quotation: () => getDraft("quotation"),
};
const serverSnapshot: Record<DocKind, () => BusinessDoc> = {
  invoice: () => SERVER_DOC.invoice,
  quotation: () => SERVER_DOC.quotation,
};

/** The live draft for a page. The blank document on the server. */
export function useDraft(kind: DocKind): BusinessDoc {
  return useSyncExternalStore(subscribe[kind], snapshot[kind], serverSnapshot[kind]);
}
