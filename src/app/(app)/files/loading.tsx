import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the files page while the server loads the vault. Folder
 * navigation inside the page is client-side (pushState) and instant — this
 * shows on the real server loads: first visit, profile switches, refreshes.
 *
 * Mirrors the real toolbar's *responsive* shape, not just its desktop one. The
 * earlier version laid the toolbar out as one un-wrapping row of fixed widths
 * (~544px of skeleton), which forced a horizontal scrollbar on any phone — a
 * skeleton that reflows the page is worse than no skeleton, because the layout
 * visibly jumps when the real content replaces it.
 */
export default function FilesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      {/* Title + toolbar. Wraps exactly like the real header. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-16" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search: matches `w-44 sm:w-56` on the real input. */}
          <Skeleton className="h-8 w-44 sm:w-56" />
          {/* View toggle: three `size-8` buttons in one bordered group. */}
          <Skeleton className="h-9 w-[6.5rem]" />
          {/* New folder (icon) + Upload. */}
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Breadcrumb / count row + sort controls. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-5 w-28 sm:w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16 sm:w-20" />
          <Skeleton className="h-8 w-24 sm:w-28" />
          <Skeleton className="size-8" />
        </div>
      </div>

      {/* Tiles. Two per row on the narrowest phones — three `aspect-square`
          tiles plus their captions overflow a 320px viewport once the 4px gaps
          and page padding are taken out. */}
      <div className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={
              // Past the sixth tile a phone is only rendering skeleton below the
              // fold, which is what made the page scroll further than the real
              // content does. Reveal the extra rows with the columns.
              i >= 6 ? "hidden space-y-1.5 rounded-lg border p-2 sm:block" : "space-y-1.5 rounded-lg border p-2"
            }
          >
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
