import { Skeleton } from "@/components/ui/skeleton";

/** The groups list's shape while it loads: a chat list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="divide-y rounded-xl border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
