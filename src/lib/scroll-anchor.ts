/**
 * Keeping the tracker still while the page changes around the reader — the
 * arithmetic, with no DOM in it. `useFeedScroll` feeds it measurements and does
 * the scrolling it asks for.
 *
 * The idea is the browser's own scroll anchoring, done by hand: remember where
 * one feed row sits in the *document*, and whenever layout changes, scroll by
 * however far that row moved. Content inserted or resized above it (an older
 * page, the balance streaming into the sticky header, a dismissed card, a
 * deleted row) moves the row and is cancelled out; anything below it doesn't
 * move it and is left alone; and the reader's own scrolling never shows up as
 * a "move", because a document position doesn't change when the page scrolls.
 */

/** One link of an `offsetParent` chain: the offset below the parent, and the parent. */
export type OffsetLink<T> = { top: number; parent: T | null };

/**
 * An element's top in document coordinates, summed up its `offsetTop` chain.
 *
 * Layout offsets, not `getBoundingClientRect()`: the feed's bubbles rise into
 * place with a `transform` animation, and a rect taken mid-animation would read
 * the animation as the row moving — and the page would "correct" for it.
 */
export function docTopFrom<T>(el: T, link: (el: T) => OffsetLink<T>): number {
  let top = 0;
  let current: T | null = el;
  while (current) {
    const step = link(current);
    top += step.top;
    current = step.parent;
  }
  return top;
}

/**
 * The index of the first item whose bottom edge is below `line`, or -1 when
 * none is. A binary search: the feed's rows are in document order, so their
 * bottoms only increase, and a scroll handler can afford a handful of reads
 * but not one per row of a long history.
 */
export function firstIndexBelow(count: number, bottomAt: (i: number) => number, line: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bottomAt(mid) > line) hi = mid;
    else lo = mid + 1;
  }
  return lo < count ? lo : -1;
}

/** Below this, a difference is rounding on a zoomed screen, not a move. */
export const SHIFT_EPSILON_PX = 0.5;

/**
 * How far to scroll so a row that moved from `before` to `after` (document px)
 * stays where it was on screen: by exactly as much as it moved. 0 when it
 * didn't really move.
 */
export function anchorShift(before: number, after: number): number {
  const moved = after - before;
  return Math.abs(moved) < SHIFT_EPSILON_PX ? 0 : moved;
}

/**
 * The scroll offset that puts a day's top edge `gap` px below the sticky
 * header — where its date pill sticks, so the pill lands already in place —
 * clamped to what the page can scroll. Near either end the clamp wins: the
 * newest day can't be pulled up past the end of the page.
 */
export function dayScrollTop({
  dayTop,
  headerBottom,
  gap,
  scrollHeight,
  viewportHeight,
}: {
  /** The day's top edge, in document px. */
  dayTop: number;
  /** The sticky header's bottom edge, in viewport px. */
  headerBottom: number;
  gap: number;
  scrollHeight: number;
  viewportHeight: number;
}): number {
  const max = Math.max(0, scrollHeight - viewportHeight);
  return Math.min(max, Math.max(0, dayTop - headerBottom - gap));
}
