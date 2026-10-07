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
import { monthRange } from "@/lib/dates";
import { CALENDAR_MAX_MONTHS, monthCount } from "@/lib/insights";
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

/** A valid `YYYY-MM-DD` from the URL, or null. */
function urlDate(sp: URLSearchParams | null, key: string): string | null {
  const v = sp?.get(key);
  return v && DATE_RE.test(v) ? v : null;
}

/*
 * The two guesses below read the URL alone — never a clock — so the server's
 * render of `loading.tsx` and the browser's hydration of it always agree (the
 * server's "today" is UTC; the page's is the viewer's zone). The page passes
 * its own exact values to its own fallbacks.
 */

/**
 * How many months the spending calendar will show: none in the URL is the
 * page's default range, this month (1); "All time" is always the last 12; an
 * explicit range is its months, at most 12. (A custom range running into
 * months still to come would show fewer — those months aren't drawn yet.)
 */
function calendarMonthsFromUrl(sp: URLSearchParams | null): number {
  if (sp?.get("span") === "all") return CALENDAR_MAX_MONTHS;
  const from = urlDate(sp, "from");
  const to = urlDate(sp, "to");
  if (!from || !to) return 1;
  return Math.min(CALENDAR_MAX_MONTHS, Math.max(1, monthCount({ from, to })));
}

/**
 * Whether budgets will show: the default range (this month), or an explicit
 * range that is one whole month — the "This month" preset writes exactly that.
 */
function rangeIsThisMonth(sp: URLSearchParams | null): boolean {
  if (sp?.get("span") === "all") return false;
  const from = urlDate(sp, "from");
  const to = urlDate(sp, "to");
  if (!from && !to) return true;
  if (!from || !to) return false;
  const { start, end } = monthRange(from);
  return from === start && to === end;
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
