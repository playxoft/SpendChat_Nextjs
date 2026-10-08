"use client";

import { Suspense, use } from "react";
import { cn } from "@/lib/utils";

export type BudgetAlertCount = { warn: number; over: number };

/**
 * The count beside "Budgets" in the nav: visible budgets at 80% or more this
 * month, red once any is over. The layout passes the count as a promise it
 * doesn't wait for, so the badge streams in and never holds a page up.
 */
export function BudgetNavBadge({
  alerts,
  className,
}: {
  alerts?: Promise<BudgetAlertCount>;
  className?: string;
}) {
  if (!alerts) return null;
  return (
    <Suspense fallback={null}>
      <Count alerts={alerts} className={className} />
    </Suspense>
  );
}

function Count({ alerts, className }: { alerts: Promise<BudgetAlertCount>; className?: string }) {
  const { warn, over } = use(alerts);
  if (warn === 0) return null;
  const label =
    over > 0
      ? `${over} budget${over === 1 ? "" : "s"} over this month`
      : `${warn} budget${warn === 1 ? "" : "s"} past 80% this month`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
        over > 0 ? "bg-destructive text-white" : "bg-amber-500 text-white",
        className,
      )}
    >
      {warn}
    </span>
  );
}
