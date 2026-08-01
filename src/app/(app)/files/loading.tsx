import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the files page while the server loads the vault. Folder
 * navigation inside the page is client-side (pushState) and instant — this
 * shows on the real server loads: first visit, profile switches, refreshes.
 */
export default function FilesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-16" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="size-8" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border p-2">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
