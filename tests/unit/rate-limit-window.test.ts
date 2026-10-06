import { describe, expect, it } from "vitest";
import {
  RATE_WINDOWS,
  estimate,
  evaluate,
  recordHit,
  removeHit,
  rollBucket,
  rollWindow,
  waitMs,
  type BucketCounts,
  type RateSnapshot,
} from "@/lib/rate-limit/sliding-window";

const MIN = 60_000;
const HOUR = 60 * MIN;
/** A moment exactly on an hour boundary, so every window's slot starts here. */
const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

/** `n` hits recorded at `at`, on top of `counts`. */
function hits(n: number, at: number, counts?: BucketCounts): BucketCounts {
  let c = counts;
  for (let i = 0; i < n; i++) c = recordHit(c, at);
  return c!;
}

const snap = (windows: BucketCounts, at: number): RateSnapshot => ({ at, windows });

const LIMITS = { perMinute: 20, per5Minutes: 60, perHour: 300 };

describe("rollWindow", () => {
  it("starts an empty window in the slot `now` falls in", () => {
    expect(rollWindow(undefined, MIN, T0 + 30_000)).toEqual([T0, 0, 0]);
  });

  it("keeps the counts within the same slot", () => {
    expect(rollWindow([T0, 5, 2], MIN, T0 + 59_999)).toEqual([T0, 5, 2]);
  });

  it("shifts the current slot into prev one slot later", () => {
    expect(rollWindow([T0, 5, 2], MIN, T0 + MIN + 10)).toEqual([T0 + MIN, 0, 5]);
  });

  it("empties counts two or more slots old", () => {
    expect(rollWindow([T0, 5, 2], MIN, T0 + 2 * MIN)).toEqual([T0 + 2 * MIN, 0, 0]);
  });

  it("keeps a slot from the future as it is (a clock that went backwards never wipes counts)", () => {
    expect(rollWindow([T0 + MIN, 5, 2], MIN, T0 + 10)).toEqual([T0 + MIN, 5, 2]);
  });
});

describe("recordHit / rollBucket", () => {
  it("counts a hit in every window", () => {
    const counts = recordHit(undefined, T0 + 1_000);
    expect(counts).toEqual([
      [T0, 1, 0],
      [T0, 1, 0],
      [T0, 1, 0],
    ]);
  });

  it("rolls each window on its own size", () => {
    const counts = hits(3, T0 + 1_000);
    // 61s later: the minute rolled, the 5-minute and hour windows didn't.
    expect(rollBucket(counts, T0 + 61_000)).toEqual([
      [T0 + MIN, 0, 3],
      [T0, 3, 0],
      [T0, 3, 0],
    ]);
  });
});

describe("removeHit", () => {
  it("takes a hit back from the current slot", () => {
    const counts = hits(3, T0 + 1_000);
    expect(removeHit(counts, T0 + 1_000)[0]).toEqual([T0, 2, 0]);
  });

  it("takes it from prev when its slot has since rolled", () => {
    const counts = rollBucket(hits(3, T0 + 1_000), T0 + MIN + 1);
    expect(removeHit(counts, T0 + 1_000)[0]).toEqual([T0 + MIN, 0, 2]);
  });

  it("does nothing for a hit that no longer counts", () => {
    const counts = rollBucket(hits(3, T0 + 1_000), T0 + 2 * MIN + 1);
    expect(removeHit(counts, T0 + 1_000)[0]).toEqual([T0 + 2 * MIN, 0, 0]);
  });

  it("never goes below zero", () => {
    const counts: BucketCounts = [
      [T0, 0, 0],
      [T0, 0, 0],
      [T0, 0, 0],
    ];
    expect(removeHit(counts, T0)).toEqual(counts);
    const rolled: BucketCounts = [
      [T0 + MIN, 0, 0],
      [T0, 0, 0],
      [T0, 0, 0],
    ];
    expect(removeHit(rolled, T0)[0]).toEqual([T0 + MIN, 0, 0]);
  });
});

describe("estimate", () => {
  it("C8: the previous window's hits fade out linearly", () => {
    // 10 hits last minute, none yet this minute.
    expect(estimate([T0, 0, 10], MIN, T0)).toBe(10);
    expect(estimate([T0, 0, 10], MIN, T0 + 15_000)).toBe(7.5);
    expect(estimate([T0, 0, 10], MIN, T0 + 30_000)).toBe(5);
    expect(estimate([T0, 4, 10], MIN, T0 + 45_000)).toBe(6.5);
    // Past the slot (counts not rolled yet) the previous slot weighs nothing.
    expect(estimate([T0, 4, 10], MIN, T0 + 2 * MIN)).toBe(4);
  });
});

