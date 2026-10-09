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

const settled: StickState = { pinned: true, settling: false };
const readingHistory: StickState = { pinned: false, settling: false };

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
  it("starts pinned and settling", () => {
    expect(OPENING_STATE).toEqual({ pinned: true, settling: true });
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
    const { sticks, state } = run([{ type: "resize" }, { type: "resize" }, { type: "resize" }]);
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
      { type: "resize" }, // an older page prepended above
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
    expect(stepStick(settled, { type: "resize" }).stick).toBe(true);
  });

  it("leaves the history being read alone when the composer grows", () => {
    expect(stepStick(readingHistory, { type: "resize" }).stick).toBe(false);
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
    expect(stepStick(readingHistory, { type: "resize" }).state).toBe(readingHistory);
  });
});
