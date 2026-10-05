import { getCurrency } from "./currencies";
import { INVOICE_ADDON_PRICE, type PersonalPlan } from "./plans";

/**
 * The personal price list, in every currency we sell in. Pure and client-safe:
 * the pricing page renders from it, and checkout computes what to charge from
 * the same functions, so the price someone reads is the price they pay. What
 * each plan *includes* lives next door in `plans.ts`.
 *
 * **Amounts are integer minor units in each currency's own ISO 4217 exponent**
 * — paise, cents, pence, whole yen — the same convention as `amount_minor` and
 * `src/lib/money.ts`. So `priceMinor()` is what a payment provider is asked to
 * charge, as-is, and `formatMoney(priceMinor(…), currency)` prints it. The
 * major-unit helpers (`quote`, `topUpPrice`, `formatAmount`) are for display.
 *
 * Decisions (2026-10-05):
 * - Personal plans only — Free, Plus, Pro — and a plan belongs to a
 *   **workspace**, not a person. Family and the business plans are gone.
 * - Prices are set in rupees. The rupee is the regional price; every other
 *   currency is the global price, derived from the rupee list by taking the
 *   regional discount back off, converting, and charm-rounding (`fromRupees`).
 * - Six currencies: INR, USD, EUR, GBP, AUD, JPY. Pricing is set **per
 *   currency**, not per country: each currency is priced for the market that
 *   uses it. A visitor starts on the currency nearest their country (USD when
 *   none is close) and can switch.
 * - The regional discount is never stated on the page (2026-09-24): visitors
 *   see prices in their currency, nothing about how other currencies compare.
 *   `discount` stays here because the global prices are derived from it.
 * - Plus and Pro bill every 1, 3 or 12 months; the invoice add-on monthly or
 *   yearly; an AI top-up is a one-time purchase.
 * - Every paid plan starts with a 21-day trial; students get 60% off Plus and Pro.
 */

export type Period = "monthly" | "quarterly" | "yearly";
export type PaidPersonalPlan = Exclude<PersonalPlan, "free">;
export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AUD" | "JPY";
export type InvoiceAddonPeriod = keyof typeof INVOICE_ADDON_PRICE;

/** Shortest → longest; also the order the period selector shows them in. */
export const PERIODS: readonly Period[] = ["monthly", "quarterly", "yearly"];
export const PAID_PERSONAL_PLANS: readonly PaidPersonalPlan[] = ["plus", "pro"];

/** `isPaidPlan` (plans.ts) as a type guard, for indexing the price list. */
export function isPaidPersonalPlan(plan: PersonalPlan): plan is PaidPersonalPlan {
  return (PAID_PERSONAL_PLANS as readonly string[]).includes(plan);
}

export const STUDENT_DISCOUNT = 0.6;
export const TRIAL_DAYS = 21;

// ── Currencies ─────────────────────────────────────────────────────────────

export const CURRENCIES: {
  code: Currency;
  name: string;
  /** Below the global (USD) price, for the market this currency serves. */
  discount: number;
  /** Units per US dollar — converts the rupee list into this currency's prices. */
  perUsd: number;
}[] = [
  { code: "INR", name: "Indian rupee", discount: 0.62, perUsd: 88 },
  { code: "USD", name: "US dollar", discount: 0, perUsd: 1 },
  { code: "EUR", name: "Euro", discount: 0, perUsd: 0.92 },
  { code: "GBP", name: "British pound", discount: 0, perUsd: 0.79 },
  { code: "AUD", name: "Australian dollar", discount: 0, perUsd: 1.52 },
  { code: "JPY", name: "Japanese yen", discount: 0, perUsd: 147 },
];

const meta = (c: Currency) => CURRENCIES.find((x) => x.code === c)!;

/** Minor units per major unit: 100, or 1 for yen. */
const scale = (c: Currency) => 10 ** getCurrency(c).decimals;

export function isCurrency(code: string): code is Currency {
  return CURRENCIES.some((c) => c.code === code);
}

