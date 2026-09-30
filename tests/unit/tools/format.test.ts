import { describe, expect, it } from "vitest";
import { formatCurrency, formatPercent, parseNumber, sanitizeNumberInput } from "@/lib/tools/format";

describe("parseNumber", () => {
  it("reads the visitor's own grouping and decimal marks", () => {
    expect(parseNumber("1,00,000", "en-IN")).toBe(100000);
    expect(parseNumber("1,5", "de-DE")).toBe(1.5);
    expect(parseNumber("1.500", "de-DE")).toBe(1500);
  });

  it("still reads dot-decimal defaults and shared links in comma-decimal locales", () => {
    expect(parseNumber("0.15", "de-DE")).toBe(0.15);
    expect(parseNumber("120000.50", "fr-FR")).toBe(120000.5);
  });

  it("returns null for empty, junk or absurdly long input", () => {
    expect(parseNumber("", "en-US")).toBeNull();
    expect(parseNumber("abc", "de-DE")).toBeNull();
    expect(parseNumber("1".repeat(41), "en-US")).toBeNull();
  });
});

describe("formatters", () => {
  it("formats money in the currency's decimals and shows a dash for non-finite values", () => {
    expect(formatCurrency(1234.5, "USD", "en-US")).toBe("$1,234.50");
    expect(formatCurrency(1234.5, "JPY", "en-US")).toBe("¥1,235");
    expect(formatCurrency(Number.NaN, "USD")).toBe("—");
  });

  it("appends a percent sign to an already-percentage value", () => {
    expect(formatPercent(12.5)).toBe("12.5%");
  });
});

describe("sanitizeNumberInput", () => {
  it("keeps digits, the world's separators and a leading minus", () => {
    expect(sanitizeNumberInput("1,00,000.50")).toBe("1,00,000.50");
    expect(sanitizeNumberInput("1.000,5")).toBe("1.000,5");
    expect(sanitizeNumberInput("1'000")).toBe("1'000");
    expect(sanitizeNumberInput("-12.5")).toBe("-12.5");
    expect(sanitizeNumberInput("−12")).toBe("-12");
  });

  it("drops letters and symbols as they're typed", () => {
    expect(sanitizeNumberInput("12k")).toBe("12");
    expect(sanitizeNumberInput("$1,500")).toBe("1,500");
    expect(sanitizeNumberInput("1e5")).toBe("15");
    expect(sanitizeNumberInput("abc")).toBe("");
    expect(sanitizeNumberInput("5-3")).toBe("53");
  });
});
