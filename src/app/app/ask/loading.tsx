import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-[calc(100svh-7.5rem)] flex-col md:min-h-[calc(100svh-3.5rem)]">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
          <Skeleton className="size-7 rounded-md lg:hidden" />
          <Skeleton className="h-4 w-40" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-56 rounded-2xl rounded-tr-sm" />
        </div>
        <div className="flex items-start gap-2.5">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-28 w-full max-w-lg rounded-2xl rounded-tl-sm" />
        </div>
      </div>
      <div className="sticky bottom-16 bg-background px-3 pt-2 pb-2 md:bottom-0">
        <Skeleton className="mx-auto h-24 max-w-3xl rounded-2xl" />
      </div>
    </div>
  );
}
