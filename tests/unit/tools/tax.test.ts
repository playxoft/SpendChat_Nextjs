import { describe, expect, it } from "vitest";
import { TAX_RATES, TAX_RATES_VERIFIED_ON, findTaxRate } from "@/lib/tools/data/tax-rates";
import { MAX_MINOR, calculateTax, splitGst, toMinor } from "@/lib/tools/tax";

describe("toMinor", () => {
  it("scales by the currency's decimals", () => {
    expect(toMinor(100, 2)).toBe(10000);
    expect(toMinor(1500, 0)).toBe(1500);
    expect(toMinor(12.345, 3)).toBe(12345);
  });

  it("rounds the halves floating point would get wrong", () => {
    // 1.005 × 100 is 100.49999… as a float.
    expect(toMinor(1.005, 2)).toBe(101);
    expect(toMinor(0.29, 2)).toBe(29);
  });

  it("rounds extra decimals to the currency's precision", () => {
    expect(toMinor(10.555, 2)).toBe(1056);
    expect(toMinor(99.5, 0)).toBe(100);
  });

  it("handles zero, tiny and negative amounts", () => {
    expect(toMinor(0, 2)).toBe(0);
    expect(toMinor(1e-7, 2)).toBe(0);
    expect(toMinor(-0.001, 2)).toBe(0);
    expect(toMinor(-2.345, 2)).toBe(-235);
  });

  it("refuses amounts too large to hold exactly", () => {
    expect(toMinor(1e13, 2)).toBe(MAX_MINOR);
    expect(toMinor(1e14, 2)).toBeNull();
    expect(toMinor(1e21, 2)).toBeNull();
    expect(toMinor(Number.NaN, 2)).toBeNull();
    expect(toMinor(Infinity, 2)).toBeNull();
  });
});

describe("calculateTax — add", () => {
  it("adds tax to a net price", () => {
    expect(calculateTax(10000, 20, "add")).toEqual({ net: 10000, tax: 2000, gross: 12000 });
    expect(calculateTax(10000, 18, "add")).toEqual({ net: 10000, tax: 1800, gross: 11800 });
  });

  it("handles fractional rates exactly", () => {
    // 10.05 × 5.5% = 0.55275 → 0.55; 100.50 × 8.1% = 8.1405 → 8.14
    expect(calculateTax(1005, 5.5, "add")).toEqual({ net: 1005, tax: 55, gross: 1060 });
    expect(calculateTax(10050, 8.1, "add")).toEqual({ net: 10050, tax: 814, gross: 10864 });
    expect(calculateTax(10000, 25.5, "add")?.tax).toBe(2550);
  });

  it("rounds half a minor unit up", () => {
    // 0.50 × 5% = 0.025 → 0.03
    expect(calculateTax(50, 5, "add")?.tax).toBe(3);
    // 0.10 × 5% = 0.005 → 0.01
    expect(calculateTax(10, 5, "add")?.tax).toBe(1);
  });

  it("works for zero-decimal currencies", () => {
    // ¥1,980 + 10% = ¥2,178
    expect(calculateTax(1980, 10, "add")).toEqual({ net: 1980, tax: 198, gross: 2178 });
  });

  it("is zero at a zero rate or a zero amount", () => {
    expect(calculateTax(10000, 0, "add")).toEqual({ net: 10000, tax: 0, gross: 10000 });
    expect(calculateTax(0, 20, "add")).toEqual({ net: 0, tax: 0, gross: 0 });
  });

  it("mirrors negative amounts (credit notes)", () => {
    expect(calculateTax(-50, 5, "add")).toEqual({ net: -50, tax: -3, gross: -53 });
  });
});

