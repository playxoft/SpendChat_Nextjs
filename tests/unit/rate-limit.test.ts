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
  AI_RATE_LIMIT_TIMEOUT_MS,
  AI_UNAVAILABLE_RETRY_SECONDS,
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

/** A Durable Object stub whose every hit fails. */
function stubFailing(hit: () => Promise<never>) {
  const stub = { hit: vi.fn(hit), undo: vi.fn() };
  mocks.getRateLimiterStub.mockReturnValue(stub);
  return stub;
}

const free = () => "free" as const;
const plus = () => "plus" as const;
const pro = () => "pro" as const;

/** The error an `enforce` (or a `startRateLimit` that refuses early) ends with. */
async function refusalOf(run: () => Promise<void>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  return null;
}

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

describe("failing open — creates and reads", () => {
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
    stubFailing(async () => {
      throw new Error("object reset");
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

  it("C8: fails open when the Durable Object doesn't answer a read in time", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: T0 });
    stubFailing(() => new Promise<never>(() => {}));
    const pending = startRateLimit("u1", "read").enforce(free);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(mocks.warn.mock.calls[0]![0]).toBe(
      `Rate limit check failed open: no answer within ${RATE_LIMIT_TIMEOUT_MS}ms`,
    );
  });
});

describe("failing closed — AI", () => {
  it("C8: AI fails closed when the Durable Object errors — a 429 with a few seconds' wait", async () => {
    stubFailing(async () => {
      throw new Error("object reset");
    });
    const err = await refusalOf(() => startRateLimit("u1", "ai").enforce(free));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 429,
      code: "rate_limited",
      details: { bucket: "ai", retryAfterSeconds: AI_UNAVAILABLE_RETRY_SECONDS },
      message: "AI requests are paused for a moment. Try again in 5 seconds.",
    });
    // Throttled like the open case, and named for what happened.
    await refusalOf(() => startRateLimit("u1", "ai").enforce(free));
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0]![0]).toBe(
      "Rate limit check failed closed (AI refused): object reset",
    );
    expect(mocks.warn.mock.calls[0]![1]).toMatchObject({ event: "rate_limit.failed_closed" });
  });

  it("C8: AI fails closed when the Durable Object doesn't answer within its longer timeout", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: T0 });
    stubFailing(() => new Promise<never>(() => {}));
    const pending = refusalOf(() => startRateLimit("u1", "ai").enforce(free));

    // Still waiting where a read would already have given up…
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_TIMEOUT_MS);
    expect(mocks.warn).not.toHaveBeenCalled();
    // …and refused once the AI timeout passes.
    await vi.advanceTimersByTimeAsync(AI_RATE_LIMIT_TIMEOUT_MS - RATE_LIMIT_TIMEOUT_MS);
    expect(await pending).toMatchObject({ status: 429, details: { bucket: "ai" } });
    expect(mocks.warn.mock.calls[0]![0]).toBe(
      `Rate limit check failed closed (AI refused): no answer within ${AI_RATE_LIMIT_TIMEOUT_MS}ms`,
    );
  });

  it("C8: AI fails closed when the binding errors", async () => {
    mocks.getRateLimiterStub.mockImplementation(() => {
      throw new Error("bad binding");
    });
    expect(await refusalOf(() => startRateLimit("u1", "ai").enforce(free))).toMatchObject({
      status: 429,
    });
  });

  it("C8: AI still fails open with no binding at all (next dev, tests)", async () => {
    mocks.getRateLimiterStub.mockReturnValue(null);
    await expect(startRateLimit("u1", "ai").enforce(free)).resolves.toBeUndefined();
  });

  it("C8: an AI failure doesn't block the person — the next request asks again", async () => {
    stubFailing(async () => {
      throw new Error("blip");
    });
    await refusalOf(() => startRateLimit("u1", "ai").enforce(free));
    const stub = stubAnswering(snapshotOf(1));
    await expect(startRateLimit("u1", "ai").enforce(free)).resolves.toBeUndefined();
    expect(stub.hit).toHaveBeenCalledWith("ai", 1);
  });
});