/** "₹", "$", "€", "£", "A$", "¥". */
export function currencySymbol(currency: Currency): string {
  if (currency === "AUD") return "A$";
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** Rounds a converted amount, in major units, onto a price someone would print. */
function charm(major: number, currency: Currency): number {
  if (currency === "JPY") return major >= 1000 ? Math.round(major / 100) * 100 : Math.round(major / 10) * 10;
  if (currency === "INR") return major >= 100 ? Math.round(major / 10) * 10 - 1 : Math.round(major);
  if (major < 30) return Math.max(0.99, Math.round(major) - 0.01);
  // $30 → $29, $120 → $119; anything not on a ten stays a whole number.
  const whole = Math.round(major);
  return whole % 10 === 0 ? whole - 1 : whole;
}

/**
 * A rupee price (paise) as the global price in `currency`, in that currency's
 * minor units: the rupee discount taken back off, converted, and charm-rounded
 * ($5.99, £4.99, ¥870). Euro reuses the dollar numerals — the norm for EU
 * software pricing. The charm-rounded figure has at most two decimals (none
 * for yen), so the final `Math.round` only removes float noise.
 */
function fromRupees(paise: number, currency: Currency): number {
  if (currency === "INR") return paise;
  const inr = meta("INR");
  const rate = (currency === "EUR" ? 1 : meta(currency).perUsd) / inr.perUsd;
  const global = (paise / scale("INR") / (1 - inr.discount)) * rate;
  return Math.round(charm(global, currency) * scale(currency));
}

// ── Price lists ────────────────────────────────────────────────────────────
// Set in rupees (paise) on 2026-10-05; every other currency is derived from them.

const RUPEES = {
  plans: {
    plus: { monthly: 19900, quarterly: 39900, yearly: 129900 },
    pro: { monthly: 29900, quarterly: 59900, yearly: 199900 },
  } satisfies Record<PaidPersonalPlan, Record<Period, number>>,
  /** One `TOPUP` (plans.ts) — paid plans only. */
  topUp: 19900,
  /** Per workspace, on any plan. */
  invoiceAddon: INVOICE_ADDON_PRICE,
};

type PriceList = {
  plans: Record<PaidPersonalPlan, Record<Period, number>>;
  topUp: number;
  invoiceAddon: Record<InvoiceAddonPeriod, number>;
};

function listFor(currency: Currency): PriceList {
  const conv = (paise: number) => fromRupees(paise, currency);
  const periods = (prices: Record<Period, number>) =>
    Object.fromEntries(PERIODS.map((p) => [p, conv(prices[p])])) as Record<Period, number>;
  return {
    plans: { plus: periods(RUPEES.plans.plus), pro: periods(RUPEES.plans.pro) },
    topUp: conv(RUPEES.topUp),
    invoiceAddon: {
      monthly: conv(RUPEES.invoiceAddon.monthly),
      yearly: conv(RUPEES.invoiceAddon.yearly),
    },
  };
}

const LISTS = Object.fromEntries(CURRENCIES.map((c) => [c.code, listFor(c.code)])) as Record<
  Currency,
  PriceList
>;

/** What one billing period of `plan` costs, in `currency`'s minor units. */
export function priceMinor(plan: PaidPersonalPlan, period: Period, currency: Currency): number {
  return LISTS[currency].plans[plan][period];
}

/** One AI top-up (`TOPUP` in plans.ts), in `currency`'s minor units. */
export function topUpPriceMinor(currency: Currency): number {
  return LISTS[currency].topUp;
}

/** The invoice add-on for one period, in `currency`'s minor units. */
export function invoiceAddonPriceMinor(period: InvoiceAddonPeriod, currency: Currency): number {
  return LISTS[currency].invoiceAddon[period];
}

/** Minor units → major units, for display. */
function toMajor(minor: number, currency: Currency): number {
  return minor / scale(currency);
}

export function topUpPrice(currency: Currency): number {
  return toMajor(topUpPriceMinor(currency), currency);
}

export function invoiceAddonPrice(period: InvoiceAddonPeriod, currency: Currency): number {
  return toMajor(invoiceAddonPriceMinor(period, currency), currency);
}

// ── Countries → nearest currency ───────────────────────────────────────────
// Only picks the starting currency; it doesn't change any price.

const COUNTRY_CURRENCY: Record<string, Currency> = {
  IN: "INR", NP: "INR", BT: "INR", BD: "INR", LK: "INR",
  GB: "GBP",
  AU: "AUD", NZ: "AUD",
  JP: "JPY",
  ...Object.fromEntries(
    "IE DE FR NL BE LU AT IT ES PT FI SE NO DK CH IS GR CY MT SK SI EE LV LT HR PL CZ HU RO BG TR"
      .split(" ")
      .map((c) => [c, "EUR" as Currency]),
  ),
};

export function currencyForCountry(country: string | null | undefined): Currency {
  return COUNTRY_CURRENCY[country?.toUpperCase() ?? ""] ?? "USD";
}

// ── Formatting ─────────────────────────────────────────────────────────────

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** What the sales tax added at checkout is called where this currency is used. */
export function taxName(currency: Currency): string {
  if (currency === "INR" || currency === "AUD") return "GST";
  if (currency === "EUR" || currency === "GBP") return "VAT";
  return "sales tax";
}

/** A major-unit amount for display: "₹1,299", "$5.99", "A$9", "¥870". */
export function formatAmount(major: number, currency: Currency): string {
  const whole = Number.isInteger(major) || currency === "JPY";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(major)
    .replace(/^\$/, currency === "AUD" ? "A$" : "$");
}

/**
 * `total / parts`, truncated — never rounded up, so a per-month figure never
 * adds up to more than what's charged. Rupees and yen drop to a whole unit
 * (₹1,299 over 12 months is ₹108). Other currencies keep their cents under 10,
 * where dropping them would misstate the price by a third ($8.99 / 3 is
 * $2.99, not $2). Display-only: nothing is ever charged per month of a longer
 * period.
 */
export function divide(total: number, parts: number, currency: Currency): number {
  if (parts === 1) return total;
  // Divide in integer hundredths: `Math.floor(exact * 100)` on a float in
  // major units loses a cent whenever the product lands just under a whole
  // number (0.87 / 3 → 0.29 * 100 = 28.999… → $0.28).
  const exactMinor = Math.round(total * 100) / parts;
  const cents = currency !== "INR" && currency !== "JPY" && exactMinor < 1000;
  return cents ? Math.floor(exactMinor) / 100 : Math.floor(exactMinor / 100);
}

// ── Periods & quotes ───────────────────────────────────────────────────────

export const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export const PERIOD_LABEL: Record<Period, { toggle: string; billed: string }> = {
  monthly: { toggle: "1 month", billed: "billed monthly" },
  quarterly: { toggle: "3 months", billed: "billed every 3 months" },
  yearly: { toggle: "1 year", billed: "billed yearly" },
};

/** Saving of `period` vs paying monthly, for one plan in this currency, 0–1. */
export function periodDiscount(plan: PaidPersonalPlan, period: Period, currency: Currency): number {
  if (period === "monthly") return 0;
  const base = priceMinor(plan, "monthly", currency);
  return 1 - priceMinor(plan, period, currency) / (base * PERIOD_MONTHS[period]);
}

export type Quote = {
  /** Charged each period, in minor units — exact. */
  priceMinor: number;
  /** Charged each period, in major units — for display. */
  price: number;
  /** The headline figure, truncated (`divide`). Display-only. */
  perMonth: number;
};

export function quote(plan: PaidPersonalPlan, period: Period, currency: Currency): Quote {
  const minor = priceMinor(plan, period, currency);
  const price = toMajor(minor, currency);
  return { priceMinor: minor, price, perMonth: divide(price, PERIOD_MONTHS[period], currency) };
}