describe("calculateTax — remove", () => {
  it("uses gross ÷ (1 + rate), not gross × (1 − rate)", () => {
    // 120 incl. 20% VAT is 100 + 20 — not 120 − 24 = 96.
    expect(calculateTax(12000, 20, "remove")).toEqual({ net: 10000, tax: 2000, gross: 12000 });
    expect(calculateTax(11800, 18, "remove")).toEqual({ net: 10000, tax: 1800, gross: 11800 });
  });

  it("rounds the tax and derives the net, so they add up", () => {
    // 100 incl. 20%: VAT = 100 ÷ 6 = 16.666… → 16.67, net 83.33
    expect(calculateTax(10000, 20, "remove")).toEqual({ net: 8333, tax: 1667, gross: 10000 });
    // 99.99 incl. 7.7%: 7.1488… → 7.15
    expect(calculateTax(9999, 7.7, "remove")).toEqual({ net: 9284, tax: 715, gross: 9999 });
  });

  it("round-trips an add for common rates", () => {
    for (const rate of [2.6, 5, 7, 8.1, 9, 10, 13.5, 15, 18, 19, 20, 21, 23, 25.5, 27]) {
      for (const net of [1, 99, 1000, 123456, 99999999]) {
        const added = calculateTax(net, rate, "add")!;
        const removed = calculateTax(added.gross, rate, "remove")!;
        expect(removed.net + removed.tax).toBe(added.gross);
        expect(Math.abs(removed.net - net)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is exact at the largest supported amount", () => {
    const r = calculateTax(MAX_MINOR, 18, "remove")!;
    expect(r.net + r.tax).toBe(MAX_MINOR);
    expect(Number.isSafeInteger(r.tax)).toBe(true);
  });
});

describe("calculateTax — invalid input", () => {
  it("rejects rates outside 0–100%", () => {
    expect(calculateTax(10000, -1, "add")).toBeNull();
    expect(calculateTax(10000, 101, "remove")).toBeNull();
    expect(calculateTax(10000, Number.NaN, "add")).toBeNull();
  });

  it("rejects amounts that aren't whole minor units in range", () => {
    expect(calculateTax(10.5, 20, "add")).toBeNull();
    expect(calculateTax(MAX_MINOR + 1, 20, "add")).toBeNull();
  });

  it("accepts a 100% rate", () => {
    expect(calculateTax(10000, 100, "remove")).toEqual({ net: 5000, tax: 5000, gross: 10000 });
  });
});

describe("splitGst", () => {
  it("halves the GST into CGST and SGST", () => {
    expect(splitGst(1800)).toEqual({ cgst: 900, sgst: 900 });
  });

  it("gives an odd paisa to CGST so the halves add up", () => {
    expect(splitGst(1801)).toEqual({ cgst: 901, sgst: 900 });
    expect(splitGst(1)).toEqual({ cgst: 1, sgst: 0 });
    expect(splitGst(0)).toEqual({ cgst: 0, sgst: 0 });
  });

  it("mirrors negative amounts", () => {
    const { cgst, sgst } = splitGst(-1801);
    expect(cgst + sgst).toBe(-1801);
    expect(Math.abs(cgst - sgst)).toBe(1);
  });
});

describe("tax-rates data", () => {
  it("lists each country once, with a valid ISO code", () => {
    const codes = TAX_RATES.map((r) => r.country);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("keeps every rate between 0 and 100, reduced below standard and higher above it", () => {
    for (const r of TAX_RATES) {
      if (r.standard === null) {
        expect(r.reduced, r.name).toEqual([]);
        expect(r.note, r.name).toBeTruthy();
        continue;
      }
      expect(r.standard, r.name).toBeGreaterThan(0);
      expect(r.standard, r.name).toBeLessThanOrEqual(100);
      for (const low of r.reduced) {
        expect(low, r.name).toBeGreaterThanOrEqual(0);
        expect(low, r.name).toBeLessThan(r.standard);
      }
      expect([...r.reduced].sort((a, b) => b - a), r.name).toEqual(r.reduced);
      for (const high of r.higher ?? []) {
        expect(high, r.name).toBeGreaterThan(r.standard);
        expect(high, r.name).toBeLessThanOrEqual(100);
      }
    }
  });

  it("is sorted by name for the picker", () => {
    const names = TAX_RATES.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("carries a verification date", () => {
    expect(TAX_RATES_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(TAX_RATES_VERIFIED_ON))).toBe(false);
  });

  it("finds a country by code in any case", () => {
    expect(findTaxRate("gb")?.standard).toBe(20);
    expect(findTaxRate(" IN ")?.taxName).toBe("GST");
    expect(findTaxRate("custom")).toBeNull();
    expect(findTaxRate("")).toBeNull();
    expect(findTaxRate(null)).toBeNull();
  });

  it("has no national rate for the US, only a note", () => {
    const us = findTaxRate("US");
    expect(us?.standard).toBeNull();
    expect(us?.taxName).toBe("sales tax");
  });
});
