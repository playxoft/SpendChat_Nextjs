import { CURRENCIES, PERIODS, priceMinor, topUpPriceMinor } from "./pricing";
import type { Currency, PaidPersonalPlan, Period } from "./pricing";
import { PLAN_LIMITS, PLAN_NAMES, TOPUP } from "./plans";
import { siteConfig } from "./site";

/**
 * What we sell through the payment provider, derived from the price list
 * (`pricing.ts`) and the plan catalogue (`plans.ts`) — never typed in twice.
 * Pure and dependency-free (relative imports only), because two very different
 * things read it:
 *  - the server, to map a provider product id back to the plan and period it
 *    sells (`skuOfProduct`), and to pick the product a checkout opens;
 *  - `scripts/billing-products.mjs`, which creates or updates those products in
 *    the provider (`pnpm billing:products:dev|prod`) and prints the
 *    `DODO_PRODUCTS` value to paste into Doppler.
 *
 * Seven products: Plus and Pro × every 1, 3 and 12 months, and the one-time AI
 * top-up. Each is priced in rupees (the base currency) with a *localized price*
 * — our own number from `pricing.ts`, never an FX conversion — for every other
 * currency we sell in.
 *
 * Amounts are each currency's own minor units (`pricing.ts`), so yen are sent
 * as whole yen (JPY has no minor unit): ¥870 is `870`, not `87000`.
 * verify in test mode: a JPY localized price shows as ¥870 on checkout.
 *
 * **The products carry no trial (0 days).** The 21-day trial is granted per
 * checkout (`subscription_data.trial_period_days`) only when the buyer is
 * eligible (B1), so a checkout that forgot to say gets no trial — the rule
 * fails closed. The webhook also refuses a trial no checkout granted.
 */

export const PLAN_SKUS = [
  "plus_monthly",
  "plus_quarterly",
  "plus_yearly",
  "pro_monthly",
  "pro_quarterly",
  "pro_yearly",
] as const;
export type PlanSku = (typeof PLAN_SKUS)[number];
export const BILLING_SKUS = [...PLAN_SKUS, "topup"] as const;

/**
 * The provider brand our products are filed under, found by this name when
 * `pnpm billing:products:*` runs — the brand is whose name and logo checkout
 * and invoices show.
 */
export const BILLING_BRAND_NAME = siteConfig.name;

/**
 * `metadata.app` on every product and checkout of ours, and so on the
 * subscriptions and payments a checkout makes. One provider account can sell
 * for several brands, and its webhooks carry them all: this is how ours are
 * told apart (`services/billing-webhook.ts`).
 */
export const BILLING_APP = "spendchat";
export type BillingSku = (typeof BILLING_SKUS)[number];

/** The provider product id for each SKU — the `DODO_PRODUCTS` value. Ids differ per mode. */
export type DodoProducts = Record<BillingSku, string>;

/** The currency every product's base price is in; every other currency is a localized price. */
export const BASE_CURRENCY: Currency = "INR";

/**
 * How long a subscription may run. The provider ends a subscription whose
 * period equals its billing frequency after one cycle, so the period must be
 * longer than any frequency we bill (`dodo-reference.md` §3).
 */
export const SUBSCRIPTION_TERM = { count: 20, interval: "Year" } as const;

/** How often each period bills, in the provider's terms. */
export const PERIOD_FREQUENCY: Record<Period, { count: number; interval: "Month" | "Year" }> = {
  monthly: { count: 1, interval: "Month" },
  quarterly: { count: 3, interval: "Month" },
  yearly: { count: 1, interval: "Year" },
};

const PERIOD_WORDS: Record<Period, { name: string; billed: string }> = {
  monthly: { name: "1 month", billed: "every month" },
  quarterly: { name: "3 months", billed: "every 3 months" },
  yearly: { name: "1 year", billed: "every year" },
};

export function planSku(plan: PaidPersonalPlan, period: Period): PlanSku {
  return `${plan}_${period}` as PlanSku;
}

export function skuPlan(sku: PlanSku): { plan: PaidPersonalPlan; period: Period } {
  const [plan, period] = sku.split("_") as [PaidPersonalPlan, Period];
  return { plan, period };
}

/** The period a provider frequency bills at, or null when it isn't one we sell. */
export function periodOfFrequency(count: number, interval: string): Period | null {
  const unit = interval.toLowerCase();
  for (const p of PERIODS) {
    const f = PERIOD_FREQUENCY[p];
    if (f.count === count && f.interval.toLowerCase() === unit) return p;
  }
  // 12 months is a year, however the provider spells it.
  if (unit === "month" && count === 12) return "yearly";
  return null;
}

export type ProductPrice = { currency: Currency; amount: number };

export type ProductSpec = {
  sku: BillingSku;
  name: string;
  description: string;
  /** The base price, in `BASE_CURRENCY` minor units. */
  base: ProductPrice;
  /** One localized price per other currency we sell in. */
  localized: ProductPrice[];
} & (
  | { kind: "subscription"; period: Period; /** Always 0 — trials are per checkout (B1). */ trialDays: 0 }
  | { kind: "one_time" }
);

const n = (x: number) => x.toLocaleString("en-US");

function storageGb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
}

