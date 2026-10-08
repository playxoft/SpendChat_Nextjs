import { AnalyticsFiltersSkeleton } from "@/components/app/analytics-filters";
import { AnalyticsResultsSkeleton, InsightsSkeleton } from "@/components/app/analytics-skeleton";
import { ANALYTICS_SHELL, SkeletonLine } from "@/components/app/analytics/widget";
import { PrintButton } from "@/components/app/print-button";

/**
 * The analytics page before its data: the same shell, heading and grid as the
 * page (`ANALYTICS_SHELL`, `WidgetCard`), so nothing changes width when the
 * widgets arrive.
 */
export default function Loading() {
  return (
    <div className={ANALYTICS_SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <SkeletonLine className="w-48" />
        </div>
        <PrintButton />
      </div>

      <AnalyticsFiltersSkeleton />

      <AnalyticsResultsSkeleton />
      <InsightsSkeleton />
    </div>
  );
}
