/**
 * Whether a scroll container can still move by `delta` along one axis — the
 * arithmetic behind `useContainWheel`, kept free of the DOM so it's testable.
 *
 * `position` is `scrollTop`/`scrollLeft`, `viewport` the client size and
 * `content` the scroll size. A positive delta scrolls towards the end.
 *
 * One pixel of slack at the end: `scrollTop` is fractional on a zoomed or
 * high-DPI screen while the sizes are rounded, so a box scrolled to its last
 * pixel can report itself half a pixel short — and a guard that believed it
 * would let the wheel through to a box with nowhere left to go.
 */
export function hasScrollRoom(
  position: number,
  viewport: number,
  content: number,
  delta: number,
): boolean {
  if (delta > 0) return position + viewport < content - 1;
  if (delta < 0) return position > 0;
  return false;
}
