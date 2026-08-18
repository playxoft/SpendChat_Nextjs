import { describe, it, expect, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { radioGroupKeys } from "@/lib/radio-group-keys";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

/**
 * The handler only ever touches `key`, `preventDefault` and the group's own
 * `[role='radio']` children, so a plain object stands in for the event — these
 * tests are about the index math, which is what a fourth option or a reordered
 * list would break.
 */
function keyEvent(key: string, count = THEMES.length) {
  const focused: number[] = [];
  const radios = Array.from({ length: count }, (_, i) => ({ focus: () => focused.push(i) }));
  const event = {
    key,
    preventDefault: vi.fn(),
    currentTarget: { querySelectorAll: () => radios },
  };
  return { event: event as unknown as KeyboardEvent<HTMLElement>, focused, prevented: event.preventDefault };
}

function press(key: string, current: Theme | undefined) {
  const selected: Theme[] = [];
  const keys = radioGroupKeys(THEMES, current);
  const { event, focused, prevented } = keyEvent(key);
  keys.onKeyDown(event, (v) => selected.push(v));
  return { selected, focused, prevented };
}

describe("radioGroupKeys", () => {
  it("moves and selects the next option, and takes focus with it", () => {
    for (const key of ["ArrowRight", "ArrowDown"]) {
      const { selected, focused, prevented } = press(key, "light");
      expect(selected).toEqual(["dark"]);
      expect(focused).toEqual([1]);
      expect(prevented).toHaveBeenCalled();
    }
  });

  it("moves and selects the previous option", () => {
    for (const key of ["ArrowLeft", "ArrowUp"]) {
      const { selected, focused } = press(key, "system");
      expect(selected).toEqual(["dark"]);
      expect(focused).toEqual([1]);
    }
  });

  it("wraps around at both ends", () => {
    expect(press("ArrowLeft", "light").selected).toEqual(["system"]);
    expect(press("ArrowRight", "system").selected).toEqual(["light"]);
  });

  it("ignores every other key, including the ones the option itself handles", () => {
    for (const key of ["Enter", " ", "Tab", "a", "Escape"]) {
      const { selected, focused, prevented } = press(key, "light");
      expect(selected).toEqual([]);
      expect(focused).toEqual([]);
      expect(prevented).not.toHaveBeenCalled();
    }
  });

  it("starts from the first option when nothing is selected yet", () => {
    // The theme capsule before hydration: `theme` is only known once
    // localStorage has been read, so the group still has to be usable.
    expect(press("ArrowRight", undefined).selected).toEqual(["dark"]);
    expect(press("ArrowLeft", undefined).selected).toEqual(["system"]);
  });

  it("treats a value that isn't in the list as no selection", () => {
    expect(press("ArrowRight", "sepia" as Theme).selected).toEqual(["dark"]);
  });

  it("does nothing when the group has no options", () => {
    const keys = radioGroupKeys([] as readonly Theme[], undefined);
    const { event, focused } = keyEvent("ArrowRight", 0);
    expect(() =>
      keys.onKeyDown(event, () => {
        throw new Error("nothing to select");
      }),
    ).not.toThrow();
    expect(focused).toEqual([]);
  });

  it("gives the tab stop to the selection, and to the first option without one", () => {
    const selected = radioGroupKeys(THEMES, "dark");
    expect(THEMES.map(selected.tabIndexFor)).toEqual([-1, 0, -1]);

    const unselected = radioGroupKeys(THEMES, undefined);
    expect(THEMES.map(unselected.tabIndexFor)).toEqual([0, -1, -1]);
  });
});
