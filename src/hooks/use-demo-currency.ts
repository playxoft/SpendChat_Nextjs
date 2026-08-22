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
    locale: navigator.language || DEFAULT_LOCALE,
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
 * and default to 1, which keeps the seeded figures tidy.
 */
const USD_MULTIPLIER: Record<string, number> = {
  INR: 80, PKR: 280, BDT: 110, LKR: 300, NPR: 133,
  JPY: 150, KRW: 1300, TWD: 32, THB: 35, PHP: 56,
  IDR: 15000, VND: 24000, MMK: 2100, KHR: 4100,
  NGN: 1500, KES: 130, TZS: 2600, UGX: 3700, ETB: 120, EGP: 48, DZD: 134,
  XOF: 600, XAF: 600, RWF: 1300, MWK: 1700, MGA: 4500,
  RUB: 90, HUF: 360, KZT: 480, UZS: 12500, MNT: 3400, IQD: 1300,
  CLP: 950, COP: 4000, ARS: 900, PYG: 7300,
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
 */
export function demoAmount(usdMinor: number, format: DemoMoneyFormat): number {
  const multiplier = USD_MULTIPLIER[format.code] ?? 1;
  const decimals = format.currency.decimals;
  if (multiplier === 1 && decimals === 2) return usdMinor;

  const major = niceRound((usdMinor / 100) * multiplier);
  return Math.round(major * 10 ** decimals);
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
    useGrouping: false,
    minimumFractionDigits: format.currency.decimals,
    maximumFractionDigits: format.currency.decimals,
  }).format(major);
}
