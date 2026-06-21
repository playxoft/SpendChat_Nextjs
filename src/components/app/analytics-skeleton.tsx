import { Skeleton } from "@/components/ui/skeleton";

/** Stat cards + pie + trend placeholders, shared by loading.tsx and the
 * filter-change Suspense fallback. */
export function AnalyticsResultsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-6">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="size-56 shrink-0 rounded-full" />
          <div className="w-full flex-1 space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-6">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </>
  );
}
