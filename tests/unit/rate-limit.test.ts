import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRateLimiterStub: vi.fn(),
  after: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/rate-limit/binding", () => ({ getRateLimiterStub: mocks.getRateLimiterStub }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return {
    ...actual,
    logger: { ...actual.logger, warn: mocks.warn, debug: mocks.debug, info: vi.fn(), error: vi.fn() },
  };
});

import { ApiError } from "@/lib/errors";
import {
  RATE_LIMIT_TIMEOUT_MS,
  enforceRateLimit,
  rateLimitedResponse,
  resetRateLimitState,
  startRateLimit,
} from "@/lib/rate-limit";
import { recordHit, type BucketCounts, type RateSnapshot } from "@/lib/rate-limit/sliding-window";
import { runWithRequestCache } from "@/lib/request-cache";

const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

/** The snapshot the Durable Object returns after `n` hits this minute (this one included). */
function snapshotOf(n: number, at = T0 + 30_000): RateSnapshot {
  let counts: BucketCounts | undefined;
  for (let i = 0; i < n; i++) counts = recordHit(counts, at);
  return { at, windows: counts! };
}

/** A Durable Object stub that answers every hit with `snapshot`. */
function stubAnswering(snapshot: RateSnapshot) {
  const stub = {
    hit: vi.fn(async () => snapshot),
    undo: vi.fn(async () => {}),
  };
  mocks.getRateLimiterStub.mockReturnValue(stub);
  return stub;
}

const free = () => "free" as const;

beforeEach(() => {
  resetRateLimitState();
  vi.useFakeTimers({ toFake: ["Date"], now: T0 + 30_000 });
  mocks.after.mockImplementation((fn: () => unknown) => {
    void fn();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("failing open", () => {
  it("C8: fails open and logs once when the binding is missing", async () => {
    mocks.getRateLimiterStub.mockReturnValue(null);
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    // Expected outside a Worker (dev, tests): one debug line, not a warning.
    expect(mocks.debug).toHaveBeenCalledTimes(1);
    expect(mocks.debug.mock.calls[0]![1]).toMatchObject({ event: "rate_limit.unavailable" });
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("C8: warns once when a deployed Worker has no binding", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getRateLimiterStub.mockReturnValue(null);
    await startRateLimit("u1", "read").enforce(free);
    await startRateLimit("u1", "read").enforce(free);
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0]![1]).toMatchObject({ event: "rate_limit.unavailable" });
  });

  it("C8: fails open when the Durable Object errors, warning at most once a minute", async () => {
    mocks.getRateLimiterStub.mockReturnValue({
      hit: vi.fn(async () => {
        throw new Error("object reset");
      }),
      undo: vi.fn(),
    });
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0]![0]).toBe("Rate limit check failed open: object reset");
    expect(mocks.warn.mock.calls[0]![1]).toMatchObject({
      event: "rate_limit.failed_open",
      suppressed: 0,
    });

    vi.setSystemTime(T0 + 30_000 + 61_000);
    await startRateLimit("u1", "create").enforce(free);
    expect(mocks.warn).toHaveBeenCalledTimes(2);
    expect(mocks.warn.mock.calls[1]![1]).toMatchObject({ suppressed: 1 });
  });

  it("C8: fails open when the binding lookup itself throws", async () => {
    mocks.getRateLimiterStub.mockImplementation(() => {
      throw new Error("bad binding");
    });
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    expect(mocks.warn.mock.calls[0]![1]).toMatchObject({ event: "rate_limit.failed_open" });
  });

  it("C8: fails open when the Durable Object doesn't answer in time", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: T0 });
    mocks.getRateLimiterStub.mockReturnValue({
      hit: vi.fn(() => new Promise(() => {})),
      undo: vi.fn(),
    });
    const pending = startRateLimit("u1", "ai").enforce(free);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(mocks.warn.mock.calls[0]![0]).toBe(
      `Rate limit check failed open: no answer within ${RATE_LIMIT_TIMEOUT_MS}ms`,
    );
  });
});

