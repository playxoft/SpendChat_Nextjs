"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadFeedAround, loadNewerFeed, loadOlderFeed } from "@/actions/transactions";
import { loadRestoredTransactions } from "@/actions/trash";
import { mergeRestoredIntoFeed } from "@/lib/merge-restored";
import { profileInView } from "@/lib/summary";
import {
  feedDaysOf,
  jumpDate,
  jumpNotice,
  pickLoadedFeedDay,
  type FeedJumpTarget,
  type FeedLanding,
} from "@/lib/feed-days";
import { dayScrollTop } from "@/lib/scroll-anchor";
import { distanceFromBottom } from "@/lib/stick-to-bottom";
import { ChatFeed } from "./chat-feed";
import { MonthScrollSpy } from "./month-scroll-spy";
import { BulkActionBar } from "./bulk-action-bar";
import { usePermissions } from "./permissions";
import { usePendingMessages } from "./pending-messages";
import { useFeedJump } from "./feed-jump";
import { useRowSelection } from "@/hooks/use-row-selection";
import { docTopOf, trackerHeaderBottom, useFeedScroll } from "@/hooks/use-feed-scroll";
import { useTrackerChromeVars } from "@/hooks/use-tracker-chrome";
import { setBulkSelecting } from "@/hooks/use-bulk-selecting";
import type { Category, Profile } from "@/db/schema";
import type { TransactionRow } from "@/lib/queries";
import type { TxnTagDTO } from "@/lib/tags";

/** The gap between the header and a day's top edge after a jump — where its pill sticks (`DayDivider`). */
const DAY_PILL_GAP_PX = 8;

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

const cursorOf = (r: TransactionRow) => ({ occurredOn: r.occurredOn, createdAt: r.createdAt, id: r.id });

/** The rows of `incoming` not already in `have`, by id. */
function unseen(have: TransactionRow[], incoming: TransactionRow[]): TransactionRow[] {
  const seen = new Set(have.map((r) => r.id));
  return incoming.filter((r) => !seen.has(r.id));
}

/** Far enough from the newest message that a way back is worth offering. */
function useScrolledAway(): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const distance = distanceFromBottom({
        scrollTop: window.scrollY,
        viewportHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      });
      setAway(distance > window.innerHeight * 1.5);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return away;
}

/** What the next commit of new rows should do with the scroll position. */
type ScrollIntent = { kind: "day"; day: string } | { kind: "end" };

