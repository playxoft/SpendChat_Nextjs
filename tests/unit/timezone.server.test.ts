import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get }),
}));

import { getTimeZone } from "@/lib/timezone.server";

beforeEach(() => get.mockReset());

describe("getTimeZone", () => {
  it("returns the viewer's zone from a valid cookie", async () => {
    get.mockReturnValue({ value: "Asia/Kolkata" });
    expect(await getTimeZone()).toBe("Asia/Kolkata");
  });

  it("falls back to UTC when the cookie is missing", async () => {
    get.mockReturnValue(undefined);
    expect(await getTimeZone()).toBe("UTC");
  });

  it("falls back to UTC when the cookie is invalid", async () => {
    get.mockReturnValue({ value: "Bogus/Zone" });
    expect(await getTimeZone()).toBe("UTC");
  });
});
