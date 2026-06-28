import { describe, it, expect } from "vitest";
import { TZ_COOKIE, DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/timezone";

describe("timezone constants", () => {
  it("uses 'tz' cookie and a UTC fallback", () => {
    expect(TZ_COOKIE).toBe("tz");
    expect(DEFAULT_TIME_ZONE).toBe("UTC");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
  });

  it("rejects junk and empty values (guards attacker-set cookies)", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("'; DROP TABLE")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});
