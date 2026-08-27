import { describe, it, expect } from "vitest";
import {
  toMinorUnits,
  fromMinorUnits,
  formatMoney,
  signedMinor,
  minorToInputString,
} from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";

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

  it("keeps the locale's own numerals — it is a display formatter", () => {
    // The counterpart to `minorToInputString`'s Latin pin below: nobody reads
    // this string back, so an ar-EG user should see their own digits. Pinning
    // `latn` here would be the opposite mistake.
    const out = formatMoney(4000, "EGP", "ar-EG");
    expect(out).toContain("٤٠");
    expect(out).not.toMatch(/40/);
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

  it("uses the locale's decimal separator", () => {
    expect(minorToInputString(4000, "EUR", "de-DE")).toBe("40,00");
  });

  it("round-trips back through the parser it feeds", () => {
    // This is the whole point of the helper: the edit dialog prefills an amount
    // field with it and re-reads that field with `parseAmountInput` on submit.
    // The digit-system locales are the ones that broke — `ar-EG` rendered
    // "٤٠٫٠٠", which the parser rejects, so Save failed on every row until the
    // amount was retyped in ASCII. These are real `user_settings.locale`
    // values, set from `Accept-Language` at bootstrap.
    for (const locale of ["en-US", "de-DE", "fr-FR", "en-IN", "ar-EG", "bn-IN", "fa-IR", "mr-IN", "ne-NP"]) {
      for (const [minor, currency] of [
        [4000, "USD"],
        [125050, "USD"],
        [1500, "JPY"],
        [12345, "KWD"],
      ] as const) {
        const rendered = minorToInputString(minor, currency, locale);
        expect(
          parseAmountInput(rendered, locale),
          `${currency}/${locale} rendered ${minor} as "${rendered}"`,
        ).not.toBeNull();
        expect(toMinorUnits(rendered, currency, locale)).toBe(minor);
      }
    }
  });

  it("falls back to a plain ASCII string for an unusable locale tag", () => {
    expect(minorToInputString(4000, "USD", "en_US")).toBe("40.00");
  });
});
