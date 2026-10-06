import type { RateLimiterStub } from "@/lib/rate-limit/binding";
import { RateCounter } from "@/lib/rate-limit/counter";
import type { RateBucket } from "@/lib/plans";

/**
 * An in-memory stand-in for the per-person rate-limit Durable Objects: the real
 * `RateCounter` (the code inside the Durable Object) over a Map per person, on
 * the test's clock (`Date.now()`, so `vi.setSystemTime` moves it). Install it
 * by mocking `@/lib/rate-limit/binding`:
 *
 *   const limiter = vi.hoisted(() => ({ current: null as MemoryRateLimiter | null }));
 *   vi.mock("@/lib/rate-limit/binding", () => ({
 *     getRateLimiterStub: (id: string) => limiter.current?.stubFor(id) ?? null,
 *   }));
 *
 * so the real `runAction` / `handle()` / auth stack runs end to end.
 */
export type MemoryRateLimiter = {
  stubFor(userId: string): RateLimiterStub;
  /** Record `n` requests for a person without going through a request. */
  fill(userId: string, bucket: RateBucket, n: number): void;
  calls: { hit: number; undo: number };
};

export function createMemoryRateLimiter(): MemoryRateLimiter {
  const counters = new Map<string, RateCounter>();
  const calls = { hit: 0, undo: 0 };

  function counterFor(userId: string): RateCounter {
    let counter = counters.get(userId);
    if (!counter) {
      const store = new Map<string, unknown>();
      counter = new RateCounter({
        get: (key) => store.get(key),
        put: (key, value) => void store.set(key, structuredClone(value)),
      });
      counters.set(userId, counter);
    }
    return counter;
  }

  return {
    calls,
    stubFor(userId) {
      return {
        async hit(bucket) {
          calls.hit++;
          return counterFor(userId).hit(bucket, Date.now());
        },
        async undo(bucket, at) {
          calls.undo++;
          counterFor(userId).undo(bucket, at);
        },
      };
    },
    fill(userId, bucket, n) {
      for (let i = 0; i < n; i++) counterFor(userId).hit(bucket, Date.now());
    },
  };
}
