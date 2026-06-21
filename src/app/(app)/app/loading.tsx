import { Skeleton } from "@/components/ui/skeleton";
import { ChatBalanceSkeleton, ChatFeedSkeleton } from "@/components/app/chat-skeleton";

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
          <ChatBalanceSkeleton />
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <ChatFeedSkeleton />
      </div>
    </div>
  );
}
