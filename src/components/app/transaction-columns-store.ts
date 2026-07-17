"use client";

import { useSyncExternalStore } from "react";

export type ColumnId = "date" | "category" | "title" | "description" | "amount";

export const COLUMN_IDS: ColumnId[] = ["date", "category", "title", "description", "amount"];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  date: "Date",
  category: "Category",
  title: "Title",
  description: "Description",
  amount: "Amount",
};

/** Starting width (px) for each column; user resizes are stored as overrides. */
export const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  date: 128,
  category: 176,
  title: 220,
  description: 256,
  amount: 132,
};

export const MIN_COLUMN_WIDTH = 72;

export type ColumnLayout = {
  order: ColumnId[];
  hidden: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
};

const STORAGE_KEY = "spendchat:txn-columns";

// A single stable default reference — used as the server snapshot so hydration
// always matches the server-rendered HTML (see the store notes below).
const DEFAULT_LAYOUT: ColumnLayout = { order: COLUMN_IDS, hidden: [], widths: {} };

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === "string" && (COLUMN_IDS as string[]).includes(value);
}

/** Only trust a stored order that's an exact permutation of the known columns. */
function normalizeOrder(value: unknown): ColumnId[] {
  if (
    Array.isArray(value) &&
    value.length === COLUMN_IDS.length &&
    COLUMN_IDS.every((id) => value.includes(id))
  ) {
    return value as ColumnId[];
  }
  return COLUMN_IDS;
}

function normalizeHidden(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.filter(isColumnId))];
  // Never let every column be hidden — keep at least one visible.
  return ids.length >= COLUMN_IDS.length ? ids.slice(0, COLUMN_IDS.length - 1) : ids;
}

function normalizeWidths(value: unknown): Partial<Record<ColumnId, number>> {
  const out: Partial<Record<ColumnId, number>> = {};
  if (value && typeof value === "object") {
    for (const id of COLUMN_IDS) {
      const w = (value as Record<string, unknown>)[id];
      if (typeof w === "number" && Number.isFinite(w)) {
        out[id] = Math.max(MIN_COLUMN_WIDTH, Math.round(w));
      }
    }
  }
  return out;
}

function readStored(): ColumnLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    // Legacy format: the store used to hold just the order array.
    if (Array.isArray(parsed)) {
      return { order: normalizeOrder(parsed), hidden: [], widths: {} };
    }
    if (parsed && typeof parsed === "object") {
      return {
        order: normalizeOrder(parsed.order),
        hidden: normalizeHidden(parsed.hidden),
        widths: normalizeWidths(parsed.widths),
      };
    }
  } catch {
    // ignore unreadable/malformed storage
  }
  return DEFAULT_LAYOUT;
}

// The column layout (order + visibility + widths) is a device-local view
// preference kept in localStorage, exposed as a tiny external store so
// `useSyncExternalStore` reads it SSR-safely: the server snapshot is always the
// default (matching the rendered HTML), and after hydration React swaps in the
// stored layout. The cached snapshot is referentially stable, so render never
// loops, and a module cache makes in-app remounts flash-free.
const listeners = new Set<() => void>();
let snapshot: ColumnLayout | null = null;

function getSnapshot(): ColumnLayout {
  if (snapshot === null) snapshot = readStored();
  return snapshot;
}

function getServerSnapshot(): ColumnLayout {
  return DEFAULT_LAYOUT;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Reflect edits made in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    snapshot = readStored();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(next: ColumnLayout) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore write failures (private mode / quota)
  }
  listeners.forEach((l) => l());
}

export function useColumnLayout(): ColumnLayout {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Visible columns in their current order. */
export function getVisibleColumns(layout: ColumnLayout): ColumnId[] {
  return layout.order.filter((id) => !layout.hidden.includes(id));
}

export function setColumnOrder(order: ColumnId[]) {
  commit({ ...getSnapshot(), order });
}

export function setColumnWidth(id: ColumnId, width: number) {
  const cur = getSnapshot();
  commit({
    ...cur,
    widths: { ...cur.widths, [id]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) },
  });
}

export function toggleColumnVisible(id: ColumnId) {
  const cur = getSnapshot();
  if (cur.hidden.includes(id)) {
    commit({ ...cur, hidden: cur.hidden.filter((h) => h !== id) });
    return;
  }
  // Refuse to hide the last visible column.
  if (COLUMN_IDS.length - cur.hidden.length <= 1) return;
  commit({ ...cur, hidden: [...cur.hidden, id] });
}

export function resetColumns() {
  commit(DEFAULT_LAYOUT);
}
