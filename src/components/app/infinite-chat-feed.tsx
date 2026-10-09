"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadOlderFeed } from "@/actions/transactions";
import { loadRestoredTransactions } from "@/actions/trash";
import { mergeRestoredIntoFeed } from "@/lib/merge-restored";
import { profileInView } from "@/lib/summary";
import { ChatFeed } from "./chat-feed";
import { MonthScrollSpy } from "./month-scroll-spy";
import { BulkActionBar } from "./bulk-action-bar";
import { usePermissions } from "./permissions";
import { useRowSelection } from "@/hooks/use-row-selection";
import { setBulkSelecting } from "@/hooks/use-bulk-selecting";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";
import type { TxnTagDTO } from "@/lib/tags";

/** True when `a` sorts strictly older than `cutoff` in the feed's
 * (occurredOn, createdAt, id) order. */
function isOlder(a: TransactionRow, cutoff: TransactionRow): boolean {
  if (a.occurredOn !== cutoff.occurredOn) return a.occurredOn < cutoff.occurredOn;
  const at = new Date(a.createdAt).getTime();
  const ct = new Date(cutoff.createdAt).getTime();
  if (at !== ct) return at < ct;
  return a.id < cutoff.id;
}

/**
 * Fold a freshly revalidated latest page (after an add / edit / delete) into the
 * accumulated history: keep the older pages already scrolled to, and replace the
 * recent tail with the server's new latest page. Both are oldest-first, and the
 * two segments meet with no gap or overlap because the latest page always starts
 * exactly where the kept older rows end.
 */
function mergeLatest(accumulated: TransactionRow[], latest: TransactionRow[]): TransactionRow[] {
  if (latest.length === 0) return accumulated;
  const cutoff = latest[0]; // oldest row in the latest page
  const older = accumulated.filter((r) => isOlder(r, cutoff));
  return [...older, ...latest];
}

/**
 * The tracker feed with scroll-to-load history. The server renders the latest
 * page; this accumulates it and, as a top sentinel nears the viewport, loads the
 * next older page via a server action and prepends it — keeping the viewport
 * anchored so the content doesn't jump — with a small spinner pinned at the top.
 */
