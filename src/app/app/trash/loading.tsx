import { Skeleton } from "@/components/ui/skeleton";
import { AccountControls } from "@/components/app/account-controls";

/** Skeleton for the trash page while the server loads it — the real header, tabs and rows' shape. */
export default function TrashLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <AccountControls />
      </div>
      <Skeleton className="h-8 w-56" />
      <div className="divide-y rounded-lg border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="size-4" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
