"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_CURRENCY, getCurrency, type Currency } from "@/lib/currencies";
import { currencyForCountry, regionFromLocale, DEFAULT_LOCALE } from "@/lib/geo";

/**
 * The currency and number format the marketing demos show, guessed from the
 * visitor's own browser.
 *
 * Someone in Chennai reading a page whose demo prices lunch at `$12.50` has to
 * do a small translation before the product feels like it's for them. Showing
 * `₹` costs nothing and removes that.
 *
 * **Why the browser and not the edge.** The app resolves this server-side from
 * Cloudflare's `cf-ipcountry` (`geo.server.ts`), which is more accurate — but
 * reading a request header opts the page out of static rendering, and every
 * marketing page has to stay static. So the same pure helpers from
 * `src/lib/geo.ts` are reused against `navigator.language` instead: the region
 * subtag of the browser's locale, maximized so a bare `hi` still resolves to
 * IN. It's a guess, and it's only decorating a demo.
 *
 * **Why `useSyncExternalStore`.** The server has no `navigator`, so the first
 * paint must be the default. Doing that with `useState` plus an effect either
 * trips the lint rule against `setState` in an effect body or renders a frame
 * of the wrong value; `getServerSnapshot` makes the hydration render agree with
 * the server by construction, and the real value lands immediately after.
 *
 * The snapshot is a cached object rather than one built per call — `getSnapshot`
 * runs on every render, and returning a fresh object each time would fail
 * React's referential check and loop forever.
 */

export type DemoMoneyFormat = {
  /** ISO 4217 code, e.g. `"INR"`. */
  code: string;
  /** The full currency record — symbol, decimals. */
  currency: Currency;
  /** BCP 47 tag, so grouping matches the region too (`1,00,000` for `en-IN`). */
  locale: string;
};

const SERVER_SNAPSHOT: DemoMoneyFormat = {
  code: DEFAULT_CURRENCY,
  currency: getCurrency(DEFAULT_CURRENCY),
  locale: DEFAULT_LOCALE,
};

let clientSnapshot: DemoMoneyFormat | null = null;

/**
 * `navigator.language`, but only if `Intl` will actually accept it.
 *
 * The browser normally reports a well-formed BCP 47 tag, yet the value is
 * ultimately OS/user-configurable and a malformed one — `"en_US"`, with the
 * underscore some systems still write — makes *every* `Intl` constructor built
 * from it throw `RangeError`. That single tag is handed to `formatMoney`,
 * `formatDateShort` and `demoAmountInput` alike, so one bad value would take
 * the whole marketing surface down at once rather than degrading to en-US.
 * Checking once, here, is cheaper and far easier to reason about than a
 * `try`/`catch` scattered through every caller.
 */
function usableLocale(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    new Intl.NumberFormat(tag);
    return tag;
  } catch {
    return null;
  }
}

function subscribe() {
  // The browser's locale doesn't change within a page view. Nothing to watch.
  return () => {};
}

function getSnapshot(): DemoMoneyFormat {
  if (clientSnapshot) return clientSnapshot;

  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  let code = DEFAULT_CURRENCY;
  for (const tag of tags) {
    const found = currencyForCountry(regionFromLocale(tag));
    if (found) {
      code = found;
      break;
    }
  }

  clientSnapshot = {
    code,
    currency: getCurrency(code),
    locale: usableLocale(navigator.language) ?? DEFAULT_LOCALE,
  };
  return clientSnapshot;
}

