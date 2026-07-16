import { describe, it, expect } from "vitest";
import {
  toMinorUnits,
  fromMinorUnits,
  formatMoney,
  signedMinor,
  minorToInputString,
} from "@/lib/money";

describe("toMinorUnits", () => {
  it("converts 2-decimal currencies", () => {
    expect(toMinorUnits(12.5, "USD")).toBe(1250);
    expect(toMinorUnits(0.01, "USD")).toBe(1);
    expect(toMinorUnits(0, "USD")).toBe(0);
  });

  it("respects per-currency decimals (JPY has 0)", () => {
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
    expect(toMinorUnits(1500.75, "JPY")).toBe(1501); // rounds to whole yen
  });

  it("rounds to the nearest minor unit", () => {
    expect(toMinorUnits(1.006, "USD")).toBe(101); // 100.6 → 101
    expect(toMinorUnits(1.004, "USD")).toBe(100); // 100.4 → 100
    expect(toMinorUnits(1.999, "USD")).toBe(200); // 199.9 → 200
  });

  it("parses strings, stripping currency symbols and grouping", () => {
    expect(toMinorUnits("$1,250.50", "USD")).toBe(125050);
    expect(toMinorUnits("₹2,00,000", "INR")).toBe(20000000);
    expect(toMinorUnits("-40", "USD")).toBe(-4000);
  });

  it("reads a string against the caller's locale", () => {
    // "1,50" is 1.50 in de-DE and malformed grouping in en-US — never 150.
    expect(toMinorUnits("1,50", "EUR", "de-DE")).toBe(150);
    expect(toMinorUnits("1.234,56", "EUR", "de-DE")).toBe(123456);
    expect(() => toMinorUnits("1,50", "USD", "en-US")).toThrow("Invalid amount");
  });

  it("throws on an unknown currency instead of guessing USD decimals", () => {
    expect(() => toMinorUnits(10, "ZZZ")).toThrow("Unsupported currency code");
  });

  it("throws on an unreadable amount rather than silently returning 0", () => {
    expect(() => toMinorUnits("abc", "USD")).toThrow("Invalid amount");
    expect(() => toMinorUnits("", "USD")).toThrow("Invalid amount");
  });

  it("throws on a non-finite amount", () => {
    expect(() => toMinorUnits("1.2.3", "USD")).toThrow("Invalid amount");
    expect(() => toMinorUnits(Infinity, "USD")).toThrow("Invalid amount");
    expect(() => toMinorUnits(NaN, "USD")).toThrow("Invalid amount");
  });
});

describe("fromMinorUnits", () => {
  it("is the inverse of toMinorUnits", () => {
    expect(fromMinorUnits(1250, "USD")).toBe(12.5);
    expect(fromMinorUnits(1500, "JPY")).toBe(1500);
  });
});

describe("formatMoney", () => {
  it("formats positive amounts with the currency symbol", () => {
    expect(formatMoney(1250, "USD")).toBe("$12.50");
  });

  it("prefixes a minus glyph for negative amounts", () => {
    expect(formatMoney(-1250, "USD")).toBe("−$12.50");
  });

  it("shows an explicit sign when `signed` is set", () => {
    expect(formatMoney(1250, "USD", "en-US", { signed: true })).toBe("+$12.50");
    expect(formatMoney(-1250, "USD", "en-US", { signed: true })).toBe("−$12.50");
  });

  it("honours the locale", () => {
    // de-DE groups/decimals differently; assert the digits + currency are present.
    const out = formatMoney(123456, "EUR", "de-DE");
    expect(out).toContain("€");
    expect(out).toContain("1.234,56");
  });

  it("respects 0-decimal currencies", () => {
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
  });
});

describe("signedMinor", () => {
  it("negates expenses and keeps income positive", () => {
    expect(signedMinor("expense", 500)).toBe(-500);
    expect(signedMinor("income", 500)).toBe(500);
  });

  it("normalises the sign of the input magnitude", () => {
    expect(signedMinor("expense", -500)).toBe(-500);
    expect(signedMinor("income", -500)).toBe(500);
  });
});

describe("minorToInputString", () => {
  it("renders unsigned, fixed-precision major units", () => {
    expect(minorToInputString(-1250, "USD")).toBe("12.50");
    expect(minorToInputString(1500, "JPY")).toBe("1500");
  });
});
