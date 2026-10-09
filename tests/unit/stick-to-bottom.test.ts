import { describe, expect, it } from "vitest";
import {
  BOTTOM_SLACK_PX,
  OPENING_STATE,
  distanceFromBottom,
  isAtBottom,
  stepStick,
  type StickEvent,
  type StickState,
} from "@/lib/stick-to-bottom";

// A 600px viewport over 2000px of feed: scrollTop runs 0..1400.
const at = (scrollTop: number, scrollHeight = 2000) => ({
  scrollTop,
  viewportHeight: 600,
  scrollHeight,
});

/** Run events through the machine, collecting whether each asked to stick. */
function run(events: StickEvent[], from: StickState = OPENING_STATE) {
  let state = from;
  const sticks: boolean[] = [];
  for (const event of events) {
    const step = stepStick(state, event);
    state = step.state;
    sticks.push(step.stick);
  }
  return { state, sticks };
}

const settled: StickState = { pinned: true, settling: false, touching: false };
const readingHistory: StickState = { pinned: false, settling: false, touching: false };
const layout = { type: "resize", source: "layout" } as const;
const viewport = { type: "resize", source: "viewport" } as const;

describe("distanceFromBottom / isAtBottom", () => {
  it("measures the gap between the viewport's bottom and the document's end", () => {
    expect(distanceFromBottom(at(1400))).toBe(0);
    expect(distanceFromBottom(at(1000))).toBe(400);
    expect(distanceFromBottom(at(0))).toBe(1400);
  });

  it("never goes negative (overscroll bounce past the end)", () => {
    expect(distanceFromBottom(at(1450))).toBe(0);
  });

  it("counts the slack as the bottom, and a pixel past it as not", () => {
    expect(isAtBottom(at(1400 - BOTTOM_SLACK_PX))).toBe(true);
    expect(isAtBottom(at(1400 - BOTTOM_SLACK_PX - 1))).toBe(false);
  });

  it("treats a fractional, zoomed offset a hair short of the end as the end", () => {
    expect(isAtBottom(at(1399.5))).toBe(true);
  });

  it("treats a page too short to scroll as at the bottom", () => {
    expect(isAtBottom({ scrollTop: 0, viewportHeight: 600, scrollHeight: 400 })).toBe(true);
  });
});

describe("stepStick — opening", () => {
  it("starts pinned and settling, with no finger down", () => {
    expect(OPENING_STATE).toEqual({ pinned: true, settling: true, touching: false });
  });

  it("undoes the router's scroll-to-top that lands after the feed scrolled down", () => {
    const step = stepStick(OPENING_STATE, { type: "scroll", atBottom: false });
    expect(step.stick).toBe(true);
    expect(step.state).toEqual(OPENING_STATE);
  });

  it("does nothing for a scroll that is already at the end", () => {
    expect(stepStick(OPENING_STATE, { type: "scroll", atBottom: true }).stick).toBe(false);
  });

  it("follows late content down while it streams in", () => {
    const { sticks, state } = run([layout, layout, layout]);
    expect(sticks).toEqual([true, true, true]);
    expect(state.pinned).toBe(true);
  });

  it("stops guarding the moment the reader touches the page", () => {
    // Wheel up: the input lands before the scroll it causes.
    const { state, sticks } = run([{ type: "input" }, { type: "scroll", atBottom: false }]);
    expect(sticks).toEqual([false, false]);
    expect(state).toEqual(readingHistory);
  });

  it("then leaves late content alone once they've scrolled up (load older keeps working)", () => {
    const { sticks } = run([
      { type: "input" },
      { type: "scroll", atBottom: false },
      layout, // an older page prepended above
    ]);
    expect(sticks).toEqual([false, false, false]);
  });

  it("closes the opening window when layout goes quiet, still pinned", () => {
    expect(stepStick(OPENING_STATE, { type: "settled" }).state).toEqual(settled);
  });
});

describe("stepStick — after opening", () => {
  it("takes a scroll at face value: off the end unpins, without scrolling back", () => {
    const step = stepStick(settled, { type: "scroll", atBottom: false });
    expect(step.stick).toBe(false);
    expect(step.state).toEqual(readingHistory);
  });

  it("re-pins when the reader scrolls back down to the newest message", () => {
    const step = stepStick(readingHistory, { type: "scroll", atBottom: true });
    expect(step.state).toEqual(settled);
    expect(step.stick).toBe(false);
  });

  it("keeps the newest message above a composer that grows while pinned (drafts appear)", () => {
    expect(stepStick(settled, layout).stick).toBe(true);
  });

  it("leaves the history being read alone when the composer grows", () => {
    expect(stepStick(readingHistory, layout).stick).toBe(false);
  });

  it("ignores input once settled — it no longer changes anything", () => {
    expect(stepStick(settled, { type: "input" })).toEqual({ state: settled, stick: false });
    expect(stepStick(readingHistory, { type: "input" })).toEqual({
      state: readingHistory,
      stick: false,
    });
  });

  it("returns the same state object when nothing changed", () => {
    expect(stepStick(settled, { type: "scroll", atBottom: true }).state).toBe(settled);
    expect(stepStick(readingHistory, layout).state).toBe(readingHistory);
  });
});

describe("stepStick — the viewport changing size", () => {
  it("keeps the newest message in view when the window gets shorter while pinned", () => {
    // The end is now below the fold, but the reader was at it before the
    // resize — the pinned state, not the new geometry, decides.
    expect(isAtBottom({ scrollTop: 1400, viewportHeight: 500, scrollHeight: 2000 })).toBe(false);
    expect(stepStick(settled, viewport).stick).toBe(true);
  });

  it("follows the phone's browser bars sliding in once the finger is up", () => {
    const { sticks } = run(
      [{ type: "touch", down: true }, { type: "touch", down: false }, viewport],
      settled,
    );
    expect(sticks).toEqual([false, false, true]);
  });

  it("doesn't fight a touch: bars reacting to the gesture mid-scroll are left alone", () => {
    const { sticks } = run([{ type: "touch", down: true }, viewport], settled);
    expect(sticks).toEqual([false, false]);
  });

  it("still follows the page's own layout mid-touch while pinned", () => {
    const { sticks } = run([{ type: "touch", down: true }, layout], settled);
    expect(sticks).toEqual([false, true]);
  });

  it("leaves the history being read alone", () => {
    expect(stepStick(readingHistory, viewport).stick).toBe(false);
  });

  it("a finger down ends the opening window, like any input", () => {
    const step = stepStick(OPENING_STATE, { type: "touch", down: true });
    expect(step.state).toEqual({ pinned: true, settling: false, touching: true });
    // Lifting it doesn't reopen the window.
    expect(stepStick(step.state, { type: "touch", down: false }).state).toEqual(settled);
  });
});
