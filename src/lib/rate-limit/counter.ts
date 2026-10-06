import { RATE_BUCKETS, type RateBucket } from "../plans";
import { recordHit, removeHit, type BucketCounts, type RateSnapshot } from "./sliding-window";

/**
 * The synchronous key-value storage a counter persists to. A SQLite-backed
 * Durable Object's `ctx.storage.kv` has exactly this shape; tests pass a `Map`.
 */
export type CounterStorage = {
  get(key: string): unknown;
  put(key: string, value: unknown): void;
};

/** Whether a value from the outside (an RPC argument) names a bucket. */
export function isRateBucket(value: unknown): value is RateBucket {
  return typeof value === "string" && (RATE_BUCKETS as readonly string[]).includes(value);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Stored counts, or `undefined` for anything that isn't three `[start, cur, prev]` triples. */
function parseCounts(raw: unknown): BucketCounts | undefined {
  if (!Array.isArray(raw) || raw.length !== 3) return undefined;
  const ok = raw.every((w) => Array.isArray(w) && w.length === 3 && w.every(isFiniteNumber));
  return ok ? (raw as BucketCounts) : undefined;
}

/**
 * One person's request counts — the state inside their rate-limit Durable
 * Object. One storage key per bucket (`create`, `read`, `ai`) holding that
 * bucket's three windows, so a hit is one row written. Reads come from an
 * in-memory copy; storage is the source of truth across restarts.
 *
 * Everything is synchronous, so inside a Durable Object a hit's
 * read-modify-write can't interleave with another request's.
 */
export class RateCounter {
  private readonly cache = new Map<RateBucket, BucketCounts>();

  constructor(private readonly storage: CounterStorage) {}

  private load(bucket: RateBucket): BucketCounts | undefined {
    const cached = this.cache.get(bucket);
    if (cached) return cached;
    return parseCounts(this.storage.get(bucket));
  }

  private save(bucket: RateBucket, counts: BucketCounts): void {
    this.cache.set(bucket, counts);
    this.storage.put(bucket, counts);
  }

  /** Count one request at `now` and return the counts including it. */
  hit(bucket: unknown, now: number): RateSnapshot {
    if (!isRateBucket(bucket)) throw new Error(`Unknown rate-limit bucket: ${String(bucket)}`);
    const counts = recordHit(this.load(bucket), now);
    this.save(bucket, counts);
    return { at: now, windows: counts };
  }

  /** Take back a request counted at `at` (one that was refused). */
  undo(bucket: unknown, at: number): void {
    if (!isRateBucket(bucket)) throw new Error(`Unknown rate-limit bucket: ${String(bucket)}`);
    if (!isFiniteNumber(at)) throw new Error("Undo needs the hit's timestamp");
    const counts = this.load(bucket);
    if (!counts) return;
    this.save(bucket, removeHit(counts, at));
  }
}
