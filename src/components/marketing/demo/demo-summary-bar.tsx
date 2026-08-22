"use client";

import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The tracker's balance header, as it reads in the app.
 *
 * Mirrors `SummaryBar` (`src/components/app/summary-bar.tsx`) rather than
 * reusing it: the real one is wired to the month scroll-spy, the server's
 * per-month aggregates and the composer's in-flight sends, none of which exist
 * in a demo. What a visitor actually *sees* is three numbers and their colours,
 * and that's what's copied here — including the emerald-for-income rule and the
 * rose tint a negative balance gets.
 */
export function DemoSummaryBar({
  label,
  balanceMinor,
  incomeMinor,
  expenseMinor,
  className,
}: {
  /** e.g. "August" — the month the feed is showing. */
  label: string;
  balanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  className?: string;
}) {
  const money = useDemoMoney();
  const negative = balanceMinor < 0 && "text-rose-600 dark:text-rose-400";

  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-3 gap-y-1", className)}>
      <div>
        <p className="text-sm text-muted-foreground">{label} balance</p>
        <p className={cn("text-xl font-semibold tabular-nums", negative)}>
          {formatMoney(demoAmount(balanceMinor, money), money.code, money.locale)}
        </p>
      </div>
      <div className="flex gap-4 pb-1 text-sm sm:text-base">
        <span className="text-emerald-600 dark:text-emerald-400">
          +{formatMoney(demoAmount(incomeMinor, money), money.code, money.locale)} in
        </span>
        <span className="text-muted-foreground">
          −{formatMoney(demoAmount(expenseMinor, money), money.code, money.locale)} out
        </span>
      </div>
    </div>
  );
}