/**
 * The tracker feed with scroll-to-load history. The server renders the latest
 * page; this accumulates it and, as a top sentinel nears the viewport, loads the
 * next older page via a server action and prepends it — the row being read
 * stays exactly where it is on screen (`useFeedScroll`) — with a small spinner
 * pinned at the top.
 *
 * A jump to a date (the header's picker, through `FeedJumpProvider`) shows the
 * feed at that day: straight there when the day is already loaded, else from a
 * window read around it (`loadFeedAround`). That window may not reach the
 * present — the feed is then **detached**: a bottom sentinel pages newer rows
 * in as you scroll down until it does, revalidations of the latest page wait
 * (they'd leave a gap), and a "jump to latest" button brings the newest
 * messages back. Sending a message from a detached feed goes back first, so
 * the new bubble lands where it belongs.
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
  // Older: `done` once the start of history is loaded.
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!hasMoreInitially);
  const [error, setError] = useState(false);
  // Newer: false only while detached — showing the past, the present unloaded.
  const [newerDone, setNewerDone] = useState(true);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [newerError, setNewerError] = useState(false);
  const detached = !newerDone;

  // Merge a revalidated latest page in without dropping older pages or moving
  // the scroll (adjust-state-during-render — no effect needed). Detached, the
  // page is kept for "jump to latest" but not merged: it doesn't meet the
  // stretch on screen, and gluing it on would hide everything in between.
  if (initialRows !== syncedInitial) {
    setSyncedInitial(initialRows);
    if (newerDone) setRows((prev) => mergeLatest(prev, initialRows));
  }

  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the rows are replaced wholesale (a jump landing, back to
  // latest), so a page still in flight from before can't land in the new
  // stretch. And one per jump asked for, so only the last one asked lands.
  const generation = useRef(0);
  const jumpSeq = useRef(0);
  const scrollIntent = useRef<ScrollIntent | null>(null);

  // Open at the newest message and stay there while the page settles and the
  // composer changes height — until the reader scrolls away; after that, keep
  // whatever they're reading still while the page changes around it. A mount
  // is an opening: the feed remounts on a profile or workspace switch.
  const feedScroll = useFeedScroll({ detached });
  useTrackerChromeVars();

  const loadOlder = useCallback(async () => {
    const oldest = rows[0];
    if (!oldest) {
      setDone(true);
      return;
    }
    const gen = generation.current;
    setError(false);
    setLoading(true);
    const res = await loadOlderFeed({ profileIds: profileIds ?? undefined, before: cursorOf(oldest) });
    if (gen !== generation.current) return;
    if (res.ok) {
      if (res.rows.length < pageSize) setDone(true);
      if (res.rows.length > 0) {
        setRows((prev) => {
          const add = unseen(prev, res.rows);
          return add.length > 0 ? [...add, ...prev] : prev;
        });
      }
    } else {
      setError(true);
    }
    setLoading(false);
  }, [rows, profileIds, pageSize]);

  const loadNewer = useCallback(async () => {
    const newest = rows[rows.length - 1];
    if (!newest) {
      setNewerDone(true);
      return;
    }
    const gen = generation.current;
    setNewerError(false);
    setLoadingNewer(true);
    const res = await loadNewerFeed({ profileIds: profileIds ?? undefined, after: cursorOf(newest) });
    if (gen !== generation.current) return;
    if (res.ok) {
      // Reaching the newest row makes the feed live again; from here the
      // latest page's revalidations merge in as usual.
      if (!res.hasMore) setNewerDone(true);
      if (res.rows.length > 0) {
        setRows((prev) => {
          const add = unseen(prev, res.rows);
          return add.length > 0 ? [...prev, ...add] : prev;
        });
      }
    } else {
      setNewerError(true);
    }
    setLoadingNewer(false);
  }, [rows, profileIds]);

  /** Put a loaded day's top edge just under the header, and the reader's focus on its date. */
  const scrollToDay = useCallback(
    (day: string) => {
      const el = document.querySelector<HTMLElement>(`[data-day="${day}"]`);
      if (!el) return;
      // Let go of the end first, in the same task as the scroll, so nothing in
      // between — a scroll event, a resize — can pin it again and pull the
      // page back down.
      feedScroll.release();
      const top = dayScrollTop({
        dayTop: docTopOf(el),
        headerBottom: trackerHeaderBottom(),
        gap: DAY_PILL_GAP_PX,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      });
      window.scrollTo({ top, behavior: "instant" });
      feedScroll.capture();
      el.querySelector<HTMLElement>("[data-day-pill]")?.focus({ preventScroll: true });
    },
    [feedScroll],
  );

  // After the rows change: a jump or a return to the latest goes where it was
  // asked to; anything else — an older page prepended, a row edited or removed
  // further up — keeps the row being read where it is. Before paint, so the
  // in-between position is never seen.
  useLayoutEffect(() => {
    const intent = scrollIntent.current;
    scrollIntent.current = null;
    if (intent?.kind === "day") scrollToDay(intent.day);
    else if (intent?.kind === "end") feedScroll.pinToEnd();
    else feedScroll.sync();
  }, [rows, scrollToDay, feedScroll]);

  // Load older when the top sentinel nears the top of the viewport.
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el || done || loading || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadOlder();
      },
      { rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadOlder, done, loading, error]);

  // Detached: load newer when the bottom sentinel nears the bottom of the viewport.
  useEffect(() => {
    const el = bottomSentinelRef.current;
    if (!el || newerDone || loadingNewer || newerError) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadNewer();
      },
      { rootMargin: "0px 0px 300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadNewer, newerDone, loadingNewer, newerError]);

  // Multi-select, for editors (the server re-checks every row).
  const { canWrite } = usePermissions();
  const selection = useRowSelection(rows);
  const selecting = canWrite && selection.count > 0;
  const clearSelection = selection.clear;

  /** Back to the newest messages: the latest page as last revalidated, held at the end. */
  const toLatest = useCallback(() => {
    jumpSeq.current += 1;
    if (newerDone) {
      feedScroll.pinToEnd();
      return;
    }
    generation.current += 1;
    scrollIntent.current = { kind: "end" };
    setRows([...syncedInitial]);
    setDone(syncedInitial.length < pageSize);
    setError(false);
    setLoading(false);
    setNewerDone(true);
    setNewerError(false);
    setLoadingNewer(false);
  }, [newerDone, syncedInitial, pageSize, feedScroll]);

  const jumpTo = useCallback(
    async (target: FeedJumpTarget) => {
      const date = jumpDate(target);
      const say = (landing: FeedLanding) => {
        const notice = jumpNotice(target, landing, locale);
        if (notice) toast(notice);
      };
      const seq = ++jumpSeq.current;
      // Already on screen: no read, just go there.
      const local = pickLoadedFeedDay(feedDaysOf(rows), date, {
        olderComplete: done,
        newerComplete: newerDone,
      });
      if (local) {
        scrollToDay(local.day);
        say(local);
        return;
      }
      const res = await loadFeedAround({ profileIds: profileIds ?? undefined, date });
      // Overtaken by another jump, a return to the latest, or a send.
      if (seq !== jumpSeq.current) return;
      if (!res.ok) {
        toast.error("Couldn’t open that date. Try again.");
        return;
      }
      if (!res.landed) {
        toast("No transactions to show yet.");
        return;
      }
      // Anything that started loading while this was on its way belongs to the
      // stretch being replaced.
      generation.current += 1;
      clearSelection();
      scrollIntent.current = { kind: "day", day: res.landed.day };
      setRows(res.rows);
      setDone(!res.hasOlder);
      setError(false);
      setLoading(false);
      setNewerDone(!res.hasNewer);
      setNewerError(false);
      setLoadingNewer(false);
      say(res.landed);
    },
    [rows, done, newerDone, profileIds, locale, scrollToDay, clearSelection],
  );

  const { register } = useFeedJump();
  useEffect(() => {
    register(jumpTo);
    return () => register(null);
  }, [register, jumpTo]);

  // A message sent while the feed shows the past goes back to the present
  // first, so its bubble appears under the newest messages, not under old
  // ones — in the same render as the bubble, so the old stretch is never
  // painted with it. A jump still on its way is dropped: the send is newer.
  const { onSend } = usePendingMessages();
  const handleSend = useEffectEvent(() => {
    if (detached) toLatest();
    else jumpSeq.current += 1;
  });
  useEffect(() => onSend(() => handleSend()), [onSend]);

  // The bar takes the composer's place while a selection is up — you aren't
  // writing while you're picking. The composer lives in another tree, so it
  // reads this through a shared store (and stands its shortcuts down too). It
  // goes invisible rather than away: its box keeps the page's height, so
  // nothing in the feed moves when a selection starts or ends.
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
      setRows((prev) => mergeRestoredIntoFeed(prev, res.rows, done, newerDone));
    },
    [profileIds, done, newerDone],
  );

  const away = useScrolledAway();
  const offerLatest = (detached || away) && !selecting;

  // Changes whenever the rendered rows do (a prepended older page, a revalidated
  // latest page), which is exactly when the set of month sections can change and
  // the spy has to re-read them.
  const feedSignature = `${rows.length}:${rows[0]?.id ?? ""}:${rows[rows.length - 1]?.id ?? ""}`;

  return (
    <div>
      <MonthScrollSpy signature={feedSignature} />
      {!done && (
        <div
          ref={topSentinelRef}
          className="flex items-center justify-center py-3 text-sm text-muted-foreground"
        >
          {error ? (
            <button
              type="button"
              onClick={() => void loadOlder()}
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
      {detached && (
        <div
          ref={bottomSentinelRef}
          className="flex items-center justify-center py-3 text-sm text-muted-foreground"
        >
          {newerError ? (
            <button
              type="button"
              onClick={() => void loadNewer()}
              className="rounded-md px-3 py-1 font-medium text-foreground hover:bg-muted"
            >
              Couldn’t load newer — retry
            </button>
          ) : (
            <Loader2 className="size-4 animate-spin" aria-label="Loading newer transactions" />
          )}
        </div>
      )}
      {/* "Jump to latest", floating above the composer at the column's right
          edge while the newest messages are out of reach. A zero-height sticky
          strip, so it takes no room in the feed; `--tracker-dock-height` is the
          composer's (or the viewer bar's) footprint, measured by
          `useTrackerChromeVars`. */}
      <div className="pointer-events-none sticky bottom-[calc(var(--tracker-dock-height,8rem)_+_0.75rem)] z-20 h-0">
        {offerLatest ? (
          <button
            type="button"
            onClick={toLatest}
            aria-label="Jump to latest"
            title="Jump to latest"
            className="pointer-events-auto absolute right-0 bottom-0 flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowDown className="size-4" />
          </button>
        ) : null}
      </div>
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
    </div>
  );
}
