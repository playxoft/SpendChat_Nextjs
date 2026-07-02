import { describe, it, expect, vi, beforeEach } from "vitest";

// Swappable stand-in for next/headers — a plain function (not vi.fn) so the
// out-of-scope throw below propagates exactly like the real API's.
let headersImpl: () => Promise<Pick<Headers, "get">>;
vi.mock("next/headers", () => ({
  headers: () => headersImpl(),
}));

import { detectSettingsDefaults } from "@/lib/geo.server";

beforeEach(() => {
  headersImpl = async () => new Headers();
});

describe("detectSettingsDefaults", () => {
  it("detects currency from Cloudflare's cf-ipcountry and locale from Accept-Language", async () => {
    headersImpl = async () =>
      new Headers({ "cf-ipcountry": "IN", "accept-language": "en-IN,hi;q=0.8" });
    expect(await detectSettingsDefaults()).toEqual({
      currency: "INR",
      locale: "en-IN",
    });
  });

  it("falls back to the Accept-Language region without edge geolocation", async () => {
    headersImpl = async () => new Headers({ "accept-language": "de-DE" });
    expect(await detectSettingsDefaults()).toEqual({
      currency: "EUR",
      locale: "de-DE",
    });
  });

  it("returns global defaults outside a request scope", async () => {
    // Real next/headers throws when there is no request scope.
    headersImpl = () => {
      throw new Error("headers called outside a request scope");
    };
    expect(await detectSettingsDefaults()).toEqual({
      currency: "USD",
      locale: "en-US",
    });
  });
});
