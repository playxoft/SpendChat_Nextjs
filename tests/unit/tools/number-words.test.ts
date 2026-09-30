import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@/lib/currencies";
import { CURRENCY_WORDS } from "@/lib/tools/data/currency-words";
import {
  MAX_AMOUNT_IN_WORDS,
  amountInWords,
  amountParts,
  applyLetterCase,
  checkWordsFraction,
  chequeWordsOnly,
  defaultNumberingSystem,
  formatGrouped,
  minorAmountInWords,
  numberToWords,
} from "@/lib/tools/number-words";

describe("numberToWords — international", () => {
  it("hyphenates tens and leaves 'and' out of the number", () => {
    expect(numberToWords(21, "international")).toBe("twenty-one");
    expect(numberToWords(120, "international")).toBe("one hundred twenty");
    expect(numberToWords(1010, "international")).toBe("one thousand ten");
  });

  it("names each thousands group", () => {
    expect(numberToWords(1_000_001, "international")).toBe("one million one");
    expect(numberToWords(2_500_000_000, "international")).toBe("two billion five hundred million");
  });

  it("writes zero and negatives", () => {
    expect(numberToWords(0, "international")).toBe("zero");
    expect(numberToWords(-5, "international")).toBe("minus five");
  });

  it("drops a fraction", () => {
    expect(numberToWords(7.9, "international")).toBe("seven");
  });
});

describe("numberToWords — indian", () => {
  it("groups by lakh and crore without hyphens", () => {
    expect(numberToWords(100_000, "indian")).toBe("one lakh");
    expect(numberToWords(120_000, "indian")).toBe("one lakh twenty thousand");
    expect(numberToWords(10_000_000, "indian")).toBe("one crore");
    expect(numberToWords(21, "indian")).toBe("twenty one");
  });

  it("counts crores in hundreds, thousands and lakhs past 99 crore", () => {
    expect(numberToWords(1_000_000_000, "indian")).toBe("one hundred crore");
    expect(numberToWords(1_000_000_000_000, "indian")).toBe("one lakh crore");
  });

  it("reaches the maximum and refuses beyond it", () => {
    expect(numberToWords(MAX_AMOUNT_IN_WORDS, "indian")).toMatch(/crore/);
    expect(() => numberToWords(MAX_AMOUNT_IN_WORDS + 1, "indian")).toThrow(RangeError);
    expect(() => numberToWords(Number.NaN, "indian")).toThrow(RangeError);
  });
});

describe("amountParts", () => {
  it("rounds half up on the digits as typed", () => {
    expect(amountParts(1.005, "USD")).toMatchObject({ major: 1, minor: 1, rounded: true });
    expect(amountParts(0.999, "USD")).toMatchObject({ major: 1, minor: 0 });
  });

  it("uses each currency's own decimals", () => {
    expect(amountParts(1500.7, "JPY")).toMatchObject({ major: 1501, minor: 0, decimals: 0 });
    expect(amountParts(2.5, "KWD")).toMatchObject({ major: 2, minor: 500, decimals: 3 });
  });

  it("drops the sign of an amount that rounds to zero", () => {
    expect(amountParts(-0.001, "USD").negative).toBe(false);
  });
});

describe("amountInWords", () => {
  it("writes rupees and paise the Indian way", () => {
    expect(amountInWords(120000.5, "INR", "indian")).toBe(
      "one lakh twenty thousand rupees and fifty paise",
    );
  });

  it("uses singular units for one", () => {
    expect(amountInWords(1, "INR", "indian")).toBe("one rupee");
    expect(amountInWords(1.01, "USD", "international")).toBe("one dollar and one cent");
  });

  it("writes cents alone rather than 'zero dollars and …'", () => {
    expect(amountInWords(0.05, "USD", "international")).toBe("five cents");
    expect(amountInWords(0, "USD", "international")).toBe("zero dollars");
  });

  it("gives zero-decimal currencies no minor part", () => {
    expect(amountInWords(1000, "JPY", "international")).toBe("one thousand yen");
  });

  it("writes negatives with 'minus'", () => {
    expect(amountInWords(-2, "EUR", "international")).toMatch(/^minus two/);
  });

  it("matches the minor-unit entry point invoices use", () => {
    expect(minorAmountInWords(12050, "USD", "international")).toBe(
      amountInWords(120.5, "USD", "international"),
    );
  });
});

describe("cheque lines", () => {
  it("puts the currency first and ends with 'only' for rupees", () => {
    const parts = amountParts(120000.5, "INR");
    expect(chequeWordsOnly(parts, "INR", "indian")).toBe(
      "rupees one lakh twenty thousand and fifty paise only",
    );
  });

  it("ends with 'only' after the units elsewhere", () => {
    expect(chequeWordsOnly(amountParts(40, "GBP"), "GBP", "international")).toMatch(/ only$/);
  });

  it("writes the US check fraction, including 00/100 on whole amounts", () => {
    expect(checkWordsFraction(amountParts(120.5, "USD"), "USD", "international")).toBe(
      "one hundred twenty and 50/100 dollars",
    );
    expect(checkWordsFraction(amountParts(7, "USD"), "USD", "international")).toBe(
      "seven and 00/100 dollars",
    );
  });

  it("has no cheque for a negative amount", () => {
    const parts = amountParts(-5, "USD");
    expect(chequeWordsOnly(parts, "USD", "international")).toBeNull();
    expect(checkWordsFraction(parts, "USD", "international")).toBeNull();
  });
});

describe("formatGrouped", () => {
  it("groups in threes, or threes then twos", () => {
    const parts = amountParts(12345678.9, "INR");
    expect(formatGrouped(parts, "indian")).toBe("1,23,45,678.90");
    expect(formatGrouped(parts, "international")).toBe("12,345,678.90");
  });
});

describe("applyLetterCase", () => {
  it("produces sentence, title and upper case", () => {
    const text = "twenty-one dollars and five cents";
    expect(applyLetterCase(text, "sentence")).toBe("Twenty-one dollars and five cents");
    expect(applyLetterCase(text, "title")).toBe("Twenty-One Dollars and Five Cents");
    expect(applyLetterCase(text, "upper")).toBe("TWENTY-ONE DOLLARS AND FIVE CENTS");
  });
});

describe("defaultNumberingSystem and coverage", () => {
  it("defaults South Asian currencies to lakh and crore", () => {
    expect(defaultNumberingSystem("INR")).toBe("indian");
    expect(defaultNumberingSystem("usd")).toBe("international");
  });

  it("has unit names for every supported currency", () => {
    for (const c of CURRENCIES) {
      expect(CURRENCY_WORDS[c.code], c.code).toBeDefined();
    }
  });
});