describe("judging", () => {
  it("C8: under Free's numbers the plan is never looked up", async () => {
    stubAnswering(snapshotOf(20));
    const resolvePlan = vi.fn(() => "pro" as const);
    await startRateLimit("u1", "create").enforce(resolvePlan);
    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("C8: over Free's numbers a paid plan's limits apply", async () => {
    stubAnswering(snapshotOf(25)); // Free 20, Plus 30, Pro 40 a minute
    await expect(startRateLimit("u1", "create").enforce(() => "plus")).resolves.toBeUndefined();
    await expect(startRateLimit("u2", "create").enforce(async () => "pro")).resolves.toBeUndefined();
    await expect(startRateLimit("u3", "create").enforce(free)).rejects.toMatchObject({
      status: 429,
    });

    stubAnswering(snapshotOf(35));
    await expect(startRateLimit("u4", "create").enforce(() => "plus")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("C8: a failed or unknown plan lookup counts as Free", async () => {
    stubAnswering(snapshotOf(25));
    await expect(
      startRateLimit("u1", "create").enforce(() => {
        throw new Error("db down");
      }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      startRateLimit("u2", "create").enforce(() => "gold" as never),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("C8: a refusal is a 429 with the wait, the bucket and the window", async () => {
    stubAnswering(snapshotOf(4)); // AI on Free: 3 a minute
    const err = await startRateLimit("u1", "ai")
      .enforce(free)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 429,
      code: "rate_limited",
      details: { bucket: "ai", window: "1m", retryAfterSeconds: 50 },
      message: "That's a lot of AI requests in a short time. Try again in 50 seconds.",
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      "Someone went over the ai limit (3 per minute on Free); blocked for 50s",
      expect.objectContaining({ event: "rate_limit.exceeded", plan: "free", limit: 3 }),
    );
  });

  it("C8: a refused request is undone after the response", async () => {
    const stub = stubAnswering(snapshotOf(21));
    const deferred: (() => unknown)[] = [];
    mocks.after.mockImplementation((fn: () => unknown) => deferred.push(fn));

    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    expect(stub.undo).not.toHaveBeenCalled(); // not inline…
    await deferred[0]!(); // …but once the response is out
    expect(stub.undo).toHaveBeenCalledWith("create", T0 + 30_000);
  });

  it("undoes straight away outside a request scope", async () => {
    const stub = stubAnswering(snapshotOf(21));
    mocks.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    await vi.waitFor(() => expect(stub.undo).toHaveBeenCalledTimes(1));
  });

  it("logs, and swallows, an undo that fails", async () => {
    const stub = stubAnswering(snapshotOf(21));
    stub.undo.mockRejectedValue(new Error("gone"));
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    await vi.waitFor(() =>
      expect(mocks.debug).toHaveBeenCalledWith(
        "Couldn't take back a refused request: gone",
        expect.objectContaining({ event: "rate_limit.undo_failed" }),
      ),
    );
  });
});

describe("blocked people", () => {
  it("C8: a blocked person is refused from the isolate cache without calling the Durable Object", async () => {
    const stub = stubAnswering(snapshotOf(21));
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    expect(stub.hit).toHaveBeenCalledTimes(1);

    // 10s later: refused on the spot, with the remaining wait, no new hit.
    vi.setSystemTime(T0 + 40_000);
    let thrown: unknown;
    try {
      startRateLimit("u1", "create");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ status: 429, details: { retryAfterSeconds: 23, window: "1m" } });
    expect(stub.hit).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledTimes(1);

    // Other buckets and other people are untouched.
    stubAnswering(snapshotOf(1));
    await expect(startRateLimit("u1", "read").enforce(free)).resolves.toBeUndefined();
    await expect(startRateLimit("u2", "create").enforce(free)).resolves.toBeUndefined();
  });

  it("C8: the block lifts once Retry-After has passed", async () => {
    const stub = stubAnswering(snapshotOf(21));
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    vi.setSystemTime(T0 + 30_000 + 33_000);
    stubAnswering(snapshotOf(1));
    await expect(startRateLimit("u1", "create").enforce(free)).resolves.toBeUndefined();
    expect(stub.hit).toHaveBeenCalledTimes(1);
  });

  it("forgets expired blocks when the cache is full", async () => {
    stubAnswering(snapshotOf(21));
    for (let i = 0; i < 1_000; i++) {
      await startRateLimit(`u${i}`, "create").enforce(free).catch(() => {});
    }
    // All of those have expired; the next block sweeps them instead of growing.
    vi.setSystemTime(T0 + 30_000 + 120_000);
    await startRateLimit("late", "create").enforce(free).catch(() => {});
    expect(() => startRateLimit("u0", "create")).not.toThrow();
    expect(() => startRateLimit("late", "create")).toThrow(ApiError);
  });

  it("starts over when the cache is full of live blocks", async () => {
    stubAnswering(snapshotOf(21));
    for (let i = 0; i <= 1_000; i++) {
      await startRateLimit(`u${i}`, "create").enforce(free).catch(() => {});
    }
    expect(() => startRateLimit("u0", "create")).not.toThrow();
    expect(() => startRateLimit("u1000", "create")).toThrow(ApiError);
  });
});

describe("one request, one hit", () => {
  it("C8: counts a request once however often it's checked", async () => {
    const stub = stubAnswering(snapshotOf(21));
    await runWithRequestCache(async () => {
      const first = startRateLimit("u1", "create");
      const second = startRateLimit("u1", "create");
      await expect(first.enforce(free)).rejects.toThrow(ApiError);
      await expect(second.enforce(free)).rejects.toThrow(ApiError);
    });
    expect(stub.hit).toHaveBeenCalledTimes(1);
    expect(stub.undo).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});

describe("enforceRateLimit / rateLimitedResponse", () => {
  it("passes an allowed request", async () => {
    stubAnswering(snapshotOf(1));
    await expect(enforceRateLimit("u1", "read", free)).resolves.toBeUndefined();
    await expect(rateLimitedResponse("u1", "read", free)).resolves.toBeNull();
  });

  it("C8: answers a refusal with 429, Retry-After and the error body", async () => {
    stubAnswering(snapshotOf(21));
    const res = await rateLimitedResponse("u1", "create", free);
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBe("33");
    expect(res!.headers.get("Cache-Control")).toBe("no-store");
    expect(await res!.json()).toEqual({
      error: "That's a lot of changes in a short time. Try again in 33 seconds.",
      code: "rate_limited",
      details: { bucket: "create", window: "1m", retryAfterSeconds: 33 },
    });
    // Already blocked: refused from the cache, through the same shape.
    await expect(enforceRateLimit("u1", "create", free)).rejects.toMatchObject({ status: 429 });
    expect((await rateLimitedResponse("u1", "create", free))!.status).toBe(429);
  });
});
