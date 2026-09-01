import { describe, it, expect } from "vitest";
import { demoAmount, demoAmountInput, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { CURRENCIES, getCurrency } from "@/lib/currencies";
import { COUNTRY_TO_CURRENCY, currencyForCountry } from "@/lib/geo";
import { parseAmountInput } from "@/lib/parse-amount";

/**
 * The marketing demos guess a visitor's currency from their browser and rescale
 * the seeded USD figures into it. Nothing here touches stored money — but a
 * demo that shows "0" or an amount the app's own parser rejects is worse than
 * one that shows dollars, so the two structural guarantees are pinned:
 *
 *  1. a positive seed never rescales to 0, for any currency we support;
 *  2. what `demoAmountInput` renders always reads back through
 *     `parseAmountInput`, which is the parser the demos actually feed.
 */

const format = (code: string, locale = "en-US"): DemoMoneyFormat => ({
  code,
  currency: getCurrency(code),
  locale,
});

/** The smallest seed any demo uses ($0.25, the chai in `entry-methods.tsx`). */
const SMALLEST_SEED = 25;

/** A spread of the real seeds, smallest first. */
const SEEDS = [1, SMALLEST_SEED, 360, 775, 1250, 4000, 6200, 200000];

describe("demoAmount", () => {
  it("leaves dollar-like currencies exactly as seeded", () => {
    // The hand-picked figures must survive untouched where no rescale applies.
    expect(demoAmount(1250, format("USD"))).toBe(1250);
    expect(demoAmount(1250, format("EUR"))).toBe(1250);
    expect(demoAmount(25, format("CHF"))).toBe(25);
  });

  it("rescales into a currency's own minor units", () => {
    expect(demoAmount(1250, format("INR"))).toBe(100_000); // ₹1,000 lunch
    expect(demoAmount(360, format("JPY"))).toBe(540); // 0-decimal: 540 yen
  });

  it("never rounds a positive seed down to 0, for any supported currency", () => {
    for (const currency of CURRENCIES) {
      for (const seed of SEEDS) {
        const minor = demoAmount(seed, format(currency.code));
        expect(
          minor,
          `${currency.code} rescaled seed ${seed} to ${minor}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("keeps 0 at 0, so the empty-amount placeholder stays empty", () => {
    // `entry-methods.tsx` renders `demoAmountInput(0, money)` as a placeholder.
    for (const currency of CURRENCIES) {
      expect(demoAmount(0, format(currency.code))).toBe(0);
    }
  });

  it("gives Iceland a plausible króna, not a 4 kr coffee", () => {
    // ISK is the only 0-decimal currency without an obvious multiplier, so at 1
    // the smallest seed collapsed to 0 and the whole seeded set read as play
    // money. Regression guard for both halves.
    const isk = format("ISK", "is-IS");
    expect(demoAmount(SMALLEST_SEED, isk)).toBeGreaterThan(0);
    expect(demoAmount(360, isk)).toBeGreaterThan(100); // a coffee, in krónur
    expect(demoAmount(200_000, isk)).toBeGreaterThan(100_000); // a salary
  });
});

describe("demoAmountInput", () => {
  // Locales that between them cover the traps: a comma decimal, Indian
  // grouping, and three that default to non-Latin digits the parser can't read.
  const LOCALES = ["en-US", "de-DE", "fr-FR", "en-IN", "ar-EG", "bn-IN", "fa-IR"];

  it("renders every supported currency so the app's own parser reads it back", () => {
    for (const currency of CURRENCIES) {
      for (const locale of LOCALES) {
        const money = format(currency.code, locale);
        for (const seed of SEEDS) {
          const rendered = demoAmountInput(seed, money);
          const parsed = parseAmountInput(rendered, locale);
          expect(
            parsed,
            `${currency.code}/${locale} rendered seed ${seed} as "${rendered}"`,
          ).not.toBeNull();
          expect(parsed).toBeCloseTo(
            demoAmount(seed, money) / 10 ** currency.decimals,
            6,
          );
        }
      }
    }
  });

  it("never renders a positive seed as a zero the composer would reject", () => {
    for (const currency of CURRENCIES) {
      const rendered = demoAmountInput(SMALLEST_SEED, format(currency.code));
      expect(parseAmountInput(rendered, "en-US")).toBeGreaterThan(0);
    }
  });

  it("uses the visitor's decimal separator, without grouping", () => {
    expect(demoAmountInput(1250, format("EUR", "de-DE"))).toBe("12,50");
    expect(demoAmountInput(200_000, format("USD", "en-US"))).toBe("2000.00");
  });

  it("pins Latin digits, because `parseAmountInput` only accepts ASCII 0-9", () => {
    expect(demoAmountInput(1250, format("EGP", "ar-EG"))).toMatch(/^[\d.,]+$/);
  });
});

describe("the currencies the demos can actually be asked for", () => {
  it("is exactly the supported set, so the loops above audit all of it", () => {
    // `demoAmount` only ever sees a code `currencyForCountry` produced. Pinning
    // that this equals `CURRENCIES` is what makes the "never 0" loops above an
    // audit rather than a spot check: a currency added to one list but not
    // reachable from the other would otherwise slip through untested.
    const reachable = new Set(
      Object.keys(COUNTRY_TO_CURRENCY)
        .map((country) => currencyForCountry(country))
        .filter((code): code is string => code !== null),
    );
    expect([...reachable].sort()).toEqual(CURRENCIES.map((c) => c.code).sort());
  });
});
