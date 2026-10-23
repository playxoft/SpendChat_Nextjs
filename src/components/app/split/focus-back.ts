import type * as React from "react";

/**
 * `onCloseAutoFocus` for a sheet or dialog opened by state rather than by a
 * Radix trigger — Radix would focus the trigger it doesn't have, and focus
 * falls to the page. This focuses the control that opened it instead, if it's
 * still on the page. With nothing to return to, Radix's own handling stands,
 * which leaves focus where it is — so a dialog opened in its place keeps it.
 */
export function focusBack(event: Event, to: React.RefObject<HTMLElement | null> | undefined): void {
  const el = to?.current;
  if (!el?.isConnected) return;
  event.preventDefault();
  el.focus();
}
