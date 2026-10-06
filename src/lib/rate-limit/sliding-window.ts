import type { RateLimitNumbers } from "../plans";

/**
 * The sliding-window maths behind the per-person rate limits (abuse rule C8).
 * Pure — no I/O, no clock of its own — so the Durable Object that stores the
 * counts (`durable-object.ts`), the Worker that judges them (`index.ts`), and
 * the tests all run the same code.
 *
 * Each bucket is counted over three windows (1, 5 and 60 minutes) with the
 * **approximated sliding window** Cloudflare's own limiter uses: per window we
 * keep the hits in the current fixed slot (`cur`) and in the one before it
 * (`prev`), and estimate the last `W` milliseconds as
 *
 *     estimate = cur + prev × (W − elapsed) / W
 *
 * i.e. the previous slot's hits fade out linearly as the current one fills. Two
 * numbers per window instead of a timestamp per request, at the cost of
 * assuming the previous slot's hits were spread evenly — fine for a limit whose
 * job is to stop scripts, not to meter people to the request.
 *
 * Runtime imports stay relative and Next-free: this file is bundled into the
 * Worker entry (`worker.ts`) as well as the app.
 */

/** The windows every bucket is counted over, and the `RATE_LIMITS` field each reads. */
export const RATE_WINDOWS = [
  { key: "perMinute", label: "1m", ms: 60_000 },
  { key: "per5Minutes", label: "5m", ms: 5 * 60_000 },
  { key: "perHour", label: "1h", ms: 60 * 60_000 },
] as const satisfies readonly { key: keyof RateLimitNumbers; label: string; ms: number }[];

export type RateWindowLabel = (typeof RATE_WINDOWS)[number]["label"];

/** One window's counts: the current slot's start (epoch ms), its hits, the previous slot's hits. */
export type WindowCounts = [start: number, cur: number, prev: number];

/** A bucket's counts, one entry per `RATE_WINDOWS` window, in that order. */
export type BucketCounts = [WindowCounts, WindowCounts, WindowCounts];

/** What the Durable Object hands back after a hit: the counts *including* it, and its clock. */
export type RateSnapshot = { at: number; windows: BucketCounts };

export type RateVerdict =
  | { allowed: true }
  | {
      allowed: false;
      /** Whole seconds until a retry would pass every window (≥ 1). */
      retryAfterSeconds: number;
      /** The window that keeps it refused longest — the one to name. */
      window: RateWindowLabel;
      /** That window's limit. */
      limit: number;
    };

/**
 * Comparisons between a fractional estimate and an integer limit. Without it,
 * `0.1 + 0.2`-style error could refuse a request that is exactly at the limit.
 */
const EPSILON = 1e-9;

const slotStart = (now: number, size: number) => Math.floor(now / size) * size;

/**
 * Move a window's counts to the slot `now` falls in: unchanged within the same
 * slot, shifted one slot along (`cur` becomes `prev`), or emptied when the
 * counts are two or more slots old. A slot *later* than `now` — the clock went
 * backwards after the object moved — is kept as it is rather than reset, so a
 * clock skew can never wipe a person's counts.
 */
export function rollWindow(
  counts: WindowCounts | undefined,
  size: number,
  now: number,
): WindowCounts {
  const start = slotStart(now, size);
  if (!counts) return [start, 0, 0];
  const [stored, cur, prev] = counts;
  if (stored >= start) return [stored, cur, prev];
  if (stored === start - size) return [start, 0, cur];
  return [start, 0, 0];
}

/** Every window of a bucket, rolled to `now`. */
export function rollBucket(counts: BucketCounts | undefined, now: number): BucketCounts {
  return RATE_WINDOWS.map((w, i) => rollWindow(counts?.[i], w.ms, now)) as BucketCounts;
}

/**
 * Record one request at `now`. `weight` is how many requests it counts as — 1
 * for nearly everything; a heavy read (a 5,000-row CSV export) counts as more.
 */
