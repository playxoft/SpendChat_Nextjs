import { Skeleton } from "@/components/ui/skeleton";

/** The chat's shape while it loads: header, a few bubbles either side, the composer. */
export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2 sm:px-4">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-4 py-4">
        <Skeleton className="mx-auto h-5 w-20 rounded-full" />
        {[false, true, false, true].map((right, i) => (
          <div key={i} className={right ? "flex justify-end" : "flex"}>
            <Skeleton className="h-16 w-3/4 max-w-sm rounded-2xl" />
          </div>
        ))}
      </div>
      <div className="px-3 pb-2">
        <Skeleton className="mx-auto h-24 max-w-3xl rounded-2xl" />
      </div>
    </div>
  );
}