describe("evaluate", () => {
  it("C8: allows exactly the limit in a fresh window, then refuses", () => {
    let counts: BucketCounts | undefined;
    for (let i = 1; i <= 20; i++) {
      counts = recordHit(counts, T0 + i * 100);
      expect(evaluate(snap(counts, T0 + i * 100), LIMITS).allowed).toBe(true);
    }
    counts = recordHit(counts, T0 + 2_100);
    const verdict = evaluate(snap(counts, T0 + 2_100), LIMITS);
    // Wait for the rollover (57.9s), then for 20 fading hits to drop to 19 (3s).
    expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 61, window: "1m", limit: 20 });
  });

  it("C8: Retry-After is the first second a retry would pass — waiting for the slot to roll", () => {
    // 21 hits at T0+30s (the 21st refused): the minute slot is full, so a retry
    // has to wait for the rollover at T0+60s, after which 20 fading hits must
    // drop to ≤ 19: 20·(1 − t′/60) ≤ 19 ⇒ t′ = 3s. 30s + 3s = 33s.
    const counts = hits(21, T0 + 30_000);
    const verdict = evaluate(snap(counts, T0 + 30_000), LIMITS);
    expect(verdict).toMatchObject({ allowed: false, retryAfterSeconds: 33, window: "1m" });

    // …and it really is the first passing second: undo the refused hit, then retry.
    const undone = removeHit(counts, T0 + 30_000);
    const tooEarly = recordHit(undone, T0 + 62_000);
    expect(evaluate(snap(tooEarly, T0 + 62_000), LIMITS).allowed).toBe(false);
    const onTime = recordHit(undone, T0 + 63_000);
    expect(evaluate(snap(onTime, T0 + 63_000), LIMITS).allowed).toBe(true);
  });

  it("C8: Retry-After when the previous slot just has to fade", () => {
    // 20 hits in the last minute's slot, 5 so far in this one, 15s in. The 6th
    // (refused) estimate: 6 + 20·45/60 = 21. A retry fits when
    // 6 + 20·(45 − t)/60 ≤ 20 ⇒ t = 3s.
    const last = hits(20, T0 - 10_000);
    const counts = hits(6, T0 + 15_000, last);
    const verdict = evaluate(snap(counts, T0 + 15_000), LIMITS);
    expect(verdict).toMatchObject({ allowed: false, retryAfterSeconds: 3, window: "1m" });
  });

  it("C8: names the window that keeps the request refused longest", () => {
    // 300 hits spread over the hour slot's first 50 minutes fill the hour; the
    // minute and 5-minute windows are quiet by now.
    let counts: BucketCounts | undefined;
    for (let i = 0; i < 300; i++) counts = recordHit(counts, T0 + i * 10_000);
    const at = T0 + 55 * MIN;
    counts = recordHit(counts, at);
    const verdict = evaluate(snap(counts, at), LIMITS);
    expect(verdict).toMatchObject({ allowed: false, window: "1h", limit: 300 });
    if (!verdict.allowed) {
      // Rollover in 5 minutes, then 300 fading hits must drop to 299: +12s.
      expect(verdict.retryAfterSeconds).toBe(5 * 60 + 12);
    }
  });

  it("never reports less than a second", () => {
    // As above but 17.5s in: the retry fits after just 0.5s — reported as 1s.
    const counts = hits(6, T0 + 17_500, hits(20, T0 - 10_000));
    expect(evaluate(snap(counts, T0 + 17_500), LIMITS)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("reads the limit for each window from its own field", () => {
    expect(RATE_WINDOWS.map((w) => [w.key, w.label, w.ms])).toEqual([
      ["perMinute", "1m", MIN],
      ["per5Minutes", "5m", 5 * MIN],
      ["perHour", "1h", HOUR],
    ]);
  });
});

describe("waitMs", () => {
  it("is zero when nothing fades and the slot has room", () => {
    expect(waitMs([T0, 5, 0], MIN, 20, T0 + 1_000)).toBe(0);
  });

  it("clamps at zero once prev has already faded enough", () => {
    expect(waitMs([T0, 5, 4], MIN, 20, T0 + 1_000)).toBe(0);
  });

  it("waits two slots when a limit of one is already used", () => {
    // limit 1, two hits in this slot (one refused): wait for the rollover, then
    // the remaining hit must fade out entirely.
    expect(waitMs([T0, 2, 0], MIN, 1, T0)).toBe(2 * MIN);
  });
});