describe("judging", () => {
  it("C8: under Free's numbers the plan is never looked up", async () => {
    stubAnswering(snapshotOf(20));
    const resolvePlan = vi.fn(pro);
    await startRateLimit("u1", "create").enforce(resolvePlan);
    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("C8: over Free's numbers a paid plan's limits apply", async () => {
    stubAnswering(snapshotOf(25)); // Free 20, Plus 30, Pro 40 a minute
    await expect(startRateLimit("u1", "create").enforce(plus)).resolves.toBeUndefined();
    await expect(startRateLimit("u2", "create").enforce(async () => "pro")).resolves.toBeUndefined();
    await expect(startRateLimit("u3", "create").enforce(free)).rejects.toMatchObject({
      status: 429,
    });

    stubAnswering(snapshotOf(35));
    await expect(startRateLimit("u4", "create").enforce(plus)).rejects.toMatchObject({
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
    const err = await refusalOf(() => startRateLimit("u1", "ai").enforce(free));
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

  it("C8: a weighted request is sent, judged and taken back at its weight", async () => {
    // 101 earlier reads + one export weighing 20 = 121 > Free's 120 a minute.
    const stub = stubAnswering(snapshotOf(121));
    const err = await refusalOf(() => startRateLimit("u1", "read", 20).enforce(free));
    expect(err).toMatchObject({ status: 429, details: { bucket: "read", window: "1m" } });
    expect(stub.hit).toHaveBeenCalledWith("read", 20);
    expect(stub.undo).toHaveBeenCalledWith("read", T0 + 30_000, 20);
    // The same counts with a single read (weight 1) on top would pass: 101 + 1.
    stubAnswering(snapshotOf(102));
    await expect(startRateLimit("u2", "read").enforce(free)).resolves.toBeUndefined();
  });

  it("C8: a refused request is undone after the response", async () => {
    const stub = stubAnswering(snapshotOf(21));
    const deferred: (() => unknown)[] = [];
    mocks.after.mockImplementation((fn: () => unknown) => deferred.push(fn));

    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);
    expect(stub.undo).not.toHaveBeenCalled(); // not inline…
    await deferred[0]!(); // …but once the response is out
    expect(stub.undo).toHaveBeenCalledWith("create", T0 + 30_000, 1);
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

    // 10s later, same plan: refused from the block, with the remaining wait.
    vi.setSystemTime(T0 + 40_000);
    expect(await refusalOf(() => startRateLimit("u1", "create").enforce(free))).toMatchObject({
      status: 429,
      details: { retryAfterSeconds: 23, window: "1m" },
    });
    expect(stub.hit).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledTimes(1);

    // Other buckets and other people are untouched.
    stubAnswering(snapshotOf(1));
    await expect(startRateLimit("u1", "read").enforce(free)).resolves.toBeUndefined();
    await expect(startRateLimit("u2", "create").enforce(free)).resolves.toBeUndefined();
  });

  it("C8: a block earned on Free doesn't refuse in a Pro workspace, or after an upgrade", async () => {
    stubAnswering(snapshotOf(21));
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toThrow(ApiError);

    // The same person in a Pro workspace (or after upgrading): judged afresh
    // against Pro's 40 — 22 requests pass.
    const stub = stubAnswering(snapshotOf(22));
    await expect(startRateLimit("u1", "create").enforce(pro)).resolves.toBeUndefined();
    expect(stub.hit).toHaveBeenCalledTimes(1);
    // Back in the Free workspace, the block still holds — no new hit.
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toMatchObject({
      status: 429,
    });
    expect(stub.hit).toHaveBeenCalledTimes(1);
  });

  it("C8: a block earned on Plus refuses in a Free workspace too", async () => {
    stubAnswering(snapshotOf(31));
    await expect(startRateLimit("u1", "create").enforce(plus)).rejects.toThrow(ApiError);
    const stub = stubAnswering(snapshotOf(1));
    await expect(startRateLimit("u1", "create").enforce(free)).rejects.toMatchObject({
      status: 429,
    });
    expect(stub.hit).not.toHaveBeenCalled();
  });

  it("C8: a refused export blocks the next export, not a plain read", async () => {
    stubAnswering(snapshotOf(121)); // 101 reads + an export weighing 20
    await expect(startRateLimit("u1", "read", 20).enforce(free)).rejects.toThrow(ApiError);

    const stub = stubAnswering(snapshotOf(102)); // 101 + one plain read: fits
    await expect(startRateLimit("u1", "read", 20).enforce(free)).rejects.toMatchObject({
      status: 429,
    });
    expect(stub.hit).not.toHaveBeenCalled(); // the export was refused from the block
    await expect(startRateLimit("u1", "read").enforce(free)).resolves.toBeUndefined();
    expect(stub.hit).toHaveBeenCalledWith("read", 1); // the read was counted and passed
  });

  it("C8: a block earned on the top plan refuses before anything else runs", async () => {
    stubAnswering(snapshotOf(41)); // over Pro's 40
    await expect(startRateLimit("u1", "create").enforce(pro)).rejects.toThrow(ApiError);
    const stub = stubAnswering(snapshotOf(1));
    // Thrown by startRateLimit itself — before the caller resolves a workspace.
    expect(() => startRateLimit("u1", "create")).toThrow(ApiError);
    await expect(enforceRateLimit("u1", "create", pro)).rejects.toMatchObject({ status: 429 });
    expect(stub.hit).not.toHaveBeenCalled();
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
    stubAnswering(snapshotOf(41));
    for (let i = 0; i < 1_000; i++) {
      await startRateLimit(`u${i}`, "create").enforce(pro).catch(() => {});
    }
    // All of those have expired; the next block sweeps them instead of growing.
    vi.setSystemTime(T0 + 30_000 + 120_000);
    await startRateLimit("late", "create").enforce(pro).catch(() => {});
    expect(() => startRateLimit("u0", "create")).not.toThrow();
    expect(() => startRateLimit("late", "create")).toThrow(ApiError);
  });

  it("starts over when the cache is full of live blocks", async () => {
    stubAnswering(snapshotOf(41));
    for (let i = 0; i <= 1_000; i++) {
      await startRateLimit(`u${i}`, "create").enforce(pro).catch(() => {});
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
