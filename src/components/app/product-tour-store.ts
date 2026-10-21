/**
 * "Take the tour" from the account menu, which is on every page while the tour
 * lives on the tracker. A module-level flag rather than a window event: when
 * the menu is used on another page, the tracker isn't mounted yet to hear an
 * event, so the request has to wait for it — the menu raises the flag and
 * navigates, and the tour takes the flag when it mounts.
 *
 * Kept apart from the tour component so the menu, which every page loads,
 * doesn't pull the tour in with it.
 */
let requested = false;
const listeners = new Set<() => void>();

/** Ask the tracker to replay the tour, now if it's mounted or as soon as it is. */
export function requestProductTour(): void {
  requested = true;
  listeners.forEach((listener) => listener());
}

/** Whether a replay is waiting, without taking it. */
export function productTourRequested(): boolean {
  return requested;
}

/** Take a waiting replay: true once per request. */
export function takeProductTourRequest(): boolean {
  const was = requested;
  requested = false;
  return was;
}

/** Hear about requests made from now on (a waiting one is read with `productTourRequested`). */
export function onProductTourRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
