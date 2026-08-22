"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEMO_SEEDS,
  demoTimeLabel,
  type DemoProfile,
  type DemoTxn,
  type DemoTxnType,
} from "./demo-data";
import { signedMinor } from "@/lib/money";

/**
 * Local state for any demo that shows a transaction feed: the chat demo, the AI
 * demo, the voice demo and the profiles demo all run on this.
 *
 * Deliberately account-free and network-free — `useState` and nothing else. A
 * marketing page must stay statically rendered, so a demo may not reach a
 * server action, the database, or `@/lib/queries`; pulling any of those into
 * this import graph would drag the server tree into the client bundle and break
 * the Worker build. It also means a visitor can hammer the demo without
 * creating anything, which is the whole point.
 */
export function useDemoFeed(initialProfile: DemoProfile = "Personal") {
  const [profile, setProfile] = useState<DemoProfile>(initialProfile);
  const [byProfile, setByProfile] =
    useState<Record<DemoProfile, DemoTxn[]>>(DEMO_SEEDS);

  // Ids only have to be unique within the session; starting well past the seed
  // ids keeps them from colliding as the visitor adds rows.
  const nextId = useRef(1000);

  const txns = byProfile[profile];

  const balanceMinor = useMemo(
    () => txns.reduce((sum, t) => sum + signedMinor(t.type, t.amountMinor), 0),
    [txns],
  );

  const totals = useMemo(() => {
    let incomeMinor = 0;
    let expenseMinor = 0;
    for (const t of txns) {
      if (t.type === "income") incomeMinor += t.amountMinor;
      else expenseMinor += t.amountMinor;
    }
    return { incomeMinor, expenseMinor };
  }, [txns]);

  /** Append one transaction to the active profile's feed. */
  const add = useCallback(
    (txn: Omit<DemoTxn, "id" | "timeLabel"> & { timeLabel?: string }) => {
      const row: DemoTxn = {
        ...txn,
        id: nextId.current++,
        timeLabel: txn.timeLabel ?? demoTimeLabel(),
      };
      setByProfile((prev) => ({ ...prev, [profile]: [...prev[profile], row] }));
      return row;
    },
    [profile],
  );

  /** Append several at once — what the AI, voice and bulk demos confirm with. */
  const addMany = useCallback(
    (rows: (Omit<DemoTxn, "id" | "timeLabel"> & { timeLabel?: string })[]) => {
      setByProfile((prev) => ({
        ...prev,
        [profile]: [
          ...prev[profile],
          ...rows.map((r) => ({
            ...r,
            id: nextId.current++,
            timeLabel: r.timeLabel ?? demoTimeLabel(),
          })),
        ],
      }));
    },
    [profile],
  );

  /** Back to the seeded state — every demo offers a way out of a messy session. */
  const reset = useCallback(() => {
    setByProfile(DEMO_SEEDS);
  }, []);

  return {
    profile,
    setProfile,
    txns,
    balanceMinor,
    totals,
    add,
    addMany,
    reset,
  };
}

export type { DemoProfile, DemoTxn, DemoTxnType };
