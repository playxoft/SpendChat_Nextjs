"use client";

import { useLayoutEffect } from "react";
import {
  OPENING_STATE,
  distanceFromBottom,
  isAtBottom,
  stepStick,
  type ScrollGeometry,
  type StickEvent,
  type StickState,
} from "@/lib/stick-to-bottom";

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
 * causes (a wheel turn, a finger down, a key, a press on the scrollbar), so the
 * scroll that follows is already theirs. Captured on `window`, so a handler
 * that stops propagation can't hide one.
 */
const INPUT_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

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

/**
 * Open the tracker at the newest message and keep it there — see
 * `@/lib/stick-to-bottom` for the rule. Mount it with the feed: a feed that
 * remounts (a profile or workspace switch) opens at its own newest message.
 *
 * Why one `scrollTo` on mount wasn't enough: the App Router scrolls a freshly
 * navigated page to its top in the segment's `componentDidMount` /
 * `componentDidUpdate`, which React runs *after* the feed's own layout effect
 * in the same commit. It does that whenever the page's first element is out of
 * view — exactly what scrolling to the newest message makes it. The top
 * sentinel then loaded an older page, whose scroll anchoring kept the old top
 * in view: the tracker opened mid-way. (It happened when the feed arrived in
 * the same commit as the navigation, which is a matter of timing — so,
 * "sometimes".) On a reload the browser could do the same by restoring the
 * previous offset, and a balance streamed into the header after the feed could
 * leave the end a few pixels below the fold.
 *
 * So instead of one scroll it holds a position:
 *  - scrolls to the end at mount, again in the next frame (after the router's
 *    scroll in that commit), and whenever layout changes while pinned;
 *  - while opening, undoes any scroll off the end the reader didn't make;
 *  - turns the browser's scroll restoration off while the tracker is up, so a
 *    reload never lands on an old offset at all.
 */
export function useStickToBottom(): void {
  useLayoutEffect(() => {
    let state: StickState = OPENING_STATE;
    const apply = (event: StickEvent) => {
      const step = stepStick(state, event);
      state = step.state;
      if (step.stick) scrollToEnd();
    };

    // A reload restores the entry's mode as it was when the page went away —
    // `manual` while the tracker is up, so the browser leaves the offset alone.
    // Put back on the way out: pages that don't scroll themselves rely on it
    // for back/forward.
    const { history } = window;
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";

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
    const frame = requestAnimationFrame(() => apply({ type: "resize" }));
    armSettle();

    const onScroll = () => apply({ type: "scroll", atBottom: isAtBottom(geometry()) });
    const onInput = () => apply({ type: "input" });
    // `body` grows with everything in the page's flow: the feed, the header,
    // the composer (sticky, so it's in the flow too). The selection bar is
    // `fixed` and doesn't count — it sits over the composer's space.
    const resizeObserver = new ResizeObserver(() => {
      apply({ type: "resize" });
      armSettle();
    });
    resizeObserver.observe(document.body);

    window.addEventListener("scroll", onScroll, { passive: true });
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { passive: true, capture: true });
    }

    return () => {
      history.scrollRestoration = restoration;
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      for (const type of INPUT_EVENTS) {
        window.removeEventListener(type, onInput, { capture: true });
      }
    };
  }, []);
}
