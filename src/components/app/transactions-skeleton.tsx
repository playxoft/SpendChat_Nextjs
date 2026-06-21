import { Skeleton } from "@/components/ui/skeleton";

/** Count line + table placeholder, shared by loading.tsx and the filter-change
 * Suspense fallback. */
export function TransactionsResultsSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-56" />
      <div className="mt-4 overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="hidden h-4 w-40 md:block" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
