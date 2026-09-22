"use client";

import { useSyncExternalStore } from "react";

export type ColumnId =
  | "date"
  | "category"
  | "title"
  | "tags"
  | "attachments"
  | "description"
  | "amount"
  | "user";

export const COLUMN_IDS: ColumnId[] = [
  "date",
  "category",
  "title",
  "tags",
  "attachments",
  "description",
  "amount",
  "user",
];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  date: "Date",
  category: "Category",
  title: "Title",
  tags: "Tags",
  attachments: "Attachments",
  description: "Description",
  amount: "Amount",
  user: "User",
};

/** Starting width (px) for each column; user resizes are stored as overrides. */
export const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  date: 128,
  category: 176,
  title: 220,
  tags: 200,
  attachments: 200,
  description: 256,
  amount: 132,
  user: 220,
};

/** Columns that start hidden — visible only when the user opts in via the
 * columns menu. `user` (author name + email) is noise in a solo workspace, so
 * it's off by default. A column added here is hidden for existing users too
 * (see `normalizeHidden`), without resetting their saved layout. */
const DEFAULT_HIDDEN: ColumnId[] = ["user"];

export const MIN_COLUMN_WIDTH = 72;

export type ColumnLayout = {
  order: ColumnId[];
  hidden: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
};

const STORAGE_KEY = "spendchat:txn-columns";

// A single stable default reference — used as the server snapshot so hydration
// always matches the server-rendered HTML (see the store notes below).
const DEFAULT_LAYOUT: ColumnLayout = { order: COLUMN_IDS, hidden: DEFAULT_HIDDEN, widths: {} };

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === "string" && (COLUMN_IDS as string[]).includes(value);
}

/**
 * Normalize a stored order without discarding it: keep the known ids in their
 * saved order, drop any that no longer exist, and slot in columns added since
 * the layout was saved.
 *
 * A new column goes **where it belongs in the default order**, not at the end:
 * straight after the nearest column that precedes it in `COLUMN_IDS` and that
 * the user still has. Appending was the obvious thing and it was wrong —
 * "tags" landed to the right of Amount and User, off the edge of the table, so
 * the people most likely to have a saved layout were the ones who couldn't see
 * the new column at all. Slotting it in preserves every relative order the
 * user chose (nothing else moves) and still isn't a reset.
 *
 * Exported for its tests: this is the only pure part of the store, and it is
 * the part that decides whether a new column is visible to an existing user.
 */
export function normalizeOrder(value: unknown): ColumnId[] {
  const stored = Array.isArray(value) ? value.filter(isColumnId) : [];
  if (stored.length === 0) return COLUMN_IDS;
  const out = [...stored];
  const have = new Set(stored);
  COLUMN_IDS.forEach((id, i) => {
    if (have.has(id)) return;
    // The nearest default-order predecessor the user still has; the new column
    // goes directly after it, or first when there is none.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.indexOf(COLUMN_IDS[j]!);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, id);
    have.add(id);
  });
  return out;
}

/**
 * Normalize the hidden set. A column in `DEFAULT_HIDDEN` that's *missing* from
 * the stored order is one added after this layout was saved — start it hidden,
 * so a new default-hidden column is off for existing users too. Once the user
 * toggles it, it's in their stored order and this no longer applies (their
 * choice sticks).
 */
function normalizeHidden(value: unknown, storedOrder: unknown): ColumnId[] {
  const stored = Array.isArray(value) ? value.filter(isColumnId) : [];
  const knownOrder = Array.isArray(storedOrder) ? storedOrder.filter(isColumnId) : [];
  const inOrder = new Set(knownOrder);
  const hidden = new Set<ColumnId>(stored);
  for (const id of DEFAULT_HIDDEN) {
    if (!inOrder.has(id)) hidden.add(id);
  }
  const ids = [...hidden];
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
      return { order: normalizeOrder(parsed), hidden: normalizeHidden([], parsed), widths: {} };
    }
    if (parsed && typeof parsed === "object") {
      return {
        order: normalizeOrder(parsed.order),
        hidden: normalizeHidden(parsed.hidden, parsed.order),
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