/** The provider prints the product name as the invoice line, so it says what was bought. */
export function productSpecs(): ProductSpec[] {
  const others = CURRENCIES.map((c) => c.code).filter((c) => c !== BASE_CURRENCY);
  const plans: ProductSpec[] = PLAN_SKUS.map((sku) => {
    const { plan, period } = skuPlan(sku);
    const l = PLAN_LIMITS[plan];
    return {
      sku,
      kind: "subscription",
      period,
      trialDays: 0,
      name: `${siteConfig.name} ${PLAN_NAMES[plan]} · ${PERIOD_WORDS[period].name}`,
      description: `${PLAN_NAMES[plan]} for one ${siteConfig.name} workspace, billed ${PERIOD_WORDS[period].billed}: ${n(l.members)} members, ${n(l.aiActionsPerMonth)} AI actions a month, ${storageGb(l.storageBytes)} of storage.`,
      base: { currency: BASE_CURRENCY, amount: priceMinor(plan, period, BASE_CURRENCY) },
      localized: others.map((currency) => ({ currency, amount: priceMinor(plan, period, currency) })),
    };
  });
  const topup: ProductSpec = {
    sku: "topup",
    kind: "one_time",
    name: `${siteConfig.name} AI top-up · ${n(TOPUP.actions)} actions`,
    description: `${n(TOPUP.actions)} AI actions for one ${siteConfig.name} workspace, used after its monthly allowance, valid ${TOPUP.validityMonths} months.`,
    base: { currency: BASE_CURRENCY, amount: topUpPriceMinor(BASE_CURRENCY) },
    localized: others.map((currency) => ({ currency, amount: topUpPriceMinor(currency) })),
  };
  return [...plans, topup];
}

/**
 * The provider's `POST /products` (and `PATCH`) body for a spec: tax category
 * SaaS, prices exclusive of tax (checkout adds it), localized by currency, and
 * — for a plan — **no trial** (the checkout grants it when the buyer is
 * eligible), with a payment method required whenever one is, so a trial can't
 * be started without a card or UPI mandate (abuse rule B1).
 */
export function productBody(spec: ProductSpec): Record<string, unknown> {
  const price =
    spec.kind === "subscription"
      ? {
          type: "recurring_price",
          currency: spec.base.currency,
          price: spec.base.amount,
          payment_frequency_count: PERIOD_FREQUENCY[spec.period].count,
          payment_frequency_interval: PERIOD_FREQUENCY[spec.period].interval,
          subscription_period_count: SUBSCRIPTION_TERM.count,
          subscription_period_interval: SUBSCRIPTION_TERM.interval,
          trial_period_days: spec.trialDays,
          trial_payment_method_optional: false,
          tax_inclusive: false,
          discount_bps: 0,
          purchasing_power_parity: false,
        }
      : {
          type: "one_time_price",
          currency: spec.base.currency,
          price: spec.base.amount,
          tax_inclusive: false,
          discount_bps: 0,
          pay_what_you_want: false,
          purchasing_power_parity: false,
        };
  return {
    name: spec.name,
    description: spec.description,
    tax_category: "saas",
    pricing_mode: "by_currency",
    metadata: { sku: spec.sku, app: BILLING_APP },
    price,
  };
}

/**
 * Parse `DODO_PRODUCTS`: a JSON object naming one provider product id for
 * every SKU, all different. Anything else is an error — a server with a
 * half-configured catalogue must refuse to sell rather than sell the wrong
 * thing.
 */
export function parseDodoProducts(
  raw: string | undefined | null,
): { ok: true; products: DodoProducts } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: false, error: "DODO_PRODUCTS is not set" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "DODO_PRODUCTS is not valid JSON" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "DODO_PRODUCTS must be a JSON object" };
  }
  const obj = value as Record<string, unknown>;
  const products = {} as DodoProducts;
  const seen = new Set<string>();
  for (const sku of BILLING_SKUS) {
    const id = obj[sku];
    if (typeof id !== "string" || !/^pdt_[A-Za-z0-9_-]+$/.test(id.trim())) {
      return { ok: false, error: `DODO_PRODUCTS.${sku} must be a product id ("pdt_…")` };
    }
    const trimmed = id.trim();
    if (seen.has(trimmed)) return { ok: false, error: `DODO_PRODUCTS lists ${trimmed} twice` };
    seen.add(trimmed);
    products[sku] = trimmed;
  }
  const extra = Object.keys(obj).filter((k) => !(BILLING_SKUS as readonly string[]).includes(k));
  if (extra.length > 0) return { ok: false, error: `DODO_PRODUCTS has unknown keys: ${extra.join(", ")}` };
  return { ok: true, products };
}

/** Which SKU a provider product id sells, or null when it isn't one of ours. */
export function skuOfProduct(products: DodoProducts, productId: string | null | undefined): BillingSku | null {
  if (!productId) return null;
  return BILLING_SKUS.find((sku) => products[sku] === productId) ?? null;
}

/** The plan and period a product id sells, or null for the top-up or a stranger. */
export function planOfProduct(
  products: DodoProducts,
  productId: string | null | undefined,
): { plan: PaidPersonalPlan; period: Period } | null {
  const sku = skuOfProduct(products, productId);
  return sku && sku !== "topup" ? skuPlan(sku) : null;
}
