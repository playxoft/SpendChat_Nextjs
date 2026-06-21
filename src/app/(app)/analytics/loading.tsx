import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsResultsSkeleton } from "@/components/app/analytics-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-72 rounded-md" />
        <Skeleton className="h-9 w-[9.5rem] rounded-md" />
        <Skeleton className="h-9 w-[9.5rem] rounded-md" />
      </div>

      <AnalyticsResultsSkeleton />
    </div>
  );
}
