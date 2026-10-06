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

const { afterResponse, settleDeferred } = await import("@/lib/defer");

beforeEach(() => {
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
