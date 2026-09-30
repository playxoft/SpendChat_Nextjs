import { describe, expect, it } from "vitest";
import {
  CHALLENGE_WEEKS,
  ENVELOPES,
  MAX_TRACKERS,
  challengeProgress,
  currentWeekIndex,
  customChallenge,
  customSteps,
  envelopeChallenge,
  finishDate,
  percentDone,
  pruneTrackers,
  runningTotals,
  sanitizeTrackers,
  shuffledOrder,
  trackerKey,
  triangular,
  weekDate,
  weeklyChallenge,
  type SavedTracker,
} from "@/lib/tools/savings-challenge";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("weeklyChallenge", () => {
  it("saves n × base in week n — 1,378 × base in all", () => {
    const c = weeklyChallenge(100, "up");
    expect(c.steps).toHaveLength(52);
    expect(c.steps[0]).toEqual({ id: 1, amount: 100 });
    expect(c.steps[51]).toEqual({ id: 52, amount: 5200 });
    expect(c.total).toBe(137_800);
    expect(sum(c.steps.map((s) => s.amount))).toBe(c.total);
    expect(triangular(CHALLENGE_WEEKS)).toBe(1378);
  });

  it("runs the reverse challenge biggest week first, same total", () => {
    const c = weeklyChallenge(100, "down");
    expect(c.kind).toBe("down");
    expect(c.steps[0]).toEqual({ id: 1, amount: 5200 });
    expect(c.steps[51]).toEqual({ id: 52, amount: 100 });
    expect(c.total).toBe(weeklyChallenge(100, "up").total);
  });

  it("stays exact for fractional and huge bases (in minor units)", () => {
    expect(weeklyChallenge(50, "up").total).toBe(68_900); // $0.50 base → $689
    const huge = weeklyChallenge(1e11, "up"); // 1 billion in cents
    expect(huge.total).toBe(1378e11);
    expect(Number.isSafeInteger(huge.total)).toBe(true);
    expect(sum(huge.steps.map((s) => s.amount))).toBe(huge.total);
  });

  it("rejects zero, negative and fractional minor units", () => {
    expect(() => weeklyChallenge(0, "up")).toThrow(RangeError);
    expect(() => weeklyChallenge(-5, "up")).toThrow(RangeError);
    expect(() => weeklyChallenge(1.5, "up")).toThrow(RangeError);
  });
});

