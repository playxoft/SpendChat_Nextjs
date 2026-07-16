import { describe, it, expect } from "vitest";
import {
  formatAmountInput,
  localeSeparators,
  parseAmountInput,
} from "@/lib/parse-amount";

describe("localeSeparators", () => {
  it("reads the separators out of the locale", () => {
    expect(localeSeparators("en-US")).toEqual({ group: ",", decimal: "." });
    expect(localeSeparators("de-DE")).toEqual({ group: ".", decimal: "," });
  });

  it("falls back to en-US separators for an unusable tag", () => {
    expect(localeSeparators("not a locale")).toEqual({ group: ",", decimal: "." });
  });
});

describe("parseAmountInput — dot-decimal locales", () => {
  it("parses plain and grouped amounts", () => {
    expect(parseAmountInput("12.50", "en-US")).toBe(12.5);
    expect(parseAmountInput("1,000", "en-US")).toBe(1000);
    expect(parseAmountInput("1,250.50", "en-US")).toBe(1250.5);
    expect(parseAmountInput("1,250,000.05", "en-US")).toBe(1250000.05);
  });

  it("tolerates a currency symbol or code at the edges", () => {
    expect(parseAmountInput("$1,250.50", "en-US")).toBe(1250.5);
    expect(parseAmountInput("12 EUR", "en-US")).toBe(12);
  });

  it("accepts Indian grouping", () => {
    expect(parseAmountInput("₹2,00,000", "en-IN")).toBe(200000);
    expect(parseAmountInput("₹2,00,000", "en-US")).toBe(200000);
  });

  it("passes numbers through untouched", () => {
    expect(parseAmountInput(12.5, "en-US")).toBe(12.5);
    expect(parseAmountInput(0, "en-US")).toBe(0);
  });

  it("keeps the sign", () => {
    expect(parseAmountInput("-40", "en-US")).toBe(-40);
    expect(parseAmountInput("+2000", "en-US")).toBe(2000);
  });
});

describe("parseAmountInput — comma-decimal locales", () => {
  it("reads a comma as the decimal separator", () => {
    expect(parseAmountInput("1,50", "de-DE")).toBe(1.5);
    expect(parseAmountInput("0,99", "de-DE")).toBe(0.99);
    expect(parseAmountInput("-40,50", "de-DE")).toBe(-40.5);
  });

  it("reads a dot as the group separator", () => {
    expect(parseAmountInput("1.234,56", "de-DE")).toBe(1234.56);
    expect(parseAmountInput("1.000", "de-DE")).toBe(1000);
  });

  it("handles space-grouping locales", () => {
    expect(parseAmountInput("1 000,50", "fr-FR")).toBe(1000.5);
    expect(parseAmountInput("12,50", "fr-FR")).toBe(12.5);
  });
});

describe("parseAmountInput — rejects ambiguous input (the B1 class)", () => {
  it("rejects a comma-decimal amount under a dot-decimal locale", () => {
    // The bug: "1,50" used to be read as 150 — a silent 100x overcharge.
    expect(parseAmountInput("1,50", "en-US")).toBeNull();
    expect(parseAmountInput("1,5", "en-US")).toBeNull();
  });

  it("rejects input that contradicts the locale's separators", () => {
    expect(parseAmountInput("1.234,56", "en-US")).toBeNull();
    expect(parseAmountInput("1,234.56", "de-DE")).toBeNull();
  });

  it("rejects malformed grouping", () => {
    expect(parseAmountInput("1,0000", "en-US")).toBeNull();
    expect(parseAmountInput("1,,000", "en-US")).toBeNull();
    expect(parseAmountInput(",50", "en-US")).toBeNull();
  });

  it("rejects non-numeric and multi-decimal input", () => {
    expect(parseAmountInput("abc", "en-US")).toBeNull();
    expect(parseAmountInput("", "en-US")).toBeNull();
    expect(parseAmountInput("   ", "en-US")).toBeNull();
    expect(parseAmountInput("1.2.3", "en-US")).toBeNull();
    expect(parseAmountInput("12abc34", "en-US")).toBeNull();
    expect(parseAmountInput("1e5", "en-US")).toBeNull();
    expect(parseAmountInput("-", "en-US")).toBeNull();
    expect(parseAmountInput("1-2", "en-US")).toBeNull();
    expect(parseAmountInput(NaN, "en-US")).toBeNull();
    expect(parseAmountInput(Infinity, "en-US")).toBeNull();
  });
});

describe("formatAmountInput", () => {
  it("round-trips through parseAmountInput", () => {
    for (const locale of ["en-US", "de-DE", "fr-FR"]) {
      const text = formatAmountInput(1234.5, locale);
      expect(parseAmountInput(text, locale)).toBe(1234.5);
    }
  });

  it("formats without grouping", () => {
    expect(formatAmountInput(1234.5, "en-US")).toBe("1234.5");
    expect(formatAmountInput(1234.5, "de-DE")).toBe("1234,5");
  });
});