/** Currency + locale for the demos. `USD` / `en-US` during SSR and hydration. */
export function useDemoMoney(): DemoMoneyFormat {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

/**
 * Rough USD → local multipliers, used only to keep demo amounts *plausible*.
 *
 * A ₹40 weekly grocery shop reads as broken; ₹3,300 reads as real. These are
 * deliberately stale round numbers, never fetched, and never applied to
 * anything a user owns — the app itself does no conversion at all, and a
 * workspace's amounts are only ever stored in its own currency.
 *
 * Currencies whose price level is close enough to the dollar are simply absent
 * and default to 1, which keeps the seeded figures tidy. "Close enough" is a
 * rule, not a mood: **anything within roughly an order of magnitude of the
 * dollar is omitted, anything at 10× or more gets an entry.** Below that the
 * seeds still read as money (a CHF 4 coffee is fine); above it they stop being
 * money at all — a ₺3.60 lunch is nine US cents, and a 4 kr Icelandic coffee
 * reads exactly as broken as the ₹40 grocery shop this table exists to prevent.
 * Adding a currency to `CURRENCIES` therefore means checking it against that
 * rule here; the unit test enumerates the supported set so a new one can't
 * quietly land on the wrong side of it.
 *
 * A few codes below aren't supported currencies (`src/lib/currencies.ts`) and
 * so can never be looked up — they're kept because the table is maintained by
 * region and they cost nothing until the currency is added.
 */
const USD_MULTIPLIER: Record<string, number> = {
  INR: 80, PKR: 280, BDT: 110, LKR: 300, NPR: 133,
  JPY: 150, KRW: 1300, TWD: 32, THB: 35, PHP: 56,
  IDR: 15000, VND: 24000, MMK: 2100, KHR: 4100,
  NGN: 1500, KES: 130, TZS: 2600, UGX: 3700, ETB: 120, EGP: 48, DZD: 134,
  GHS: 15, MAD: 10, ZAR: 18,
  XOF: 600, XAF: 600, RWF: 1300, MWK: 1700, MGA: 4500,
  RUB: 90, HUF: 360, KZT: 480, UZS: 12500, MNT: 3400, IQD: 1300,
  // Europe past the 10× line. ISK is the one that mattered: it was the only
  // 0-decimal currency here without a multiplier, and 0 decimals is what turns
  // "a bit cheap" into "gone" — at multiplier 1 the smallest seed ($0.25)
  // rounded away to nothing at all.
  ISK: 140, SEK: 11, NOK: 11, CZK: 23, TRY: 40, UAH: 41,
  CLP: 950, COP: 4000, ARS: 900, PYG: 7300, MXN: 20, UYU: 40,
};

/** Round to something a person would plausibly have spent. */
function niceRound(value: number): number {
  if (value < 1) return Math.round(value * 100) / 100;
  if (value < 20) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1_000) return Math.round(value / 10) * 10;
  if (value < 10_000) return Math.round(value / 50) * 50;
  if (value < 100_000) return Math.round(value / 100) * 100;
  return Math.round(value / 1_000) * 1_000;
}

/**
 * Convert a seeded USD minor-unit amount into the visitor's currency.
 *
 * Returns the input untouched when no multiplier applies *and* the target has
 * the same two decimals, so the hand-picked figures (4.50, 12.50) survive
 * exactly for dollar-like currencies.
 *
 * A positive seed never comes back as 0. Zero is the one output that turns a
 * decorative guess into a visibly broken demo: `demoAmountInput` renders it as
 * "0", the composer marks the field `aria-invalid`, and the demos that don't
 * filter invalid rows write a `0 kr.` transaction into the feed. It only takes
 * a missing multiplier on a 0-decimal currency to get there —
 * `niceRound(0.25)` is 0.25, and 0.25 scaled by `10 ** 0` is 0 — so the floor
 * is enforced here rather than left to the table above being complete.
 */
export function demoAmount(usdMinor: number, format: DemoMoneyFormat): number {
  const multiplier = USD_MULTIPLIER[format.code] ?? 1;
  const decimals = format.currency.decimals;
  if (multiplier === 1 && decimals === 2) return usdMinor;

  const major = niceRound((usdMinor / 100) * multiplier);
  const minor = Math.round(major * 10 ** decimals);
  return usdMinor > 0 ? Math.max(minor, 1) : minor;
}

/**
 * A seeded amount rendered the way the visitor would *type* it — local decimal
 * separator, no grouping.
 *
 * The bulk-import demos paste a sample into the app's real parser, and that
 * parser reads separators from the locale: where the decimal mark is a comma,
 * fields are split on semicolons instead. A hard-coded `12.50, Lunch, …` sample
 * therefore fails every row for a large part of Europe — which would make the
 * one demo whose whole point is "you see exactly what would be saved" show
 * nothing but errors.
 */
export function demoAmountInput(usdMinor: number, format: DemoMoneyFormat): string {
  const minor = demoAmount(usdMinor, format);
  const major = minor / 10 ** format.currency.decimals;
  return new Intl.NumberFormat(format.locale, {
    // Latin digits, pinned for the same reason `src/lib/parse-amount.ts` pins
    // them: `ar-EG`, `bn-IN` and `fa-IR` default to their own numeral system,
    // and `parseAmountInput` only accepts ASCII 0-9. Left to the locale, this
    // would hand the demos an amount ("١٧٢٫٨٠") that the app's own parser
    // cannot read back — every row `aria-invalid`, every CTA disabled, in
    // exactly the demos this helper exists to make work.
    numberingSystem: "latn",
    useGrouping: false,
    minimumFractionDigits: format.currency.decimals,
    maximumFractionDigits: format.currency.decimals,
  }).format(major);
}
