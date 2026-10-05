"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterTransition = {
  pending: boolean;
  navigate: (url: string) => void;
  /** The query string filters should build on — see `currentSearch` below. */
  currentSearch: () => string;
};

const Context = createContext<FilterTransition | null>(null);

/**
 * Owns the navigation a filter change makes on the Transactions page, so the
 * results can say they're loading.
 *
 * A filter is a URL change, and an App Router navigation runs in a transition:
 * React keeps the old page on screen until the new page's shell is ready (its
 * own queries — the results boundary is keyed by the filters, so it then shows
 * its skeleton while the rows load), and nothing on screen moved meanwhile, so
 * a pick looked like it had done nothing. Running the push in a transition
 * owned *here* gives a `pending` flag for exactly that wait. It sits above
 * both the filter row and the results (two separate Suspense trees), which is
 * the only place both can reach.
 *
 * It also remembers the URL it last asked for. The router only writes the
 * address bar when a navigation commits, so while one is pending
 * `window.location` is as stale as `useSearchParams()` — and a second change
 * built from it (a tag picked, then a search typed before the tag landed; or a
 * debounce firing after Clear) would drop the first or bring the cleared
 * filters back. `currentSearch()` answers with the pending URL until the
 * navigations settle, then with the address bar again.
 */
export function FilterTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const requested = useRef<string | null>(null);

  const navigate = useCallback(
    (url: string) => {
      requested.current = new URL(url, window.location.origin).search;
      startTransition(() => router.push(url));
    },
    [router],
  );
  const currentSearch = useCallback(() => requested.current ?? window.location.search, []);

  // Settled: the address bar has caught up with the last request. Back and
  // Forward move the URL without going through `navigate`, so they reset it too.
  useEffect(() => {
    if (!pending) requested.current = null;
  }, [pending]);
  useEffect(() => {
    const reset = () => {
      requested.current = null;
    };
    window.addEventListener("popstate", reset);
    return () => window.removeEventListener("popstate", reset);
  }, []);

  return <Context.Provider value={{ pending, navigate, currentSearch }}>{children}</Context.Provider>;
}

/** The provider's navigate, or a plain push where there's no provider. */
export function useFilterNavigate(): (url: string) => void {
  const ctx = useContext(Context);
  const router = useRouter();
  return ctx?.navigate ?? router.push;
}

/** The query string to build the next filter URL on: the provider's pending
 *  one while a filter change is loading, else the address bar. */
export function useFilterSearch(): () => string {
  return useContext(Context)?.currentSearch ?? (() => window.location.search);
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
      {/* Always mounted, text swapped: a live region inserted with its text
          already in it is often not announced at all. */}
      <span role="status" className="sr-only">
        {pending ? "Updating results" : ""}
      </span>
      {pending ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 print:hidden">
          <div className="sticky top-1/3 flex justify-center pt-16">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-md">
              <Loader2 className="size-4 animate-spin" />
              Updating…
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
