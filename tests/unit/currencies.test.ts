import { describe, it, expect } from "vitest";
import {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  getCurrency,
} from "@/lib/currencies";

describe("currency catalogue", () => {
  it("defaults to USD", () => {
    expect(DEFAULT_CURRENCY).toBe("USD");
  });

  it("derives CURRENCY_CODES from CURRENCIES", () => {
    expect(CURRENCY_CODES).toEqual(CURRENCIES.map((c) => c.code));
    expect(CURRENCY_CODES).toContain("USD");
    expect(CURRENCY_CODES).toContain("JPY");
  });

  it("every entry is well-formed with sane decimals", () => {
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.name).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect([0, 2, 3]).toContain(c.decimals);
    }
  });
});

describe("getCurrency", () => {
  it("returns the matching currency", () => {
    expect(getCurrency("USD").decimals).toBe(2);
    expect(getCurrency("JPY").decimals).toBe(0);
    expect(getCurrency("INR").symbol).toBe("₹");
  });

  it("round-trips every known code", () => {
    for (const code of CURRENCY_CODES) {
      expect(getCurrency(code).code).toBe(code);
    }
  });

  it("throws on an unknown code", () => {
    // Falling back to USD would scale JPY/KWD amounts with the wrong number of
    // decimals — a silent 100x/10x error in amount_minor. Fail loudly instead.
    expect(() => getCurrency("ZZZ")).toThrow("Unsupported currency code");
  });
});
