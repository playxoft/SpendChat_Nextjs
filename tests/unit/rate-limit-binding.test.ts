import { beforeEach, describe, expect, it, vi } from "vitest";

// Swappable stand-in for the Worker context: `getCloudflareContext()` throws
// outside a Worker request, and inside one hands back the env bindings.
const context = vi.hoisted(() => ({ get: (): unknown => ({ env: {} }) }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => context.get(),
}));

import { getRateLimiterStub } from "@/lib/rate-limit/binding";

describe("getRateLimiterStub", () => {
  beforeEach(() => {
    context.get = () => ({ env: {} });
  });

  it("is null outside a Worker request", () => {
    context.get = () => {
      throw new Error("getCloudflareContext has been called outside a request");
    };
    expect(getRateLimiterStub("u1")).toBeNull();
  });

  it("is null when the env has no RATE_LIMITER binding (next dev)", () => {
    expect(getRateLimiterStub("u1")).toBeNull();
  });

  it("C8: addresses one Durable Object per person, by user id", () => {
    const stub = { hit: vi.fn(), undo: vi.fn() };
    const getByName = vi.fn(() => stub);
    context.get = () => ({ env: { RATE_LIMITER: { getByName } } });
    expect(getRateLimiterStub("user-123")).toBe(stub);
    expect(getByName).toHaveBeenCalledWith("user-123");
  });
});