export function InfiniteChatFeed({
  initialRows,
  profileIds,
  pageSize,
  hasMoreInitially,
  currency,
  locale,
  timeZone,
  today,
  categories,
  profiles = [],
  tags,
  showAuthor = false,
}: {
  initialRows: TransactionRow[];
  /** Profiles in view (one, or the sidebar's selection); null = "All profiles". */
  profileIds: string[] | null;
  pageSize: number;
  hasMoreInitially: boolean;
  currency: string;
  locale: string;
  timeZone: string;
  today: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles?: Pick<Profile, "id" | "name" | "icon">[];
  /** The workspace's tags, for the edit dialog's picker. */
  tags: TxnTagDTO[];
  /** Shared workspaces only: label each bubble with its author. */
  showAuthor?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [syncedInitial, setSyncedInitial] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!hasMoreInitially);
  const [error, setError] = useState(false);

  // Merge a revalidated latest page in without dropping older pages or moving
  // the scroll (adjust-state-during-render — no effect needed).
  if (initialRows !== syncedInitial) {
    setSyncedInitial(initialRows);
    setRows((prev) => mergeLatest(prev, initialRows));
  }

  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Scroll geometry captured just before a prepend, so the viewport can be
  // restored to the same content afterwards.
  const anchorRef = useRef<{ height: number; top: number } | null>(null);

  // On first mount, pin to the newest message at the bottom (chat convention).
  const didInitialScroll = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  }, []);

  const loadOlder = useCallback(async () => {
    const oldest = rows[0];
    if (!oldest) {
      setDone(true);
      return;
    }
    setError(false);
    setLoading(true);
    anchorRef.current = {
      height: document.documentElement.scrollHeight,
      top: window.scrollY,
    };
    const res = await loadOlderFeed({
      profileIds: profileIds ?? undefined,
      before: { occurredOn: oldest.occurredOn, createdAt: oldest.createdAt, id: oldest.id },
    });
    if (res.ok) {
      const older = res.rows;
      if (older.length < pageSize) setDone(true);
      if (older.length > 0) {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const fresh = older.filter((r) => !seen.has(r.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      } else {
        anchorRef.current = null;
      }
    } else {
      setError(true);
      anchorRef.current = null;
    }
    setLoading(false);
  }, [rows, profileIds, pageSize]);

  // After older rows are prepended, keep the viewport anchored to the same
  // content: it grew above the fold, so shift scroll down by the height delta.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const delta = document.documentElement.scrollHeight - anchor.height;
    if (delta > 0) window.scrollTo({ top: anchor.top + delta });
  }, [rows]);

  // Load older when the top sentinel nears the top of the viewport.
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el || done || loading || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlder();
      },
      { rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadOlder, done, loading, error]);

  // Multi-select, for editors (the server re-checks every row).
  const { canWrite } = usePermissions();
  const selection = useRowSelection(rows);
  const selecting = canWrite && selection.count > 0;

  // The bar takes the composer's place while a selection is up — you aren't
  // writing while you're picking. The composer lives in another tree, so it
  // reads this through a shared store (and stands its shortcuts down too).
  useEffect(() => {
    setBulkSelecting(selecting);
    return () => setBulkSelecting(false);
  }, [selecting]);

  // Bulk results land in the accumulated rows directly: the revalidation that
  // follows only refreshes the latest page, and a row edited further up the
  // history would otherwise keep showing its old category or tags. A row moved
  // out of the profiles this feed is showing leaves it.
  const onBulkUpdated = useCallback(
    (changed: TransactionRow[]) => {
      const byId = new Map(changed.map((r) => [r.id, r]));
      const inView = profileInView(profileIds);
      setRows((prev) =>
        prev.map((r) => byId.get(r.id) ?? r).filter((r) => inView(r.profileId)),
      );
    },
    [profileIds],
  );
  const onBulkDeleted = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setRows((prev) => prev.filter((r) => !gone.has(r.id)));
  }, []);
  // Undo of a bulk delete: the revalidation only refreshes the latest page, so
  // rows restored further back are read again (as this feed shows them) and
  // put back where they belong — within the history already loaded.
  const onBulkRestored = useCallback(
    async (ids: string[]) => {
      const res = await loadRestoredTransactions({
        ids,
        filters: { profileIds: profileIds ?? undefined },
      });
      if (!res.ok) return;
      setRows((prev) => mergeRestoredIntoFeed(prev, res.rows, done));
    },
    [profileIds, done],
  );

  // Changes whenever the rendered rows do (a prepended older page, a revalidated
  // latest page), which is exactly when the set of month sections can change and
  // the spy has to re-read them.
  const feedSignature = `${rows.length}:${rows[0]?.id ?? ""}:${rows[rows.length - 1]?.id ?? ""}`;

  return (
    <>
      <MonthScrollSpy signature={feedSignature} />
      {!done && (
        <div
          ref={topSentinelRef}
          className="flex items-center justify-center py-3 text-sm text-muted-foreground"
        >
          {error ? (
            <button
              type="button"
              onClick={loadOlder}
              className="rounded-md px-3 py-1 font-medium text-foreground hover:bg-muted"
            >
              Couldn’t load older — retry
            </button>
          ) : (
            <Loader2 className="size-4 animate-spin" aria-label="Loading older transactions" />
          )}
        </div>
      )}
      <ChatFeed
        selection={canWrite ? selection : null}
        rows={rows}
        currency={currency}
        locale={locale}
        timeZone={timeZone}
        today={today}
        categories={categories}
        profiles={profiles}
        tags={tags}
        showAuthor={showAuthor}
      />
      {/* Clearance for the last bubbles under the fixed bar (the composer that
          normally holds this space is hidden while selecting). */}
      {selecting ? <div aria-hidden className="h-20" /> : null}
      {canWrite ? (
        <BulkActionBar
          selected={selection.selectedRows}
          categories={categories}
          profiles={profiles}
          tags={tags}
          totalLoaded={rows.length}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onDeleted={onBulkDeleted}
          onUpdated={onBulkUpdated}
          onRestored={(ids) => void onBulkRestored(ids)}
        />
      ) : null}
    </>
  );
}
