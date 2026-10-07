"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlan } from "@/components/app/upgrade-dialog";
import { InsightsSectionSkeleton } from "@/components/app/analytics/insights-section";
import {
  BODY,
  SkeletonLine,
  WIDGET_GRID,
  WidgetCardSkeleton,
} from "@/components/app/analytics/widget";
import { monthRange, todayISO } from "@/lib/dates";
import { calendarWindow, monthCount } from "@/lib/insights";
import { PLAN_LIMITS } from "@/lib/plans";

/**
 * The analytics page's placeholders — `loading.tsx` and the page's own
 * Suspense fallbacks. Built from the same `WidgetCard` layout, grid and body
 * heights as the widgets (`analytics/widget.tsx`), so the cards are exactly as
 * wide as what replaces them and no taller than it.
 *
 * Which cards show depends on the plan (Plus and Pro see the 12-month cash
 * flow instead of the 6-month trend) and on whether budgets show (this month
 * only). The page passes both when it knows them; in `loading.tsx` they come
 * from the plan the layout already resolved (`usePlan`) and from the URL.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The months the spending calendar will show for the URL's range — the page's
 * own rule (`calendarWindow`), with today from the browser. Only for
 * `loading.tsx`; the page passes the exact count to its own fallback.
 */
function calendarMonthsFromUrl(sp: URLSearchParams | null): number {
  const today = todayISO();
  if (sp?.get("span") === "all") return monthCount(calendarWindow(today));
  const { start, end } = monthRange(today);
  const from = sp?.get("from");
  const to = sp?.get("to");
  return monthCount(
    calendarWindow(today, from && DATE_RE.test(from) ? from : start, to && DATE_RE.test(to) ? to : end),
  );
}

/** Whether the URL's range is the current month (the default view). */
function rangeIsThisMonth(sp: URLSearchParams | null): boolean {
  if (!sp) return true;
  if (sp.get("span") === "all") return false;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from && !to) return true;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return from === `${month}-01` && to === `${month}-${String(last).padStart(2, "0")}`;
}

/** Income / Expenses / Net, at the stat cards' exact line heights. */
function StatCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
      {["w-16", "w-20", "w-10"].map((w, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <SkeletonLine className={w} />
          <SkeletonLine className="h-6 w-28" lineClassName="mt-1 h-8" />
        </div>
      ))}
    </div>
  );
}

export function AnalyticsResultsSkeleton({
  trend,
  budgets,
  type,
}: {
  /** The 6-month trend card (Free). Defaults from the plan. */
  trend?: boolean;
  /** Placeholder budget rows; defaults from the workspace's budgets and the URL. */
  budgets?: number;
  /** The Type filter, which names the category card. Defaults from the URL. */
  type?: "income" | "expense";
}) {
  const { plan, addLimits } = usePlan();
  const sp = useSearchParams();
  const income = (type ?? sp?.get("type")) === "income";
  const showTrend = trend ?? !PLAN_LIMITS[plan].advancedAnalytics;
  const budgetRows =
    budgets ?? (rangeIsThisMonth(sp) ? Math.min(addLimits?.budgets?.used ?? 0, 6) : 0);

  return (
    <>
      <StatCardsSkeleton />

      {budgetRows > 0 ? (
        <div className={WIDGET_GRID}>
          <WidgetCardSkeleton
            span="full"
            title="Budgets this month"
            description={
              <>
                Spending against each monthly limit. <span className="underline underline-offset-4">Manage budgets</span>
              </>
            }
          >
            <div className="space-y-4">
              {Array.from({ length: budgetRows }, (_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SkeletonLine className="w-32" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <SkeletonLine className="h-3 w-full" lineClassName="h-4" />
                  </div>
                </div>
              ))}
            </div>
          </WidgetCardSkeleton>
        </div>
      ) : null}

      <div className={WIDGET_GRID}>
        <WidgetCardSkeleton
          span="full"
          title={income ? "Income by category" : "Spending by category"}
          description={`${income ? "Income" : "Expenses"} for the selected range`}
          bodyClassName={BODY.categories}
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Skeleton className="size-56 shrink-0 rounded-full" />
            <div className="w-full flex-1 space-y-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonLine key={i} className="w-full" lineClassName="h-7 px-2" />
              ))}
            </div>
          </div>
        </WidgetCardSkeleton>

        {showTrend ? (
          <WidgetCardSkeleton
            span="full"
            title="Last 6 months"
            description="Income vs. expenses"
            bodyClassName={BODY.trend}
          >
            <SkeletonLine className="h-3 w-40" lineClassName="mb-4 h-4" />
            <div className="space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-12 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-2.5 w-full rounded-full" />
                    <Skeleton className="h-2.5 w-4/5 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </WidgetCardSkeleton>
        ) : null}
      </div>
    </>
  );
}

/** "Insights & trends" while it loads: locked (Free) or streaming (Plus/Pro). */
export function InsightsSkeleton() {
  const { plan } = usePlan();
  const sp = useSearchParams();
  return (
    <InsightsSectionSkeleton
      locked={!PLAN_LIMITS[plan].advancedAnalytics}
      calendarMonths={calendarMonthsFromUrl(sp)}
    />
  );
}
