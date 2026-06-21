import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The balance + in/out line under the chat header. */
export function ChatBalanceSkeleton() {
  return (
    <div className="mt-3 flex items-end justify-between gap-3">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

function BubbleSkeleton({ side, wide }: { side: "left" | "right"; wide: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full max-w-md items-start gap-2.5",
        side === "right" && "ml-auto flex-row-reverse",
      )}
    >
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 rounded-2xl border bg-card px-3.5 py-2.5">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        {wide ? <Skeleton className="h-3 w-3/4" /> : null}
        <div className="flex justify-between gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

/** The chat message list. */
export function ChatFeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <BubbleSkeleton key={i} side={i % 2 === 0 ? "left" : "right"} wide={i % 3 === 0} />
      ))}
    </div>
  );
}
