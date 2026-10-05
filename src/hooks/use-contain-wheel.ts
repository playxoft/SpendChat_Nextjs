"use client";

import { useEffect, type RefObject } from "react";
import { hasScrollRoom } from "@/lib/scroll-room";

/** Can `el` itself still scroll by `delta` along the given axis? */
function canScroll(el: Element, vertical: boolean, delta: number): boolean {
  const style = getComputedStyle(el);
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  return vertical
    ? hasScrollRoom(el.scrollTop, el.clientHeight, el.scrollHeight, delta)
    : hasScrollRoom(el.scrollLeft, el.clientWidth, el.scrollWidth, delta);
}

/**
 * Keep the mouse wheel inside `ref` while the pointer is over it: a wheel that
 * something under the pointer can still use scrolls that thing, and any other
 * wheel is dropped instead of scrolling the page behind.
 *
 * Built for the tracker's composer, which is `sticky` inside the feed's scroll
 * container. A wheel over its buttons, its labels or an empty note has nothing
 * of its own to scroll, so the browser hands it up the chain to the feed — and
 * the conversation slid away under a pointer that was resting on the input.
 *
 * Two halves, because neither covers the other's case:
 *  - This listener, for the parts that can't scroll at all. It walks from the
 *    target up to `ref`, and lets the event through only if some box on the
 *    way can still move along the wheel's main axis (the note textarea, the
 *    review list, the category strip sideways).
 *  - `overscroll-behavior: contain` on those inner scrollers (the caller's
 *    job, a CSS class), for the gesture that starts with room and runs out of
 *    it: once the event is let through, only that stops the remainder chaining
 *    to the page.
 *
 * The main axis only, judged per event: trackpad swipes carry a little of the
 * other axis, and a vertical swipe over the category strip must not count as
 * a horizontal scroll the strip could take. Pinch-zoom (ctrl+wheel) is left
 * alone — that one belongs to the browser, not to the page.
 *
 * A native, non-passive listener: React attaches `onWheel` passively, and a
 * passive listener can't cancel the scroll.
 */
export function useContainWheel(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey) return;
      const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      const delta = vertical ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      for (let el = e.target instanceof Element ? e.target : null; el; el = el.parentElement) {
        if (canScroll(el, vertical, delta)) return;
        if (el === root) break;
      }
      e.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [ref]);
}
