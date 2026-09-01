import { describe, it, expect } from "vitest";
import { amountPlaceholder, formatAmountInput, integerDigitCount, localeSeparators, normalizeNumerals, parseAmountInput, stripNonAmountChars } from "@/lib/parse-amount";

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

  // These locales default to their own numeral system (١٢٣٤ / ১২৩৪ / ۱۲۳۴), which
  // the parser rejects — so an amount we *formatted* would come back null and
  // every programmatically-filled field (bulk preview, AI review grid) would sit
  // there permanently invalid. They're reachable: locale tags come from
  // Accept-Language, not from a curated list.
  it("uses Latin digits so non-Latin locales still round-trip", () => {
    for (const locale of ["ar-EG", "bn-IN", "fa-IR", "my-MM", "hi-IN"]) {
      const text = formatAmountInput(1234.5, locale);
      expect(text).toMatch(/^[\d.,\s  ]+$/);
      expect(parseAmountInput(text, locale)).toBe(1234.5);
    }
  });

  it("keeps the placeholder readable in those locales too", () => {
    for (const locale of ["ar-EG", "bn-IN", "fa-IR"]) {
      expect(amountPlaceholder(locale)).toMatch(/^0[.,]00$/);
    }
  });
});

/**
 * The other half of the `latn` pin in `money.ts`.
 *
 * That fix made what the app *writes* into an amount field re-readable. This is
 * what a person *types* on their own keyboard: without it an `ar-EG` user — the
 * exact case the pin exists for — could open Edit on a row, see a correct
 * "40.00", clear it, type "٤٠٫٠٠" and watch the field stay empty, with no error
 * and nothing saved.
 */
describe("amounts typed in the locale's own numerals", () => {
  it("reads Arabic-Indic, Bengali, Devanagari and Persian digits", () => {
    expect(parseAmountInput("٤٠٫٠٠", "ar-EG")).toBe(40);
    expect(parseAmountInput("৪০.০০", "bn-IN")).toBe(40);
    expect(parseAmountInput("४०.००", "hi-IN")).toBe(40);
    expect(parseAmountInput("۴۰٫۰۰", "fa-IR")).toBe(40);
  });

  it("maps the locale's own decimal and grouping separators", () => {
    // U+066B ARABIC DECIMAL SEPARATOR and U+066C ARABIC THOUSANDS SEPARATOR.
    expect(normalizeNumerals("٤٠٫٠٠", "ar-EG")).toBe("40.00");
    expect(parseAmountInput("١٬٢٥٠٫٥٠", "ar-EG")).toBe(1250.5);
  });

  it("keeps the input sanitiser from eating those keystrokes", () => {
    // The five amount fields ran `/[^\d.,\s]/g`, and JS `\d` is ASCII-only,
    // so every one of these collapsed to "" or "." as it was typed.
    expect(stripNonAmountChars("٤٠٫٠٠", "ar-EG")).toBe("٤٠٫٠٠");
    expect(stripNonAmountChars("৪০.০০", "bn-IN")).toBe("৪০.০০");
    expect(stripNonAmountChars("40.00", "en-US")).toBe("40.00");
    // Still strips what isn't part of an amount.
    expect(stripNonAmountChars("40abc.00", "en-US")).toBe("40.00");
  });

  it("leaves ASCII input exactly as it was", () => {
    expect(parseAmountInput("1,250.50", "en-US")).toBe(1250.5);
    expect(parseAmountInput("1.250,50", "de-DE")).toBe(1250.5);
    // Still ambiguous, still rejected — the normaliser must not loosen this.
    expect(parseAmountInput("1,50", "en-US")).toBeNull();
    expect(normalizeNumerals("1,250.50", "en-US")).toBe("1,250.50");
  });

  it("counts native digits against the whole-number cap", () => {
    expect(integerDigitCount("١٢٣٤", "ar-EG")).toBe(4);
    expect(integerDigitCount("٤٠٫٠٠", "ar-EG")).toBe(2);
  });
});

/**
 * Guard rails for the numeral normaliser, all of which caught something.
 *
 * The digit table is generated from `Intl.supportedValuesOf("numberingSystem")`,
 * so it is only as narrow as its filter — and the first version of that filter
 * was "one character long", which let `hanidec` in and turned the CJK word for
 * "one" into the number 1.
 */
describe("the numeral table stays a numeral table", () => {
  const LOCALES = [
    "en-US", "de-DE", "fr-FR", "es-ES", "pt-BR", "it-IT", "nl-NL", "pl-PL",
    "ru-RU", "tr-TR", "ar-EG", "ar-SA", "fa-IR", "ur-PK", "bn-IN", "bn-BD",
    "hi-IN", "mr-IN", "ne-NP", "ta-IN", "th-TH", "my-MM", "km-KH", "lo-LA",
    "zh-CN", "ja-JP", "ko-KR", "he-IL", "el-GR", "cs-CZ", "sv-SE", "fi-FI",
    "hu-HU", "ro-RO", "uk-UA", "vi-VN", "id-ID",
  ];

  it("parses back whatever each locale natively formats", () => {
    const broken: string[] = [];
    for (const locale of LOCALES) {
      const native = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1234.5);
      if (parseAmountInput(native, locale) !== 1234.5) {
        broken.push(`${locale}: "${native}"`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("never strips a character the parser would have accepted", () => {
    const broken: string[] = [];
    for (const locale of LOCALES) {
      const native = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(40);
      if (stripNonAmountChars(native, locale) !== native) {
        broken.push(`${locale}: strip ate "${native}"`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("does not read a CJK word as a number", () => {
    // `hanidec` renders 0-9 as 〇一二三…, which are also ordinary words. They
    // are not `\p{Nd}`, and the table requires that.
    expect(parseAmountInput("一", "zh-CN")).toBeNull();
    expect(parseAmountInput("三", "ja-JP")).toBeNull();
    expect(stripNonAmountChars("一二三", "zh-CN")).toBe("");
  });

  it("is stable across repeated calls", () => {
    // The compiled filter is cached per locale and carries the `g` flag, so a
    // stale `lastIndex` would make every other call return something different.
    for (let i = 0; i < 3; i++) {
      expect(stripNonAmountChars("1a2b3", "en-US")).toBe("123");
      expect(stripNonAmountChars("٤٠٫٠٠", "ar-EG")).toBe("٤٠٫٠٠");
    }
  });
});

