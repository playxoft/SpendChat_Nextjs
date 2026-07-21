import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getLogContext,
  setLogContext,
  runWithLogContext,
  seedFromHeaders,
  normalizePlatform,
} from "@/lib/log-context";

describe("log context store", () => {
  it("is all-null outside a request scope", () => {
    expect(getLogContext()).toEqual({
      requestId: null,
      platform: null,
      host: null,
      userId: null,
      workspaceId: null,
      profileId: null,
    });
  });

  it("setLogContext is a no-op with no active store (never throws)", () => {
    expect(() => setLogContext({ userId: "u1" })).not.toThrow();
    expect(getLogContext().userId).toBeNull();
  });

  it("seeds then enriches within a scope, and doesn't leak out of it", () => {
    runWithLogContext({ requestId: "ray-1", platform: "web" }, () => {
      expect(getLogContext().requestId).toBe("ray-1");
      setLogContext({ userId: "u1", workspaceId: "w1" });
      setLogContext({ profileId: "p1" });
      expect(getLogContext()).toEqual({
        requestId: "ray-1",
        platform: "web",
        host: null,
        userId: "u1",
        workspaceId: "w1",
        profileId: "p1",
      });
    });
    // Back outside the scope everything is null again.
    expect(getLogContext().userId).toBeNull();
  });

  it("keeps nested scopes isolated", () => {
    runWithLogContext({ requestId: "outer" }, () => {
      runWithLogContext({ requestId: "inner" }, () => {
        expect(getLogContext().requestId).toBe("inner");
      });
      expect(getLogContext().requestId).toBe("outer");
    });
  });
});

describe("normalizePlatform", () => {
  it("accepts the known platforms case-insensitively", () => {
    expect(normalizePlatform("web")).toBe("web");
    expect(normalizePlatform("ANDROID")).toBe("android");
    expect(normalizePlatform("  iOS ")).toBe("ios");
  });

  it("rejects unknown/blank values", () => {
    expect(normalizePlatform("windows")).toBeNull();
    expect(normalizePlatform("")).toBeNull();
    expect(normalizePlatform(null)).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
  });
});

describe("seedFromHeaders", () => {
  it("uses cf-ray as the request id, the client platform, and the host header", () => {
    const headers: Record<string, string> = {
      "cf-ray": "8abc123def-SIN",
      "x-client-platform": "ios",
      host: "spendchat.app",
    };
    expect(seedFromHeaders((n) => headers[n] ?? null, "api")).toEqual({
      requestId: "8abc123def-SIN",
      platform: "ios",
      host: "spendchat.app",
    });
  });

  it("falls back to a generated uuid, the fallback platform, and a null host", () => {
    const seed = seedFromHeaders(() => null, "web");
    expect(seed.platform).toBe("web");
    expect(seed.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seed.host).toBeNull();
  });
});

describe("logger attaches the request identity to every line", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("merges the six context fields, with explicit meta winning", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "info");
    // Fresh module graph so logger + log-context share one ALS instance and the
    // level is re-read from the stubbed env.
    const { logger } = await import("@/lib/logger");
    const ctx = await import("@/lib/log-context");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    ctx.runWithLogContext({ requestId: "ray-9", platform: "android", host: "spendchat.app" }, () => {
      ctx.setLogContext({ userId: "u1", workspaceId: "w1", profileId: "p1" });
      logger.info("Database insert into transactions", { event: "db.write" });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const meta = spy.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta).toMatchObject({
      requestId: "ray-9",
      platform: "android",
      host: "spendchat.app",
      userId: "u1",
      workspaceId: "w1",
      profileId: "p1",
      event: "db.write",
    });
  });

  it("emits null identity fields when logging outside a request", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "info");
    const { logger } = await import("@/lib/logger");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("something happened", { event: "test.event" });

    const meta = spy.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta).toMatchObject({
      requestId: null,
      platform: null,
      host: null,
      userId: null,
      workspaceId: null,
      profileId: null,
      event: "test.event",
    });
  });
});
