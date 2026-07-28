"use client";

import { useState } from "react";
import type { TransactionRow } from "@/lib/queries";

/**
 * A client overlay so an edit or delete shows on the row in the SAME commit as
 * the success toast — instead of the row only changing on the later server
 * revalidation (which is why the toast used to land before the row updated).
 *
 * - `patch(fields)` merges fields onto the displayed row (optimistic edit).
 * - `remove()` hides the row (optimistic delete).
 *
 * The patch is dropped the moment a fresh server row object arrives (a
 * revalidation landed), at which point the server data is authoritative — so a
 * patched row never drifts from the truth, and a removed row is simply gone from
 * the next server render, so the component unmounts.
 */
export function useOptimisticRow(row: TransactionRow) {
  const [patch, setPatch] = useState<Partial<TransactionRow> | null>(null);
  const [removed, setRemoved] = useState(false);
  const [seen, setSeen] = useState(row);

  // A new server row object means a fresh render reached us — the optimistic
  // patch has been superseded by real data, so retire it (adjust-state-during-
  // render, no effect needed).
  if (row !== seen) {
    setSeen(row);
    if (patch) setPatch(null);
  }

  return {
    row: patch ? { ...row, ...patch } : row,
    removed,
    patch: (fields: Partial<TransactionRow>) => setPatch(fields),
    remove: () => setRemoved(true),
  };
}
