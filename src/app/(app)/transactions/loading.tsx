import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsResultsSkeleton } from "@/components/app/transactions-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-6 w-40" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-[9.5rem] rounded-md" />
        <Skeleton className="h-9 w-[9.5rem] rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      <div className="mt-4">
        <TransactionsResultsSkeleton />
      </div>
    </div>
  );
}
