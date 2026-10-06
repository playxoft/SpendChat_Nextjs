import { PLAN_LIMITS, TOPUP, planAtLeast, type PersonalPlan } from "@/lib/plans";
import {
  CURRENCIES,
  PAID_PERSONAL_PLANS,
  PERIODS,
  PERIOD_MONTHS,
  TRIAL_DAYS,
  currencyForCountry,
  isCurrency,
  periodDiscount,
  quote,
  topUpPrice,
  topUpPriceMinor,
  type Currency,
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";

/**
 * The one way into a purchase. Every paid CTA — the plan cards on `/pricing`
 * and `/app/upgrade`, the upgrade dialog, the AI top-up box — links to a path
 * built here, and the checkout page parses it back with the same rules. The
 * page then calls `startCheckout` (`services/billing.ts`), which prices the
 * order on the server and hands it to the payment provider
 * (`lib/payments.ts`). Pure and client-safe.
 *
 * The quotes below are what both the page (to show) and the service (to
 * charge) read, so the number on the button is the number sent to the
 * provider.
 */

export const CHECKOUT_PATH = "/app/upgrade/checkout";

export type PlanCheckout = {
  item: "plan";
  plan: PaidPersonalPlan;
  period: Period;
  /** The currency the buyer was looking at; the workspace's own when absent. */
  currency?: Currency;
};
export type TopUpCheckout = { item: "topup"; currency?: Currency };
export type CheckoutItem = PlanCheckout | TopUpCheckout;

/** Where a plan's buy button goes: `/app/upgrade/checkout?plan=pro&period=yearly`. */
export function checkoutPath({
  plan,
  period,
  currency,
}: {
  plan: PaidPersonalPlan;
  period: Period;
  currency?: Currency;
}): string {
  const params = new URLSearchParams({ plan, period });
  if (currency) params.set("currency", currency);
  return `${CHECKOUT_PATH}?${params.toString()}`;
}

/** Where the AI top-up's buy button goes: `/app/upgrade/checkout?item=topup`. */
export function topUpCheckoutPath({ currency }: { currency?: Currency } = {}): string {
  const params = new URLSearchParams({ item: "topup" });
  if (currency) params.set("currency", currency);
  return `${CHECKOUT_PATH}?${params.toString()}`;
}

export function isPaidPlanId(value: unknown): value is PaidPersonalPlan {
  return typeof value === "string" && (PAID_PERSONAL_PLANS as readonly string[]).includes(value);
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function first(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The checkout page's query, validated. A plan must be Plus or Pro and a
 * period one we bill (yearly when it's left out); anything else is `null`, and
 * the page sends the reader back to the plans. An unknown currency is dropped
 * rather than rejected — it only picks which price list to show, and the
 * workspace's own currency stands in.
 */
export function parseCheckoutParams(params: RawParams): CheckoutItem | null {
  const rawCurrency = first(params, "currency");
  const currency = rawCurrency && isCurrency(rawCurrency) ? rawCurrency : undefined;
  const withCurrency = <T extends object>(item: T) => (currency ? { ...item, currency } : item);

  if (first(params, "item") === "topup") return withCurrency({ item: "topup" as const });

  const plan = first(params, "plan");
  const period = first(params, "period") ?? "yearly";
  if (!isPaidPlanId(plan) || !isPeriod(period)) return null;
  return withCurrency({ item: "plan" as const, plan, period });
}

// ── Quotes ─────────────────────────────────────────────────────────────────

export type CheckoutQuote = {
  plan: PaidPersonalPlan;
  period: Period;
  currency: Currency;
  /** What each billing period costs, in the currency's minor units — what the provider is asked to charge. */
  amountMinor: number;
  /** The same, in major units, for display. */
  price: number;
  /** The per-month figure, truncated (`divide`). Display only. */
  perMonth: number;
  months: number;
  /** Saving against paying monthly, 0–1. */
  saving: number;
};

/**
 * The currency an order is charged in. The buyer's choice (or their
 * workspace's) is only a preference: the rupee list carries the regional
 * discount, so INR is allowed only when the request comes from a country
 * priced in rupees — judged by Cloudflare's `cf-ipcountry`, never by
 * `Accept-Language`, which the client writes. Anything else falls back to the
 * buyer's regional currency (USD when the country is unknown). Every other
 * currency is the global price, so it's theirs to pick. The payment provider
 * should pin the billing country as well (personal phase 9).
 */
export function checkoutCurrency(
  preferred: Currency | undefined,
  country: string | null | undefined,
): Currency {
  const regional = currencyForCountry(country);
  if (!preferred) return regional;
  if (preferred === "INR" && regional !== "INR") return regional;
  return preferred;
}

/**
 * The currencies checkout charges a request from `country` in, as is — every
 * global-price currency, and the rupee list only from a rupee country. The
 * in-app plans page offers only these, so its switcher can't show a price
 * that checkout would then change.
 */
export function checkoutCurrencies(country: string | null | undefined): Currency[] {
  return CURRENCIES.map((c) => c.code).filter((code) => checkoutCurrency(code, country) === code);
}

/** The price of one billing period of `plan`, from `pricing.ts` — never from the client. */
export function checkoutQuote(plan: PaidPersonalPlan, period: Period, currency: Currency): CheckoutQuote {
  const q = quote(plan, period, currency);
  return {
    plan,
    period,
    currency,
    amountMinor: q.priceMinor,
    price: q.price,
    perMonth: q.perMonth,
    months: PERIOD_MONTHS[period],
    saving: periodDiscount(plan, period, currency),
  };
}

export type TopUpQuote = {
  currency: Currency;
  amountMinor: number;
  price: number;
  actions: number;
  validityMonths: number;
};

/** One AI top-up (`TOPUP`), priced from `pricing.ts`. */
export function topUpQuote(currency: Currency): TopUpQuote {
  return {
    currency,
    amountMinor: topUpPriceMinor(currency),
    price: topUpPrice(currency),
    actions: TOPUP.actions,
    validityMonths: TOPUP.validityMonths,
  };
}

/**
 * Free-trial days on a plan bought from `currentPlan`: the full trial when the
 * workspace is moving up from Free, none on a paid → paid upgrade. The trial
 * is once per workspace; the provider's subscription record is what stops a
 * workspace that has had one from starting another.
 */
export function trialDaysFor(currentPlan: PersonalPlan): number {
  return currentPlan === "free" ? TRIAL_DAYS : 0;
}

export type CheckoutRefusal = "samePlan" | "downgrade" | "topUpNeedsPlan";

/**
 * Why a workspace on `currentPlan` can't buy `item`, or null when it can. A
 * plan must be above the current one (a downgrade happens at renewal, from
 * billing settings, never through checkout); a top-up needs a paid plan.
 */
export function checkoutRefusal(currentPlan: PersonalPlan, item: CheckoutItem): CheckoutRefusal | null {
  if (item.item === "topup") return PLAN_LIMITS[currentPlan].topUps ? null : "topUpNeedsPlan";
  if (item.plan === currentPlan) return "samePlan";
  if (planAtLeast(currentPlan, item.plan)) return "downgrade";
  return null;
}
