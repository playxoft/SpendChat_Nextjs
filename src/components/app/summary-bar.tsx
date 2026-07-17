"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { optimisticTotals } from "@/lib/summary";
import { cn } from "@/lib/utils";
import { usePendingMessages } from "./pending-messages";

/**
 * The tracker's month balance (income − expense). Rendered from the server
 * total, but folds in the composer's in-flight transactions so the number moves
 * the instant a message is sent — without waiting for the RSC to revalidate.
 *
 * Reconciliation mirrors the chat feed's ghost bubbles: a pending amount is
 * counted until its saved id appears in `serverTxnIds` (at which point the
 * server total already includes it), so it's never double-counted. Both this
 * component's base totals and `serverTxnIds` come from the same server render,
 * so the swap happens in a single commit — no flicker.
 */
export function SummaryBar({
  income: baseIncome,
  expense: baseExpense,
  serverTxnIds,
  currency,
  locale,
  today,
  monthStart,
  monthEnd,
  profileId,
}: {
  income: number;
  expense: number;
  /** Ids already counted by the server total, for the current month + profile. */
  serverTxnIds: string[];
  currency: string;
  locale: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  /** Profile in view; null = "All profiles" (count every pending transaction). */
  profileId: string | null;
}) {
  const { pending } = usePendingMessages();
  const serverSet = useMemo(() => new Set(serverTxnIds), [serverTxnIds]);

  const { income, expense, balance } = useMemo(
    () =>
      optimisticTotals(
        { income: baseIncome, expense: baseExpense },
        pending.map((m) => ({
          status: m.status,
          type: m.type,
          amountMinor: m.amountMinor,
          profileId: m.profileId,
          occurredOn: m.input.occurredOn,
          realId: m.realId,
        })),
        { serverTxnIds: serverSet, profileId, monthStart, monthEnd },
      ),
    [pending, baseIncome, baseExpense, profileId, monthStart, monthEnd, serverSet],
  );

  const negative = balance < 0 && "text-rose-600 dark:text-rose-400";

  return (
    <div className="shrink-0 md:mt-3">
      {/* Mobile: compact balance + in/out sit on the profile row itself. */}
      <div className="flex flex-col items-end leading-tight md:hidden">
        <p className={cn("text-base font-semibold tabular-nums", negative)}>
          {formatMoney(balance, currency, locale)}
        </p>
        <p className="flex gap-2 text-[11px]">
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
          <p className="text-xs text-muted-foreground">{monthLabel(today, locale)} balance</p>
          <p className={cn("text-xl font-semibold tabular-nums", negative)}>
            {formatMoney(balance, currency, locale)}
          </p>
        </div>
        <div className="flex gap-4 pb-1 text-xs">
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
