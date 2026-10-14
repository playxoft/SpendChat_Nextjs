"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  OPENING_STATE,
  distanceFromBottom,
  isAtBottom,
  stepStick,
  type ScrollGeometry,
  type StickEvent,
  type StickState,
} from "@/lib/stick-to-bottom";
import { anchorShift, docTopFrom, firstIndexBelow } from "@/lib/scroll-anchor";

/**
 * The opening window closes after layout has been quiet this long (or at the
 * cap, if something keeps resizing). It only has to outlast the scrolls that
 * come with opening a page — the router's, the browser's — which land within a
 * frame or two of the feed mounting; late content after it is still followed,
 * by the pinned rule.
 */
const SETTLE_QUIET_MS = 1000;
const SETTLE_MAX_MS = 5000;

/**
 * What counts as the reader taking over. Each fires *before* the scroll it
 * causes (a wheel turn, a key, a press on the scrollbar — and `touchstart`,
 * tracked on its own below), so the scroll that follows is already theirs.
 * Captured on `window`, so a handler that stops propagation can't hide one.
 */
const INPUT_EVENTS = ["wheel", "keydown", "pointerdown"] as const;
const TOUCH_EVENTS = ["touchstart", "touchend", "touchcancel"] as const;

/** How many rows below the header line are remembered — spares, for when the first is deleted. */
const ANCHOR_SPARES = 3;

/** The feed's rows, in document order; each bubble carries it. */
export const FEED_ROW_SELECTOR = "[data-feed-row]";

function geometry(): ScrollGeometry {
  return {
    scrollTop: window.scrollY,
    viewportHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  };
}

function scrollToEnd() {
  if (distanceFromBottom(geometry()) < 1) return;
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
}

/** An element's top in document px, from layout offsets (see `docTopFrom`). */
export function docTopOf(el: HTMLElement): number {
  return docTopFrom<HTMLElement>(el, (e) => ({
    top: e.offsetTop,
    parent: e.offsetParent instanceof HTMLElement ? e.offsetParent : null,
  }));
}

/**
 * Where the sticky tracker header ends, in viewport px: its sticky `top` (the
 * phone's 56px bar above it, or 0) plus its height. Read from the stylesheet
 * rather than the header's rect, which an overscroll bounce at the top of the
 * page moves for a moment.
 */
export function trackerHeaderBottom(): number {
  const header = document.querySelector<HTMLElement>("[data-tracker-header]");
  if (!header) return 0;
  const top = parseFloat(getComputedStyle(header).top);
  return (Number.isFinite(top) ? top : 0) + header.offsetHeight;
}

export type FeedScroll = {
  /** Compensate whatever moved the remembered row since it was last measured, then re-measure. */
  sync(): void;
  /** Re-measure without compensating — after the feed scrolled itself somewhere new. */
  capture(): void;
  /** Stop holding the newest message: the feed is about to be moved on purpose. */
  release(): void;
  /** Go to the newest message, and hold it there again. */
  pinToEnd(): void;
};

type Anchor = { el: HTMLElement; top: number };

/**
 * How the tracker scrolls: it opens at the newest message and holds it there,
 * and once the reader scrolls away, whatever they are looking at stays exactly
 * where it is while the page changes around it.
 *
 * **Holding the newest message** — see `@/lib/stick-to-bottom` for the rule.
 * Why one `scrollTo` on mount wasn't enough: the App Router scrolls a freshly
 * navigated page to its top in the segment's `componentDidMount` /
 * `componentDidUpdate`, which React runs *after* the feed's own layout effect
 * in the same commit. It does that whenever the page's first element is out of
 * view — exactly what scrolling to the newest message makes it. On a reload
 * the browser could do the same by restoring the previous offset, and a
 * balance streamed into the header after the feed could leave the end a few
 * pixels below the fold. So instead of one scroll it holds a position: it
 * scrolls to the end at mount, again in the next frame (after the router's
 * scroll in that commit), and whenever the layout or the viewport changes size
 * while pinned; while opening it undoes any scroll off the end the reader
 * didn't make; and it turns the browser's scroll restoration off while the
 * tracker is up, so a reload never lands on an old offset at all.
 *
 * **Keeping the view still** (`@/lib/scroll-anchor`). The page scrolls in the
 * window, and things change height above the reader all the time: an older
 * page is prepended as they scroll up, the balance streams into the sticky
 * header, the "load older" spinner goes away at the start of history, a card
 * above the feed is dismissed, a row further up is deleted. The hook remembers
 * where the first row below the header sits in the document and, after any
 * change — on every scroll event, every layout resize, and right after the
 * feed commits new rows — scrolls by exactly as far as that row moved.
 *
 * Why not the browser's own scroll anchoring (`overflow-anchor`)? It isn't the
 * same everywhere: Safari shipped it years after Chrome and Firefox, and each
 * engine picks its own anchor node — here that could be a sticky day pill,
 * which never moves on screen, or the spinner that is about to disappear — so
 * the same prepend could be held in one browser and jump in another. And it
 * can't be combined with doing it by hand: both would correct the same shift
 * and the page would jump by it twice. So the tracker turns it off
 * (`overflow-anchor: none` on the root while it is up) and does it here, the
 * same way in every browser.
 *
 * Why not "measure `scrollHeight` before the load, add the difference after"
 * (what this used to do)? Two things: the measurement was taken when the
 * request *started*, and the reader goes on scrolling while it is in flight —
 * restoring "where they were plus the new height" threw that scrolling away,
 * which is the jump people saw; and `scrollHeight` also grows for things below
 * the reader (a sent message, the composer), which aren't shifts at all. A
 * row's document position has neither problem: scrolling doesn't change it,
 * and only content above it can.
 *
 * Measurements use layout offsets (`offsetTop`), not `getBoundingClientRect()`
 * — the bubbles rise in with a transform animation, which a rect would read as
 * movement. A compensation runs before the frame paints (layout effects and
 * resize observers both do), so a shift is never seen.
 *
 * `detached`: the feed is showing a stretch of the past (after a jump to a
 * date) and newer rows aren't loaded. Its bottom isn't "the newest message",
 * so reaching it doesn't pin.
 */
