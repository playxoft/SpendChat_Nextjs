"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
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
  const money = useDemoMoney();
  const [profile, setProfile] = useState<DemoProfile>(initialProfile);
  // Only the rows a demo has *added*. The seeds are derived rather than seeded
  // into state, so they can follow the visitor's currency once it resolves
  // after hydration instead of freezing whatever the server rendered.
  const [added, setAdded] = useState<Record<DemoProfile, DemoTxn[]>>({
    Personal: [],
    Home: [],
    Business: [],
  });

  // Ids only have to be unique within the session; starting well past the seed
  // ids keeps them from colliding as the visitor adds rows.
  const nextId = useRef(1000);

  /**
   * Currency conversion happens **here and only here**.
   *
   * The seeds are written in USD minor units and scaled to the visitor's
   * currency; anything a demo adds at runtime was already built from
   * `demoAmountInput`, so it is local already. Scaling further downstream — in
   * `DemoFeed`, say — cannot tell the two apart, and multiplies the added rows
   * a second time: a ₹1,000 lunch imported through the bulk demo came out as
   * ₹80,000.
   */
  const txns = useMemo(
    () => [
      ...DEMO_SEEDS[profile].map((t) => ({
        ...t,
        amountMinor: demoAmount(t.amountMinor, money),
      })),
      ...added[profile],
    ],
    [profile, added, money],
  );

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
      setAdded((prev) => ({ ...prev, [profile]: [...prev[profile], row] }));
      return row;
    },
    [profile],
  );

  /** Append several at once — what the AI, voice and bulk demos confirm with. */
  const addMany = useCallback(
    (rows: (Omit<DemoTxn, "id" | "timeLabel"> & { timeLabel?: string })[]) => {
      setAdded((prev) => ({
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
    setAdded({ Personal: [], Home: [], Business: [] });
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