export function recordHit(
  counts: BucketCounts | undefined,
  now: number,
  weight = 1,
): BucketCounts {
  return rollBucket(counts, now).map(([start, cur, prev]) => [start, cur + weight, prev]) as BucketCounts;
}

/**
 * Take back a request recorded at `at` — a refused one, so it doesn't use up
 * the budget it was refused from. The hit is removed from whichever slot holds
 * it now: still the current one, or rolled into `prev`. Older than that, it no
 * longer counts and there's nothing to remove. Never goes below zero.
 */
export function removeHit(counts: BucketCounts, at: number, weight = 1): BucketCounts {
  return RATE_WINDOWS.map((w, i) => {
    const [start, cur, prev] = counts[i]!;
    const hitSlot = slotStart(at, w.ms);
    if (start === hitSlot) return [start, Math.max(0, cur - weight), prev];
    if (start === hitSlot + w.ms) return [start, cur, Math.max(0, prev - weight)];
    return [start, cur, prev];
  }) as BucketCounts;
}

/** The estimated requests in the last `size` ms (counts already rolled to `now`). */
export function estimate([start, cur, prev]: WindowCounts, size: number, now: number): number {
  const elapsed = Math.min(size, Math.max(0, now - start));
  return cur + (prev * (size - elapsed)) / size;
}

/**
 * Milliseconds until a request refused by this window would pass it, assuming
 * no other requests in between and that the refused hit is taken back.
 *
 * With `c` hits in the current slot (excluding the refused request's `w`), `p`
 * in the previous one, `e` ms into the slot and a limit `L`:
 *  - if `c + w ≤ L` the retry fits as soon as `prev` has faded enough:
 *    `c + w + p·(W − e − t)/W ≤ L`  ⇒  `t = W − e − W·(L − c − w)/p`;
 *  - otherwise it has to wait for the slot to roll over, after which `c`
 *    becomes the fading `prev`: `c·(W − t′)/W + w ≤ L` ⇒ `t′ = W·(1 − (L − w)/c)`,
 *    so `t = (W − e) + t′`.
 * The estimate never rises while no requests arrive, so the latest of these
 * across the windows is exactly when every window passes. A request's weight
 * must not exceed the smallest limit of its bucket (`tests/unit/rate-limit-
 * classify.test.ts` guards it), or no wait would ever be enough.
 */
export function waitMs(
  counts: WindowCounts,
  size: number,
  limit: number,
  now: number,
  weight = 1,
): number {
  const [start, cur, prev] = counts;
  const c = cur - weight;
  const elapsed = Math.min(size, Math.max(0, now - start));
  if (c + weight <= limit) {
    if (prev <= 0) return 0;
    return Math.max(0, size - elapsed - (size * (limit - c - weight)) / prev);
  }
  return size - elapsed + size * (1 - (limit - weight) / c);
}

/**
 * Judge a snapshot (counts that include this request, recorded with `weight`)
 * against a plan's limits for the bucket. Allowed only if every window's
 * estimate is within its limit.
 */
export function evaluate(
  snapshot: RateSnapshot,
  limits: RateLimitNumbers,
  weight = 1,
): RateVerdict {
  let worst: { ms: number; window: RateWindowLabel; limit: number } | null = null;
  for (let i = 0; i < RATE_WINDOWS.length; i++) {
    const w = RATE_WINDOWS[i]!;
    const counts = snapshot.windows[i]!;
    const limit = limits[w.key];
    if (estimate(counts, w.ms, snapshot.at) <= limit + EPSILON) continue;
    const ms = waitMs(counts, w.ms, limit, snapshot.at, weight);
    if (!worst || ms > worst.ms) worst = { ms, window: w.label, limit };
  }
  if (!worst) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(worst.ms / 1000 - EPSILON)),
    window: worst.window,
    limit: worst.limit,
  };
}
