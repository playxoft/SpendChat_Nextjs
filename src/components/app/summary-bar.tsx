"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/money";
import { monthLabel, monthRange } from "@/lib/dates";
import { optimisticTotals } from "@/lib/summary";
import type { MonthTotals } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { usePendingMessages } from "./pending-messages";
import { useActiveMonth } from "./active-month";

/**
 * The tracker's balance for the month currently under the header. As the user
 * scrolls across months, `useActiveMonth()` reports which one is in view and
 * this bar swaps to that month's income / expense / balance — read from
 * `monthTotals` (one server aggregate covering the whole scroll window).
 *
 * The current month additionally folds in the composer's in-flight sends so the
 * number moves the instant a message is sent (pending transactions are always
 * dated today, so they only ever touch the current month). Reconciliation
 * mirrors the chat feed's ghost bubbles: a pending amount is counted until its
 * saved id appears in `serverTxnIds` — at which point the server total already
 * includes it — so it's never double-counted, and the swap has no flicker.
 */
export function SummaryBar({
  monthTotals,
  currentMonthKey,
  serverTxnIds,
  currency,
  locale,
  profileId,
}: {
  /** Per-month income/expense across the loaded scroll window, keyed "YYYY-MM". */
  monthTotals: MonthTotals[];
  /** The current calendar month ("YYYY-MM") — the only one pending sends touch. */
  currentMonthKey: string;
  /** Ids already counted by the current month's server total (for reconciliation). */
  serverTxnIds: string[];
  currency: string;
  locale: string;
  /** Profile in view; null = "All profiles" (count every pending transaction). */
  profileId: string | null;
}) {
  const { activeMonth } = useActiveMonth();
  const { pending } = usePendingMessages();
  const serverSet = useMemo(() => new Set(serverTxnIds), [serverTxnIds]);
  const totalsByMonth = useMemo(() => {
    const map = new Map<string, MonthTotals>();
    for (const t of monthTotals) map.set(t.month, t);
    return map;
  }, [monthTotals]);

  const { income, expense, balance } = useMemo(() => {
    const base = totalsByMonth.get(activeMonth) ?? { income: 0, expense: 0 };
    // Only the current month has in-flight sends to fold in; past months are
    // read straight off the server aggregate.
    if (activeMonth !== currentMonthKey) {
      return { income: base.income, expense: base.expense, balance: base.income - base.expense };
    }
    const { start, end } = monthRange(`${currentMonthKey}-01`);
    return optimisticTotals(
      { income: base.income, expense: base.expense },
      pending.map((m) => ({
        status: m.status,
        type: m.type,
        amountMinor: m.amountMinor,
        profileId: m.profileId,
        occurredOn: m.input.occurredOn,
        realId: m.realId,
      })),
      { serverTxnIds: serverSet, profileId, monthStart: start, monthEnd: end },
    );
  }, [activeMonth, currentMonthKey, totalsByMonth, pending, serverSet, profileId]);

  const negative = balance < 0 && "text-rose-600 dark:text-rose-400";
  const label = monthLabel(activeMonth, locale);

  return (
    <div className="shrink-0 md:mt-3">
      {/* Mobile: compact month + balance + in/out sit on the profile row itself. */}
      <div className="flex flex-col items-end leading-tight md:hidden">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-base font-semibold tabular-nums", negative)}>
          {formatMoney(balance, currency, locale)}
        </p>
        <p className="flex gap-2 text-sm">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{formatMoney(income, currency, locale)}
          </span>
          <span className="text-muted-foreground">
            −{formatMoney(expense, currency, locale)}
          </span>
        </p>
      </div>

      {/* Desktop: the full balance block on its own line below the profile. */}
      <div className="hidden flex-wrap items-end justify-between gap-x-3 gap-y-1 md:flex">
        <div>
          <p className="text-sm text-muted-foreground">{label} balance</p>
          <p className={cn("text-xl font-semibold tabular-nums", negative)}>
            {formatMoney(balance, currency, locale)}
          </p>
        </div>
        <div className="flex gap-4 pb-1 text-base">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{formatMoney(income, currency, locale)} in
          </span>
          <span className="text-muted-foreground">
            −{formatMoney(expense, currency, locale)} out
          </span>
        </div>
      </div>
    </div>
  );
}
