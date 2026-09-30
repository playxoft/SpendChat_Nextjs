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

describe("sanitizeNumberInput — never a different number", () => {
  it("keeps digits in any script, and the Arabic separators", () => {
    expect(sanitizeNumberInput("٤٠٫٥")).toBe("٤٠٫٥");
    expect(parseNumber(sanitizeNumberInput("٤٠٫٥"), "ar-EG")).toBe(40.5);
    expect(sanitizeNumberInput("१२३४")).toBe("१२३४");
    expect(sanitizeNumberInput("১২৩")).toBe("১২৩");
  });

  it("reads a minus or brackets before the first digit as the sign", () => {
    expect(sanitizeNumberInput("USD -1,200")).toBe("-1,200");
    expect(sanitizeNumberInput("$-1,200")).toBe("-1,200");
    expect(sanitizeNumberInput("(1,200)")).toBe("-1,200");
    expect(sanitizeNumberInput("-")).toBe("-");
  });

  it("leaves a minus between digits and a pasted exponent for the parser to reject", () => {
    expect(sanitizeNumberInput("12-15")).toBe("12-15");
    expect(parseNumber(sanitizeNumberInput("12-15"), "en-US")).toBeNull();
    expect(parseNumber(sanitizeNumberInput("1e6"), "en-US")).toBeNull();
  });

  it("still drops letters as they're typed", () => {
    expect(sanitizeNumberInput("1e")).toBe("1");
    expect(sanitizeNumberInput("12%")).toBe("12");
    expect(sanitizeNumberInput("1.")).toBe("1.");
    expect(sanitizeNumberInput("1 ")).toBe("1 ");
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
    expect(sanitizeNumberInput("abc")).toBe("");
  });
});
