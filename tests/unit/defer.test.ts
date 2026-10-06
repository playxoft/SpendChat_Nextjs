import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `afterResponse`: Next's `after()` in a request, a queue outside one, and
 * never an error that reaches the write it follows.
 */

const state = vi.hoisted(() => ({
  afterThrows: true,
  scheduled: [] as (() => Promise<void>)[],
  cloudflare: [] as boolean[],
}));

vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    if (state.afterThrows) throw new Error("`after` was called outside a request scope");
    state.scheduled.push(fn);
  },
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    // Each call takes the next answer; an empty list means "no context".
    if (!state.cloudflare.shift()) throw new Error("no context");
    return { env: {}, ctx: {} };
  },
}));

const logged = vi.hoisted(() => ({ warn: [] as { message: string; event: unknown }[] }));
vi.mock("@/lib/logger", () => ({
  describeError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  logger: {
    warn: (message: string, meta: { event?: unknown }) => logged.warn.push({ message, event: meta.event }),
    error: () => {},
    info: () => {},
    debug: () => {},
  },
}));

const { afterResponse, settleDeferred } = await import("@/lib/defer");

beforeEach(() => {
  logged.warn = [];
  vi.unstubAllEnvs();
  state.afterThrows = true;
  state.scheduled = [];
  state.cloudflare = [];
});

describe("afterResponse", () => {
  it("queues outside a request and runs the queue in order when settled", async () => {
    const ran: string[] = [];
    afterResponse("first", async () => void ran.push("first"));
    afterResponse("second", async () => void ran.push("second"));
    expect(ran).toEqual([]);
    await settleDeferred();
    expect(ran).toEqual(["first", "second"]);
    await settleDeferred(); // nothing twice
    expect(ran).toEqual(["first", "second"]);
  });

  it("hands the task to after() inside a request, without running it", async () => {
    state.afterThrows = false;
    const task = vi.fn(async () => {});
    afterResponse("check", task);
    expect(task).not.toHaveBeenCalled();
    expect(state.scheduled).toHaveLength(1);
    await state.scheduled[0]!();
    expect(task).toHaveBeenCalledOnce();
  });

  it("drops the task, with a warning, when after() is missing in a real request", async () => {
    state.cloudflare = [true]; // a Worker request whose after() isn't wired
    const task = vi.fn(async () => {});
    afterResponse("budget check", task);
    await settleDeferred();
    expect(task).not.toHaveBeenCalled();
    expect(logged.warn).toEqual([
      {
        message: "The budget check was dropped because after() isn't available here: `after` was called outside a request scope",
        event: "defer.unavailable",
      },
    ]);
  });

  it("drops the task outside the test runner — nothing queues where nobody drains it", async () => {
    vi.stubEnv("VITEST", "");
    const task = vi.fn(async () => {});
    afterResponse("budget check", task);
    vi.unstubAllEnvs();
    await settleDeferred();
    expect(task).not.toHaveBeenCalled();
    expect(logged.warn.map((w) => w.event)).toEqual(["defer.unavailable"]);
  });

  it("swallows a failing task — the write it follows already succeeded", async () => {
    afterResponse("boom", async () => {
      throw new Error("db down");
    });
    await expect(settleDeferred()).resolves.toBeUndefined();
  });

  it("skips the task when the request's Cloudflare context is gone after the response", async () => {
    state.afterThrows = false;
    state.cloudflare = [true]; // present when scheduled, absent when run
    const task = vi.fn(async () => {});
    afterResponse("check", task);
    await state.scheduled[0]!();
    expect(task).not.toHaveBeenCalled();

    state.cloudflare = [true, true]; // present both times
    afterResponse("check", task);
    await state.scheduled[1]!();
    expect(task).toHaveBeenCalledOnce();
  });
});
