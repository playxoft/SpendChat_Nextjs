import { describe, expect, it } from "vitest";
import {
  EXPORT_WEIGHT,
  READ_WEIGHTS,
  bucketOfAction,
  classifyApiRequest,
  formatWait,
  rateLimitMessage,
  rateOfApiRequest,
  rateOfRequest,
} from "@/lib/rate-limit/classify";
import { MAX_REQUEST_WEIGHT } from "@/lib/rate-limit/counter";
import { PERSONAL_PLANS, RATE_LIMITS } from "@/lib/plans";
import {
  ApiError,
  isRateLimitRefusal,
  rateLimited,
  retryAfterHeaders,
  retryAfterSecondsOf,
  tooManyRequests,
} from "@/lib/errors";

describe("classifyApiRequest", () => {
  it("C8: API requests classify by method and path", () => {
    expect(classifyApiRequest("GET", "/api/v1/transactions")).toBe("read");
    expect(classifyApiRequest("HEAD", "/api/v1/transactions")).toBe("read");
    expect(classifyApiRequest("get", "/api/v1/usage")).toBe("read");
    expect(classifyApiRequest("POST", "/api/v1/transactions")).toBe("create");
    expect(classifyApiRequest("POST", "/api/v1/transactions/bulk")).toBe("create");
    expect(classifyApiRequest("PATCH", "/api/v1/settings")).toBe("create");
    expect(classifyApiRequest("PUT", "/api/v1/spaces/x/members")).toBe("create");
    expect(classifyApiRequest("DELETE", "/api/v1/files/x")).toBe("create");
    expect(classifyApiRequest("POST", "/api/v1/ai/parse")).toBe("ai");
    expect(classifyApiRequest("POST", "/api/v1/ai/transcribe")).toBe("ai");
    // Only the AI prefix — not a path that merely contains "ai".
    expect(classifyApiRequest("GET", "/api/v1/details/ai/x")).toBe("read");
  });

  it("reads method and path off a Request", () => {
    expect(rateOfRequest(new Request("http://x/api/v1/ai/parse?y=1", { method: "POST" }))).toEqual({
      bucket: "ai",
      weight: 1,
    });
    expect(rateOfRequest(new Request("http://x/api/v1/me"))).toEqual({ bucket: "read", weight: 1 });
  });
});

describe("request weights", () => {
  it("C8: a CSV export counts as EXPORT_WEIGHT reads; everything else as one", () => {
    expect(EXPORT_WEIGHT).toBe(20);
    expect(rateOfApiRequest("GET", "/api/v1/transactions/export")).toEqual({ bucket: "read", weight: 20 });
    expect(rateOfApiRequest("HEAD", "/api/v1/transactions/export")).toEqual({ bucket: "read", weight: 20 });
    expect(rateOfApiRequest("GET", "/api/v1/transactions")).toEqual({ bucket: "read", weight: 1 });
    expect(rateOfApiRequest("POST", "/api/v1/transactions/export")).toEqual({ bucket: "create", weight: 1 });
  });

  it("C8: no weight exceeds the smallest read limit (or a request could never pass)", () => {
    const smallest = Math.min(
      ...PERSONAL_PLANS.flatMap((p) => Object.values(RATE_LIMITS[p].read)),
    );
    expect(Object.keys(READ_WEIGHTS).length).toBeGreaterThan(0);
    for (const [route, weight] of Object.entries(READ_WEIGHTS)) {
      expect(Number.isInteger(weight) && weight >= 1, route).toBe(true);
      expect(weight, route).toBeLessThanOrEqual(smallest);
      expect(weight, route).toBeLessThanOrEqual(MAX_REQUEST_WEIGHT);
    }
    expect(READ_WEIGHTS["/api/v1/transactions/export"]).toBe(EXPORT_WEIGHT);
  });
});

describe("bucketOfAction", () => {
  it("C8: actions default to create; meta.rateLimit overrides; junk falls back to create", () => {
    expect(bucketOfAction({ userId: "u" })).toBe("create");
    expect(bucketOfAction({ rateLimit: "read" })).toBe("read");
    expect(bucketOfAction({ rateLimit: "ai" })).toBe("ai");
    expect(bucketOfAction({ rateLimit: "create" })).toBe("create");
    expect(bucketOfAction({ rateLimit: "none" })).toBe("create");
    expect(bucketOfAction({ rateLimit: 3 })).toBe("create");
  });
});

describe("formatWait / rateLimitMessage", () => {
  it("spells the wait out, rounded up", () => {
    expect(formatWait(0)).toBe("a second");
    expect(formatWait(1)).toBe("a second");
    expect(formatWait(1.2)).toBe("2 seconds");
    expect(formatWait(40)).toBe("40 seconds");
    expect(formatWait(59)).toBe("59 seconds");
    expect(formatWait(60)).toBe("a minute");
    expect(formatWait(61)).toBe("2 minutes");
    expect(formatWait(312)).toBe("6 minutes");
  });

  it("names what the person was doing", () => {
    expect(rateLimitMessage("create", 40)).toBe(
      "That's a lot of changes in a short time. Try again in 40 seconds.",
    );
    expect(rateLimitMessage("read", 60)).toBe(
      "That's a lot of requests in a short time. Try again in a minute.",
    );
    expect(rateLimitMessage("ai", 120)).toBe(
      "That's a lot of AI requests in a short time. Try again in 2 minutes.",
    );
  });
});

describe("rate_limited errors", () => {
  it("carry their wait for a Retry-After header", () => {
    const err = rateLimited("slow down", { bucket: "read", window: "1m", retryAfterSeconds: 40 });
    expect(err).toMatchObject({ status: 429, code: "rate_limited", message: "slow down" });
    expect(retryAfterSecondsOf(err)).toBe(40);
    expect(retryAfterHeaders(err)).toEqual({ "Retry-After": "40" });
    expect(isRateLimitRefusal(err)).toBe(true);
  });

  it("have no Retry-After when they don't know the wait", () => {
    const err = tooManyRequests();
    expect(retryAfterSecondsOf(err)).toBeNull();
    expect(retryAfterHeaders(err)).toBeUndefined();
    expect(isRateLimitRefusal(err)).toBe(false);
    expect(retryAfterSecondsOf(new ApiError(429, "rate_limited", "x", { retryAfterSeconds: "40" }))).toBeNull();
    expect(retryAfterSecondsOf(new ApiError(429, "rate_limited", "x", { retryAfterSeconds: 0 }))).toBeNull();
    expect(retryAfterSecondsOf(new ApiError(403, "plan_limit", "x", { retryAfterSeconds: 5 }))).toBeNull();
  });

  it("a refusal with no window (the AI charge lock, AI paused) is still a rate-limit refusal", () => {
    const busy = rateLimited("busy", { bucket: "ai", retryAfterSeconds: 1 });
    expect(isRateLimitRefusal(busy)).toBe(true);
    expect(retryAfterHeaders(busy)).toEqual({ "Retry-After": "1" });
  });
});
