import { Skeleton } from "@/components/ui/skeleton";

/** The chat column's placeholder while Ask's list loads (desktop only, like the column). */
export default function Loading() {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-background lg:flex">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="space-y-2 px-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-4/5 rounded-lg" />
        <Skeleton className="h-8 w-3/5 rounded-lg" />
      </div>
    </aside>
  );
}
