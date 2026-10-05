"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterTransition = { pending: boolean; navigate: (url: string) => void };

const Context = createContext<FilterTransition | null>(null);

/**
 * Owns the navigation a filter change makes on the Transactions page, so the
 * results can say they're loading.
 *
 * A filter is a URL change, and an App Router navigation runs in a transition:
 * React keeps the old page on screen until the new one is ready — on this
 * page, until its queries finish — and nothing on it moved in the meantime, so
 * a pick looked like it had done nothing. Running the push in a transition
 * owned *here* gives a `pending` flag for exactly that wait. It sits above
 * both the filter row and the results (two separate Suspense trees), which is
 * the only place both can reach.
 */
export function FilterTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (url: string) => startTransition(() => router.push(url)),
    [router],
  );
  return <Context.Provider value={{ pending, navigate }}>{children}</Context.Provider>;
}

/** The provider's navigate, or a plain push where there's no provider. */
export function useFilterNavigate(): (url: string) => void {
  const ctx = useContext(Context);
  const router = useRouter();
  return ctx?.navigate ?? router.push;
}

/**
 * The results while a filter change is loading: a sliding bar along the top,
 * the stale rows dimmed and inert, and an "Updating…" pill held in view — the
 * same treatment the table already gives a sort, so both waits look alike.
 */
export function FilterPendingRegion({ children, className }: { children: ReactNode; className?: string }) {
  const pending = useContext(Context)?.pending ?? false;
  return (
    <div className={cn("relative", className)} aria-busy={pending}>
      {pending ? (
        <div
          role="progressbar"
          aria-label="Loading results"
          className="absolute inset-x-0 -top-2 h-0.5 overflow-hidden rounded-full bg-muted print:hidden"
        >
          <div className="h-full w-1/3 animate-progress-slide rounded-full bg-foreground/60" />
        </div>
      ) : null}
      <div
        className={cn(
          "transition-opacity duration-150",
          pending && "pointer-events-none select-none opacity-50",
        )}
      >
        {children}
      </div>
      {pending ? (
        <div className="pointer-events-none absolute inset-0 z-10 print:hidden">
          <div className="sticky top-1/3 flex justify-center pt-16">
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-md"
            >
              <Loader2 className="size-4 animate-spin" />
              Updating…
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
