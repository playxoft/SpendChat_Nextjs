import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <Skeleton className="h-9 w-[5.5rem] shrink-0 rounded-md" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 px-4 py-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <BubbleSkeleton key={i} side={i % 2 === 0 ? "left" : "right"} wide={i % 3 === 0} />
        ))}
      </div>
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
