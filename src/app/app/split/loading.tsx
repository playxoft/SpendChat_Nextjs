import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
