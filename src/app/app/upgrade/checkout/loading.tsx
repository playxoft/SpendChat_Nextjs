import { Skeleton } from "@/components/ui/skeleton";
import { AccountControls } from "@/components/app/account-controls";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <AccountControls />
      </div>
      <div className="max-w-2xl space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}
