import { describe, expect, it } from "vitest";
import { billingPeriodEnum } from "@/db/schema";
import {
  BASE_CURRENCY,
  BILLING_SKUS,
  PERIOD_FREQUENCY,
  SUBSCRIPTION_TERM,
  parseDodoProducts,
  periodOfFrequency,
  planOfProduct,
  planSku,
  productBody,
  productSpecs,
  skuOfProduct,
  skuPlan,
  type DodoProducts,
} from "@/lib/billing-catalog";
import { DODO_HOSTS, parseBillingConfig } from "@/lib/billing-config";
import { TOPUP } from "@/lib/plans";
import { CURRENCIES, PERIODS, TRIAL_DAYS, priceMinor, topUpPriceMinor } from "@/lib/pricing";

const IDS: DodoProducts = {
  plus_monthly: "pdt_plus1",
  plus_quarterly: "pdt_plus3",
  plus_yearly: "pdt_plus12",
  pro_monthly: "pdt_pro1",
  pro_quarterly: "pdt_pro3",
  pro_yearly: "pdt_pro12",
  topup: "pdt_topup",
};

describe("productSpecs — what billing:products creates", () => {
  const specs = productSpecs();

  it("is the seven SKUs: Plus and Pro × 1/3/12 months, and the top-up", () => {
    expect(specs.map((s) => s.sku)).toEqual([...BILLING_SKUS]);
    expect(BILLING_SKUS).toHaveLength(7);
  });

  it("prices every product from pricing.ts, in rupees plus a localized price for every other currency", () => {
    const others = CURRENCIES.map((c) => c.code).filter((c) => c !== BASE_CURRENCY);
    for (const spec of specs) {
      expect(spec.base.currency).toBe("INR");
      expect(spec.localized.map((l) => l.currency)).toEqual(others);
      for (const price of [spec.base, ...spec.localized]) {
        const want =
          spec.sku === "topup"
            ? topUpPriceMinor(price.currency)
            : priceMinor(skuPlan(spec.sku).plan, skuPlan(spec.sku).period, price.currency);
        expect(price.amount).toBe(want);
        expect(Number.isInteger(price.amount) && price.amount > 0).toBe(true);
      }
    }
  });

  it("makes each plan a subscription with the 21-day trial that needs a payment method, SaaS tax, exclusive of tax", () => {
    for (const spec of specs.filter((s) => s.kind === "subscription")) {
      const body = productBody(spec) as { price: Record<string, unknown> } & Record<string, unknown>;
      expect(body.tax_category).toBe("saas");
      expect(body.pricing_mode).toBe("by_currency");
      expect(body.metadata).toEqual({ sku: spec.sku, app: "spendchat" });
      expect(body.price).toMatchObject({
        type: "recurring_price",
        currency: "INR",
        trial_period_days: TRIAL_DAYS,
        trial_payment_method_optional: false,
        tax_inclusive: false,
        subscription_period_count: SUBSCRIPTION_TERM.count,
        subscription_period_interval: SUBSCRIPTION_TERM.interval,
      });
    }
  });

  it("bills each period at its frequency, with a term longer than any frequency (or it ends after one cycle)", () => {
    for (const spec of specs) {
      if (spec.kind !== "subscription") continue;
      const price = (productBody(spec) as { price: Record<string, unknown> }).price;
      expect(price.payment_frequency_count).toBe(PERIOD_FREQUENCY[spec.period].count);
      expect(price.payment_frequency_interval).toBe(PERIOD_FREQUENCY[spec.period].interval);
    }
    const termMonths = SUBSCRIPTION_TERM.count * 12;
    for (const p of PERIODS) {
      const f = PERIOD_FREQUENCY[p];
      expect(termMonths).toBeGreaterThan(f.interval === "Year" ? f.count * 12 : f.count);
    }
  });

  it("makes the top-up a one-time product named for its actions", () => {
    const topup = specs.find((s) => s.sku === "topup")!;
    expect(topup.kind).toBe("one_time");
    expect(topup.name).toContain(TOPUP.actions.toLocaleString("en-US"));
    expect((productBody(topup) as { price: Record<string, unknown> }).price).toMatchObject({
      type: "one_time_price",
      pay_what_you_want: false,
      tax_inclusive: false,
    });
  });

  it("keeps the database's billing_period enum equal to the periods we sell", () => {
    expect([...billingPeriodEnum.enumValues]).toEqual([...PERIODS]);
  });
});

