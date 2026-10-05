"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * A multi-selection over a list of rows, for the tracker feed and the
 * transactions table. Holds ids, not rows, so the selection survives the rows
 * being replaced (a bulk edit's read-back, a revalidation) — and the selected
 * rows are derived from whatever is on screen, so a row that has gone (deleted,
 * filtered out, paged away) simply stops counting.
 *
 * Shift-toggling selects the run between the last toggled row and this one, in
 * the list's own order, the way a file manager does.
 */
export function useRowSelection<T extends { id: string }>(rows: T[]) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  // Ids whose row has left the list (deleted, moved out of view, paged away by
  // a refresh) are dropped, so a row scrolled back in later doesn't come back
  // already ticked behind the user's back (adjust-state-during-render).
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    setSeenRows(rows);
    const present = new Set(rows.map((r) => r.id));
    if ([...ids].some((id) => !present.has(id))) {
      setIds(new Set([...ids].filter((id) => present.has(id))));
    }
  }

  const selectedRows = useMemo(() => rows.filter((r) => ids.has(r.id)), [rows, ids]);

  const toggle = useCallback(
    (id: string, range = false) => {
      // Read the anchor here, not in the updater: React runs the updater later,
      // by which time the anchor has already moved to this row.
      const from = range && anchor.current ? rows.findIndex((r) => r.id === anchor.current) : -1;
      const anchorId = anchor.current;
      anchor.current = id;
      setIds((prev) => {
        const next = new Set(prev);
        const to = rows.findIndex((r) => r.id === id);
        if (from >= 0 && to >= 0 && anchorId) {
          // The run takes the state the anchor has, so shift-clicking extends a
          // selection rather than flipping each row in it.
          const on = prev.has(anchorId);
          const [lo, hi] = from < to ? [from, to] : [to, from];
          for (const r of rows.slice(lo, hi + 1)) {
            if (on) next.add(r.id);
            else next.delete(r.id);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [rows],
  );

  const selectAll = useCallback(() => setIds(new Set(rows.map((r) => r.id))), [rows]);
  const clear = useCallback(() => {
    setIds(new Set());
    anchor.current = null;
  }, []);

  return {
    selectedRows,
    count: selectedRows.length,
    isSelected: (id: string) => ids.has(id),
    toggle,
    selectAll,
    clear,
  };
}

export type RowSelection = ReturnType<typeof useRowSelection>;
