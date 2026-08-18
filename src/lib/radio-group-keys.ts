import type { KeyboardEvent } from "react";

/**
 * Keyboard behaviour for a segmented control that calls itself a
 * `role="radiogroup"` — the sidebar's theme capsule, the composer's Manual/AI
 * switch.
 *
 * A radio group is **one tab stop**, and the arrow keys move *and* select
 * inside it (WAI-ARIA's radio-group pattern — which is what a screen reader
 * announces the moment the role is on the element). Left as plain buttons the
 * group is one tab stop per option and the arrows do nothing, so the
 * interaction contradicts what was announced.
 *
 * Spread over the group and its options:
 *
 *   const keys = radioGroupKeys(VALUES, current, onSelect);
 *   <div role="radiogroup" onKeyDown={keys.onKeyDown}>
 *     <button role="radio" tabIndex={keys.tabIndexFor(value)} …
 *
 * Focus moves by walking the group's own `[role='radio']` children in document
 * order, so an option can be wrapped (in a tooltip trigger, say) without this
 * needing a ref per option — and without the group needing one at all.
 */
export function radioGroupKeys<T>(
  values: readonly T[],
  current: T | undefined,
  onSelect: (value: T) => void,
) {
  // Nothing selected — the theme capsule before hydration has read
  // localStorage — still has to be reachable, so the first option holds the
  // tab stop until there's a real selection.
  const activeIndex = Math.max(
    values.findIndex((v) => v === current),
    0,
  );

  return {
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (!step || values.length === 0) return;
      e.preventDefault();
      const next = (activeIndex + step + values.length) % values.length;
      onSelect(values[next]!);
      // The handler is bound to the group, so `currentTarget` is the group.
      e.currentTarget.querySelectorAll<HTMLElement>("[role='radio']")[next]?.focus();
    },
    tabIndexFor: (value: T) => (values.findIndex((v) => v === value) === activeIndex ? 0 : -1),
  };
}
