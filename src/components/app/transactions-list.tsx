"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loadMoreTransactions } from "@/actions/transactions";
import { TransactionsTable } from "./transactions-table";
import { cn } from "@/lib/utils";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";

/** The serializable filters the load-more action re-runs the query with. */
export type TxnQueryFilters = {
  from?: string;
  to?: string;
  type?: "income" | "expense";
  categoryId?: string;
  profileId?: string;
  search?: string;
  sort?: "date" | "category" | "title" | "description" | "amount";
  dir?: "asc" | "desc";
};

type SharedProps = {
  currency: string;
  locale: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  today: string;
};

/**
 * Wraps the table with scroll-to-load paging: the server renders the first page,
 * and this appends further pages via a server action as a bottom sentinel nears
 * the viewport. No page numbers — the list grows as you scroll.
 */
export function TransactionsList({
  initialRows,
  total,
  pageSize,
  filters,
  ...shared
}: SharedProps & {
  initialRows: TransactionRow[];
  total: number;
  pageSize: number;
  filters: TxnQueryFilters;
}) {
  const atEnd = (loaded: number) => loaded >= total || loaded < pageSize;

  // Sort lives in the URL (the server does the ordering). `startTransition` flips
  // `sortPending` true the instant a header is clicked, so the dim + spinner
  // overlay shows immediately instead of after the server round-trip.
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [sortPending, startSortTransition] = useTransition();
  const activeSort = sp.get("sort");
  const activeDir: "asc" | "desc" = sp.get("dir") === "asc" ? "asc" : "desc";

  function onSort(id: string) {
    const params = new URLSearchParams(sp.toString());
    if (activeSort !== id) {
      params.set("sort", id);
      params.set("dir", "asc");
    } else if (activeDir === "asc") {
      params.set("dir", "desc");
    } else {
      params.delete("sort");
      params.delete("dir");
    }
    params.delete("page");
    const qs = params.toString();
    startSortTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(() => atEnd(initialRows.length));

  // The server streams a fresh first page on every filter/sort change and after
  // a revalidation (add/edit/delete). Re-sync the accumulated list to match it
  // (adjust-state-during-render — no effect needed).
  const [synced, setSynced] = useState(initialRows);
  if (initialRows !== synced) {
    setSynced(initialRows);
    setRows(initialRows);
    setLoading(false);
    setError(false);
    setDone(atEnd(initialRows.length));
  }

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    setError(false);
    setLoading(true);
    const res = await loadMoreTransactions({ filters, offset: rows.length });
    if (res.ok) {
      setRows((prev) => [...prev, ...res.rows]);
      if (res.rows.length < pageSize) setDone(true);
    } else {
      setError(true);
    }
    setLoading(false);
  }, [filters, rows.length, pageSize]);

  // Re-subscribing when `loading` clears re-checks the sentinel, so a short page
  // keeps loading until the viewport is full (an unchanged intersection wouldn't
  // fire again on its own).
  useEffect(() => {
    const el = sentinelRef.current;
    // Don't page while a sort is in flight; re-attach once it settles
    // (`sortPending` is a dep so the observer re-checks the sentinel then).
    if (!el || done || loading || error || sortPending) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, loading, error, sortPending]);

  // While a sort is in flight, keep the (stale) rows on screen but dim them and
  // block interaction, with a spinner overlay — no jarring empty skeleton.
  return (
    <div className="relative">
      <div
        aria-busy={sortPending}
        className={cn(
          "transition-opacity duration-150",
          sortPending && "pointer-events-none select-none opacity-50",
        )}
      >
        <TransactionsTable
          rows={rows}
          activeSort={activeSort}
          activeDir={activeDir}
          onSort={onSort}
          {...shared}
        />
        {!done && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-6 text-sm text-muted-foreground print:hidden"
          >
            {error ? (
              <button
                type="button"
                onClick={loadMore}
                className="rounded-md px-3 py-1.5 font-medium text-foreground hover:bg-muted"
              >
                Couldn’t load more — retry
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </span>
            )}
          </div>
        )}
      </div>

      {sortPending && (
        // `sticky top-1/2` keeps the spinner centered in the viewport even when
        // the list is scrolled; `pointer-events-none` lets the dim underneath
        // own the "disabled" state.
        <div className="pointer-events-none absolute inset-0 z-10 print:hidden">
          <div className="sticky top-1/2 flex -translate-y-1/2 justify-center">
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-md"
            >
              <Loader2 className="size-4 animate-spin" />
              Sorting…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
