import { Skeleton } from "@/components/ui/skeleton";
import { ChatFeedSkeleton } from "@/components/app/chat-skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 md:block">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              {/* Desktop-only actions */}
              <Skeleton className="hidden size-8 shrink-0 rounded-md md:block" />
              <Skeleton className="hidden h-8 w-[5.5rem] shrink-0 rounded-md md:block" />
            </div>

            {/* Balance: compact on mobile (inline), full block on desktop (row 2). */}
            <div className="shrink-0 md:mt-3">
              <div className="flex flex-col items-end gap-1 md:hidden">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="hidden items-end justify-between gap-3 md:flex">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-28" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <ChatFeedSkeleton />
      </div>
    </div>
  );
}
