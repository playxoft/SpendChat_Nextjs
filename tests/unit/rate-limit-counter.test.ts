import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REQUEST_WEIGHT,
  RateCounter,
  isRateBucket,
  type CounterStorage,
} from "@/lib/rate-limit/counter";
import { RateLimiter } from "@/lib/rate-limit/durable-object";

const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

/** A Durable Object's sync KV storage, as a Map we can inspect. */
function memoryStorage(): CounterStorage & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: (key) => map.get(key),
    put: (key, value) => {
      map.set(key, structuredClone(value));
    },
  };
}

describe("isRateBucket", () => {
  it("accepts the three buckets and nothing else", () => {
    expect(["create", "read", "ai"].every(isRateBucket)).toBe(true);
    expect(isRateBucket("delete")).toBe(false);
    expect(isRateBucket(undefined)).toBe(false);
    expect(isRateBucket(1)).toBe(false);
  });
});

describe("RateCounter", () => {
  it("counts hits per bucket and persists one key per bucket", () => {
    const storage = memoryStorage();
    const counter = new RateCounter(storage);
    counter.hit("create", T0);
    const snap = counter.hit("create", T0 + 1_000);
    counter.hit("read", T0 + 2_000);

    expect(snap).toEqual({
      at: T0 + 1_000,
      windows: [
        [T0, 2, 0],
        [T0, 2, 0],
        [T0, 2, 0],
      ],
    });
    expect([...storage.map.keys()].sort()).toEqual(["create", "read"]);
  });

  it("C8: keeps counts in storage across a restart", () => {
    const storage = memoryStorage();
    new RateCounter(storage).hit("ai", T0);
    // A fresh instance — the Durable Object was evicted — reads storage back.
    const snap = new RateCounter(storage).hit("ai", T0 + 1_000);
    expect(snap.windows[0]).toEqual([T0, 2, 0]);
  });

  it("C8: an undone hit leaves the counts as they were", () => {
    const counter = new RateCounter(memoryStorage());
    counter.hit("create", T0);
    const refused = counter.hit("create", T0 + 500);
    counter.undo("create", refused.at);
    expect(counter.hit("create", T0 + 600).windows[0]).toEqual([T0, 2, 0]);
  });

  it("ignores an undo for a bucket it has never counted", () => {
    const storage = memoryStorage();
    new RateCounter(storage).undo("read", T0);
    expect(storage.map.size).toBe(0);
  });

  it("treats malformed stored counts as empty", () => {
    const storage = memoryStorage();
    storage.map.set("create", "garbage");
    storage.map.set("read", [[1, 2, 3]]);
    storage.map.set("ai", [
      [1, 2, 3],
      [1, 2, "x"],
      [1, 2, 3],
    ]);
    const counter = new RateCounter(storage);
    expect(counter.hit("create", T0).windows[0]).toEqual([T0, 1, 0]);
    expect(counter.hit("read", T0).windows[0]).toEqual([T0, 1, 0]);
    expect(counter.hit("ai", T0).windows[0]).toEqual([T0, 1, 0]);
  });

  it("C8: counts a weighted request at its weight, and takes it back the same", () => {
    const counter = new RateCounter(memoryStorage());
    counter.hit("read", T0);
    expect(counter.hit("read", T0 + 1, 20).windows[0]).toEqual([T0, 21, 0]);
    counter.undo("read", T0 + 1, 20);
    expect(counter.hit("read", T0 + 2).windows[0]).toEqual([T0, 2, 0]);
  });

  it("refuses a weight that isn't a whole number from 1 to the maximum", () => {
    const counter = new RateCounter(memoryStorage());
    for (const bad of [0, -1, 1.5, MAX_REQUEST_WEIGHT + 1, "2"]) {
      expect(() => counter.hit("read", T0, bad)).toThrow(/A request weighs/);
    }
    expect(() => counter.undo("read", T0, 0)).toThrow(/A request weighs/);
  });

  it("refuses an unknown bucket or a missing timestamp", () => {
    const counter = new RateCounter(memoryStorage());
    expect(() => counter.hit("delete", T0)).toThrow(/Unknown rate-limit bucket/);
    expect(() => counter.undo("delete", T0)).toThrow(/Unknown rate-limit bucket/);
    expect(() => counter.undo("read", Number.NaN)).toThrow(/timestamp/);
  });
});

describe("RateLimiter (Durable Object)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function objectOver(storage: CounterStorage) {
    const state = { storage: { kv: storage } } as unknown as DurableObjectState;
    return new RateLimiter(state, {} as Cloudflare.Env);
  }

  it("C8: counts on its own clock and keeps the counts across a restart", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 + 5_000 });
    const storage = memoryStorage();
    objectOver(storage).hit("create");
    const snap = objectOver(storage).hit("create");
    expect(snap).toEqual({
      at: T0 + 5_000,
      windows: [
        [T0, 2, 0],
        [T0, 2, 0],
        [T0, 2, 0],
      ],
    });
  });

  it("takes a refused hit back", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 + 5_000 });
    const object = objectOver(memoryStorage());
    object.hit("ai");
    const refused = object.hit("ai");
    object.undo("ai", refused.at);
    expect(object.hit("ai").windows[0]).toEqual([T0, 2, 0]);
  });

  it("C8: counts and takes back a weighted request over RPC", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 + 5_000 });
    const object = objectOver(memoryStorage());
    const exported = object.hit("read", 20);
    expect(exported.windows[0]).toEqual([T0, 20, 0]);
    object.undo("read", exported.at, 20);
    expect(object.hit("read").windows[0]).toEqual([T0, 1, 0]);
  });

  it("rejects an unknown bucket from a caller", () => {
    expect(() => objectOver(memoryStorage()).hit("everything")).toThrow(/Unknown/);
  });
});