describe("envelopeChallenge", () => {
  it("holds envelopes 1…100 × base — 5,050 × base in all", () => {
    const c = envelopeChallenge(1);
    expect(c.unit).toBe("envelope");
    expect(c.steps).toHaveLength(ENVELOPES);
    expect(c.total).toBe(5050);
    expect(sum(c.steps.map((s) => s.amount))).toBe(5050);
    expect(new Set(c.steps.map((s) => s.id)).size).toBe(100);
    for (const s of c.steps) expect(s.amount).toBe(s.id);
  });

  it("draws the same shuffled order every time (server and browser match)", () => {
    const a = envelopeChallenge(100).steps.map((s) => s.id);
    const b = envelopeChallenge(100).steps.map((s) => s.id);
    expect(a).toEqual(b);
    // Actually shuffled, not 1…100.
    expect(a).not.toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it("shuffles to a permutation that depends on the seed", () => {
    const one = shuffledOrder(100, 1);
    const two = shuffledOrder(100, 2);
    expect([...one].sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(one).not.toEqual(two);
    expect(shuffledOrder(1, 7)).toEqual([1]);
    expect(shuffledOrder(0, 7)).toEqual([]);
  });
});

describe("customSteps", () => {
  it("rounds to a tidy step and lets the last week take the difference", () => {
    // 1,000.00 over 52 weeks: 19.20 a week, 20.80 in the last.
    expect(customSteps(100_000, 52)).toEqual({ step: 1920, last: 2080 });
    // 100,000.00 over 52 weeks: 1,920 and 2,080.
    expect(customSteps(10_000_000, 52)).toEqual({ step: 192_000, last: 208_000 });
    // 10,000.00 over 52 weeks: 192 and 208.
    expect(customSteps(1_000_000, 52)).toEqual({ step: 19_200, last: 20_800 });
    // 3,000.00 over 52 weeks: 57.70 and 57.30 — not 58 and 42.
    expect(customSteps(300_000, 52)).toEqual({ step: 5770, last: 5730 });
    // No rounding needed.
    expect(customSteps(260_000, 52)).toEqual({ step: 5000, last: 5000 });
  });

  it("always adds up to the goal, with every step positive and the last within a quarter step", () => {
    for (const goal of [1, 7, 52, 99, 1000, 12_345, 100_000, 987_654_321, 1e14]) {
      for (const weeks of [1, 2, 3, 12, 26, 52, 100, 260]) {
        const split = customSteps(goal, weeks);
        if (goal < weeks) {
          expect(split, `${goal}/${weeks}`).toBeNull();
          continue;
        }
        expect(split, `${goal}/${weeks}`).not.toBeNull();
        const { step, last } = split!;
        expect(step * (weeks - 1) + last).toBe(goal);
        expect(step).toBeGreaterThan(0);
        expect(last).toBeGreaterThan(0);
        expect(Number.isInteger(step) && Number.isInteger(last)).toBe(true);
        // Beyond tiny goals (a few minor units a week) the last week stays close.
        if (goal / weeks >= 2 * weeks) expect(Math.abs(last - step)).toBeLessThanOrEqual(goal / weeks / 4 + 1e-9);
      }
    }
  });

  it("gives one week the whole goal", () => {
    expect(customSteps(12_345, 1)).toEqual({ step: 12_345, last: 12_345 });
  });

  it("rounds down for goals of only a few minor units a week", () => {
    // 0.78 over 52 weeks: rounding 1.5¢ up to 2¢ would overshoot — 1¢ a week, 27¢ last.
    expect(customSteps(78, 52)).toEqual({ step: 1, last: 27 });
    expect(customSteps(51, 52)).toBeNull();
  });

  it("rejects bad input", () => {
    expect(() => customSteps(0, 52)).toThrow(RangeError);
    expect(() => customSteps(100, 0)).toThrow(RangeError);
    expect(() => customSteps(100, 2.5)).toThrow(RangeError);
  });
});

describe("customChallenge", () => {
  it("builds weekly steps that sum to the goal", () => {
    const c = customChallenge(100_000, 52)!;
    expect(c.steps).toHaveLength(52);
    expect(c.total).toBe(100_000);
    expect(sum(c.steps.map((s) => s.amount))).toBe(100_000);
    expect(c.steps.at(-1)).toEqual({ id: 52, amount: 2080 });
  });

  it("is null when the goal can't cover a minor unit a week", () => {
    expect(customChallenge(10, 52)).toBeNull();
  });
});

describe("challengeProgress", () => {
  const c = weeklyChallenge(100, "up");

  it("is empty with nothing ticked", () => {
    const p = challengeProgress(c, new Set());
    expect(p).toMatchObject({ saved: 0, remaining: 137_800, done: 0, count: 52, fraction: 0 });
    expect(p.next).toEqual({ id: 1, amount: 100 });
  });

  it("adds up the ticked weeks and points at the first gap", () => {
    const p = challengeProgress(c, new Set([1, 2, 4]));
    expect(p.saved).toBe(700);
    expect(p.remaining).toBe(137_100);
    expect(p.done).toBe(3);
    expect(p.next).toEqual({ id: 3, amount: 300 });
  });

  it("is complete when every week is ticked, ignoring ids that aren't steps", () => {
    const all = new Set([...c.steps.map((s) => s.id), 999]);
    const p = challengeProgress(c, all);
    expect(p).toMatchObject({ saved: c.total, remaining: 0, done: 52, fraction: 1, next: null });
  });

  it("has no 'next' for envelopes — they're drawn in any order", () => {
    const p = challengeProgress(envelopeChallenge(1), new Set([100]));
    expect(p.saved).toBe(100);
    expect(p.next).toBeNull();
  });
});

describe("percentDone", () => {
  it("never shows 0% once something is saved, or 100% before the end", () => {
    expect(percentDone(0)).toBe(0);
    expect(percentDone(1 / 1378)).toBe(1);
    expect(percentDone(0.5)).toBe(50);
    expect(percentDone(0.9996)).toBe(99);
    expect(percentDone(1)).toBe(100);
    expect(percentDone(Number.NaN)).toBe(0);
  });
});

describe("runningTotals", () => {
  it("accumulates by id order, whatever the display order", () => {
    const up = runningTotals(weeklyChallenge(1, "up"));
    expect(up.get(1)).toBe(1);
    expect(up.get(2)).toBe(3);
    expect(up.get(52)).toBe(1378);
    const env = runningTotals(envelopeChallenge(1));
    expect(env.get(100)).toBe(5050);
  });
});

describe("dates", () => {
  it("puts week n seven days after week n − 1, across a leap day", () => {
    expect(weekDate("2028-02-22", 1)).toBe("2028-02-22");
    expect(weekDate("2028-02-22", 2)).toBe("2028-02-29");
    expect(weekDate("2028-02-22", 3)).toBe("2028-03-07");
  });

  it("finishes a 52-week challenge 357 days after it starts", () => {
    expect(finishDate(weeklyChallenge(1, "up"), "2026-01-01")).toBe("2026-12-24");
    expect(finishDate(customChallenge(1000, 10)!, "2026-01-01")).toBe("2026-03-05");
  });

  it("finishes 100 envelopes at one a day on day 100", () => {
    expect(finishDate(envelopeChallenge(1), "2026-01-01")).toBe("2026-04-10");
  });

  it("returns null past the year 9999", () => {
    expect(weekDate("9999-12-01", 52)).toBeNull();
  });

  it("finds the week today falls in", () => {
    expect(currentWeekIndex("2026-10-05", "2026-10-04", 52)).toBeNull();
    expect(currentWeekIndex("2026-10-05", "2026-10-05", 52)).toBe(0);
    expect(currentWeekIndex("2026-10-05", "2026-10-11", 52)).toBe(0);
    expect(currentWeekIndex("2026-10-05", "2026-10-12", 52)).toBe(1);
    expect(currentWeekIndex("2026-01-01", "2026-12-30", 52)).toBe(51);
    expect(currentWeekIndex("2026-01-01", "2026-12-31", 52)).toBeNull();
  });
});

describe("saved trackers", () => {
  it("keys by challenge and amount, not currency or date", () => {
    expect(trackerKey("up", 1)).toBe("up:1");
    expect(trackerKey("envelopes", 0.5)).toBe("envelopes:0.5");
    expect(trackerKey("custom", 1000, 52)).toBe("custom:1000:52");
  });

  it("keeps well-formed trackers and drops junk", () => {
    const out = sanitizeTrackers({
      "up:1": { ticks: [3, 1, 1, 2, -1, 1.5, "4", 5000], start: "2026-10-05", at: 5 },
      "down:1": { ticks: [], start: "2026-02-30", at: "x" },
      "bad:1": { ticks: "1,2" },
      "worse:1": null,
      [`${"x".repeat(81)}`]: { ticks: [1] },
    });
    expect(out).toEqual({
      "up:1": { ticks: [1, 2, 3], start: "2026-10-05", at: 5 },
      "down:1": { ticks: [], start: null, at: 0 },
    });
  });

  it("never throws on garbage", () => {
    for (const raw of [null, undefined, 42, "text", [], [1, 2]]) {
      expect(sanitizeTrackers(raw)).toEqual({});
    }
  });

  it("forgets the least recently used trackers past the limit", () => {
    const many: Record<string, SavedTracker> = {};
    for (let i = 0; i < MAX_TRACKERS + 5; i++) many[`up:${i}`] = { ticks: [1], start: null, at: i };
    const kept = pruneTrackers(many);
    expect(Object.keys(kept)).toHaveLength(MAX_TRACKERS);
    expect(kept["up:0"]).toBeUndefined();
    expect(kept[`up:${MAX_TRACKERS + 4}`]).toBeDefined();
  });
});