export function useFeedScroll({ detached }: { detached: boolean }): FeedScroll {
  const detachedRef = useRef(detached);
  useLayoutEffect(() => {
    detachedRef.current = detached;
  }, [detached]);

  const controller = useRef<FeedScroll | null>(null);

  useLayoutEffect(() => {
    let state: StickState = OPENING_STATE;
    let anchors: Anchor[] = [];

    const capture = () => {
      const rows = document.querySelectorAll<HTMLElement>(FEED_ROW_SELECTOR);
      const line = window.scrollY + trackerHeaderBottom();
      const first = firstIndexBelow(
        rows.length,
        (i) => docTopOf(rows[i]) + rows[i].offsetHeight,
        line,
      );
      anchors = [];
      if (first < 0) return;
      for (let i = first; i < Math.min(rows.length, first + ANCHOR_SPARES); i++) {
        anchors.push({ el: rows[i], top: docTopOf(rows[i]) });
      }
    };

    const sync = () => {
      // Pinned, the end of the feed is what's held (`stick`), not a row.
      if (!state.pinned) {
        const anchor = anchors.find((a) => a.el.isConnected);
        if (anchor) {
          const shift = anchorShift(anchor.top, docTopOf(anchor.el));
          if (shift !== 0) window.scrollTo({ top: window.scrollY + shift, behavior: "instant" });
        }
      }
      capture();
    };

    const apply = (event: StickEvent) => {
      const step = stepStick(state, event);
      state = step.state;
      if (step.stick) scrollToEnd();
    };

    // A reload restores the entry's mode as it was when the page went away —
    // `manual` while the tracker is up, so the browser leaves the offset alone.
    // Put back on the way out: pages that don't scroll themselves rely on it
    // for back/forward. Native scroll anchoring goes off for the same span
    // (see above), on both elements an engine may read it from.
    const { history } = window;
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const root = document.documentElement;
    const anchoring = [root.style.overflowAnchor, document.body.style.overflowAnchor];
    root.style.overflowAnchor = "none";
    document.body.style.overflowAnchor = "none";

    const openedAt = performance.now();
    let settleTimer: number | undefined;
    const armSettle = () => {
      if (!state.settling) return;
      window.clearTimeout(settleTimer);
      const left = SETTLE_MAX_MS - (performance.now() - openedAt);
      settleTimer = window.setTimeout(
        () => apply({ type: "settled" }),
        Math.max(0, Math.min(SETTLE_QUIET_MS, left)),
      );
    };

    // Before the first paint of the feed, and again in the next frame — which
    // runs after the router's scroll-to-top in this same commit, and before
    // anything is painted at the top or the "load older" observer looks.
    scrollToEnd();
    capture();
    const frame = requestAnimationFrame(() => {
      apply({ type: "resize", source: "layout" });
      capture();
    });
    armSettle();

    const atBottom = () => !detachedRef.current && isAtBottom(geometry());
    const onScroll = () => {
      // Undo a shift first, judged by where the reader *was* (pinned or not);
      // only then decide from where they are now. The other way round, rows
      // removed above someone just short of the end would pull them onto it
      // and pin them there.
      sync();
      apply({ type: "scroll", atBottom: atBottom() });
    };
    const onInput = () => apply({ type: "input" });
    // Any finger still on the screen after this event keeps it a touch.
    const onTouch = (e: TouchEvent) => apply({ type: "touch", down: e.touches.length > 0 });
    // `body` grows with everything in the page's flow: the feed, the header,
    // the composer (sticky, so it's in the flow too). The selection bar is
    // `fixed` and doesn't count — it sits over the composer's space.
    const resizeObserver = new ResizeObserver(() => {
      apply({ type: "resize", source: "layout" });
      sync();
      armSettle();
    });
    resizeObserver.observe(document.body);
    // …but `body` is at least as tall as the window, so once the feed is
    // taller than that, a shorter window — or a phone's browser bars sliding
    // in over the visual viewport — doesn't resize it, and the end of the
    // feed would slip under the composer. Both report here.
    const onViewport = () => {
      apply({ type: "resize", source: "viewport" });
      sync();
      armSettle();
    };
    const { visualViewport } = window;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onViewport, { passive: true });
    visualViewport?.addEventListener("resize", onViewport, { passive: true });
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { passive: true, capture: true });
    }
    for (const type of TOUCH_EVENTS) {
      window.addEventListener(type, onTouch, { passive: true, capture: true });
    }

    controller.current = {
      sync,
      capture,
      release: () => apply({ type: "release" }),
      pinToEnd: () => {
        apply({ type: "pin" });
        capture();
      },
    };

    return () => {
      controller.current = null;
      history.scrollRestoration = restoration;
      root.style.overflowAnchor = anchoring[0];
      document.body.style.overflowAnchor = anchoring[1];
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onViewport);
      visualViewport?.removeEventListener("resize", onViewport);
      for (const type of INPUT_EVENTS) {
        window.removeEventListener(type, onInput, { capture: true });
      }
      for (const type of TOUCH_EVENTS) {
        window.removeEventListener(type, onTouch, { capture: true });
      }
    };
  }, []);

  return useMemo(
    () => ({
      sync: () => controller.current?.sync(),
      capture: () => controller.current?.capture(),
      release: () => controller.current?.release(),
      pinToEnd: () => controller.current?.pinToEnd(),
    }),
    [],
  );
}