describe("product ids ↔ plans", () => {
  it("maps a product id back to its plan and period, and the top-up to neither", () => {
    expect(skuOfProduct(IDS, "pdt_pro12")).toBe("pro_yearly");
    expect(planOfProduct(IDS, "pdt_plus3")).toEqual({ plan: "plus", period: "quarterly" });
    expect(planOfProduct(IDS, "pdt_topup")).toBeNull();
    expect(planOfProduct(IDS, "pdt_stranger")).toBeNull();
    expect(skuOfProduct(IDS, null)).toBeNull();
    expect(planSku("pro", "monthly")).toBe("pro_monthly");
  });

  it("reads a provider frequency as one of our periods", () => {
    expect(periodOfFrequency(1, "Month")).toBe("monthly");
    expect(periodOfFrequency(3, "month")).toBe("quarterly");
    expect(periodOfFrequency(1, "Year")).toBe("yearly");
    expect(periodOfFrequency(12, "Month")).toBe("yearly");
    expect(periodOfFrequency(2, "Week")).toBeNull();
  });
});

describe("parseDodoProducts", () => {
  it("accepts every SKU with a distinct product id", () => {
    expect(parseDodoProducts(JSON.stringify(IDS))).toEqual({ ok: true, products: IDS });
  });

  it("refuses unset, broken JSON, a missing or malformed id, a repeated id, and unknown keys", () => {
    expect(parseDodoProducts(undefined).ok).toBe(false);
    expect(parseDodoProducts("{nope").ok).toBe(false);
    expect(parseDodoProducts("[]").ok).toBe(false);
    const { topup: _t, ...missing } = IDS;
    void _t;
    expect(parseDodoProducts(JSON.stringify(missing))).toMatchObject({ ok: false, error: expect.stringContaining("topup") });
    expect(parseDodoProducts(JSON.stringify({ ...IDS, pro_yearly: "prod_123" })).ok).toBe(false);
    expect(parseDodoProducts(JSON.stringify({ ...IDS, pro_yearly: IDS.plus_yearly }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("twice"),
    });
    expect(parseDodoProducts(JSON.stringify({ ...IDS, family: "pdt_x" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("family"),
    });
  });
});

describe("parseBillingConfig", () => {
  const good = {
    apiKey: "sk_test",
    webhookKey: "whsec_abc",
    environment: "test_mode",
    products: JSON.stringify(IDS),
  };

  it("picks the API host from the environment alone", () => {
    expect(parseBillingConfig(good)).toMatchObject({ ok: true, config: { baseUrl: DODO_HOSTS.test_mode } });
    expect(parseBillingConfig({ ...good, environment: "live_mode" })).toMatchObject({
      ok: true,
      config: { baseUrl: "https://live.dodopayments.com" },
    });
  });

  it("is unavailable when any value is missing or wrong — never half-configured", () => {
    expect(parseBillingConfig({ ...good, apiKey: "" }).ok).toBe(false);
    expect(parseBillingConfig({ ...good, webhookKey: undefined }).ok).toBe(false);
    expect(parseBillingConfig({ ...good, webhookKey: "not-a-whsec" }).ok).toBe(false);
    expect(parseBillingConfig({ ...good, environment: "sandbox" }).ok).toBe(false);
    expect(parseBillingConfig({ ...good, products: "{}" }).ok).toBe(false);
  });
});
