"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full-screen loader shown over the whole app during a blocking navigation so
 * the screen never looks hung. Fixed and above dialogs/sheets (z-100) so it
 * covers whatever is on screen.
 *
 * `variant`:
 * - `"skeleton"` (default) paints a placeholder page under a centered spinner —
 *   good when the destination has a familiar layout (creating a workspace, the
 *   composer).
 * - `"spinner"` shows only the centered spinner on an opaque background — used
 *   for switching workspaces, where a skeleton of the *previous* layout would
 *   just be misleading.
 */
export function FullscreenLoader({
  label = "Loading…",
  variant = "skeleton",
}: {
  label?: string;
  variant?: "skeleton" | "spinner";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      {variant === "skeleton" && (
        <>
          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-3/4 rounded-xl" />
            <Skeleton className="ml-auto h-20 w-2/3 rounded-xl" />
          </div>
        </>
      )}

      {/* Centered spinner + label */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
