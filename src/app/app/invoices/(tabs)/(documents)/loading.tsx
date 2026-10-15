import { Skeleton } from "@/components/ui/skeleton";
import { AccountControls } from "@/components/app/account-controls";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>
        <AccountControls />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-64 rounded-full" />
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
      <div className="divide-y rounded-xl border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
