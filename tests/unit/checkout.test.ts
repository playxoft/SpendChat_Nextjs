import { describe, it, expect } from "vitest";
import {
  CHECKOUT_PATH,
  checkoutPath,
  checkoutQuote,
  checkoutRefusal,
  parseCheckoutParams,
  topUpCheckoutPath,
  topUpQuote,
  trialDaysFor,
} from "@/lib/checkout";
import { TOPUP } from "@/lib/plans";
import { TRIAL_DAYS, periodDiscount, priceMinor, topUpPriceMinor } from "@/lib/pricing";
import { safeNextPath, withNext } from "@/lib/next-path";

describe("checkout paths", () => {
  it("builds the plan and top-up paths under the app", () => {
    expect(checkoutPath({ plan: "pro", period: "yearly" })).toBe(`${CHECKOUT_PATH}?plan=pro&period=yearly`);
    expect(checkoutPath({ plan: "plus", period: "quarterly", currency: "INR" })).toBe(
      `${CHECKOUT_PATH}?plan=plus&period=quarterly&currency=INR`,
    );
    expect(topUpCheckoutPath()).toBe(`${CHECKOUT_PATH}?item=topup`);
    expect(topUpCheckoutPath({ currency: "EUR" })).toBe(`${CHECKOUT_PATH}?item=topup&currency=EUR`);
  });

  it("survives the sign-up ?next= round trip", () => {
    const path = checkoutPath({ plan: "pro", period: "monthly", currency: "USD" });
    const href = withNext("/sign-up", path);
    const next = new URL(href, "https://example.com").searchParams.get("next");
    expect(safeNextPath(next)).toBe(path);
  });

  it("parses back what it builds", () => {
    const params = (path: string) => new URL(path, "https://example.com").searchParams;
    expect(parseCheckoutParams(params(checkoutPath({ plan: "plus", period: "monthly" })))).toEqual({
      item: "plan",
      plan: "plus",
      period: "monthly",
    });
    expect(parseCheckoutParams(params(checkoutPath({ plan: "pro", period: "yearly", currency: "GBP" })))).toEqual({
      item: "plan",
      plan: "pro",
      period: "yearly",
      currency: "GBP",
    });
    expect(parseCheckoutParams(params(topUpCheckoutPath({ currency: "JPY" })))).toEqual({
      item: "topup",
      currency: "JPY",
    });
  });

  it("accepts a page's searchParams object, taking the first of a repeated key", () => {
    expect(parseCheckoutParams({ plan: ["pro", "plus"], period: "quarterly" })).toEqual({
      item: "plan",
      plan: "pro",
      period: "quarterly",
    });
  });

  it("preselects yearly when no period is given", () => {
    expect(parseCheckoutParams({ plan: "plus" })).toEqual({ item: "plan", plan: "plus", period: "yearly" });
  });

  it("rejects a plan that isn't sold or a period we don't bill", () => {
    expect(parseCheckoutParams({})).toBeNull();
    expect(parseCheckoutParams({ plan: "free", period: "yearly" })).toBeNull();
    expect(parseCheckoutParams({ plan: "family", period: "yearly" })).toBeNull();
    expect(parseCheckoutParams({ plan: "pro", period: "weekly" })).toBeNull();
    expect(parseCheckoutParams({ plan: "PRO", period: "yearly" })).toBeNull();
  });

  it("drops an unknown currency instead of failing", () => {
    expect(parseCheckoutParams({ plan: "pro", period: "yearly", currency: "SGD" })).toEqual({
      item: "plan",
      plan: "pro",
      period: "yearly",
    });
  });
});

describe("checkoutQuote", () => {
  it("charges exactly the price list's minor units", () => {
    for (const plan of ["plus", "pro"] as const) {
      for (const period of ["monthly", "quarterly", "yearly"] as const) {
        for (const currency of ["INR", "USD", "JPY"] as const) {
          const q = checkoutQuote(plan, period, currency);
          expect(q.amountMinor).toBe(priceMinor(plan, period, currency));
          expect(Number.isInteger(q.amountMinor)).toBe(true);
          expect(q.saving).toBe(periodDiscount(plan, period, currency));
        }
      }
    }
  });

  it("prices Pro yearly in rupees at ₹1,999", () => {
    const q = checkoutQuote("pro", "yearly", "INR");
    expect(q.amountMinor).toBe(199900);
    expect(q.price).toBe(1999);
    expect(q.months).toBe(12);
    expect(q.perMonth * 12).toBeLessThanOrEqual(q.price);
  });

  it("prices a top-up from the price list", () => {
    const q = topUpQuote("INR");
    expect(q.amountMinor).toBe(topUpPriceMinor("INR"));
    expect(q.actions).toBe(TOPUP.actions);
    expect(q.validityMonths).toBe(TOPUP.validityMonths);
  });
});

describe("trial and refusals", () => {
  it("gives the trial only on the way up from Free", () => {
    expect(trialDaysFor("free")).toBe(TRIAL_DAYS);
    expect(trialDaysFor("plus")).toBe(0);
    expect(trialDaysFor("pro")).toBe(0);
  });

  it("sells only a plan above the current one, and top-ups only on a paid plan", () => {
    const plan = (p: "plus" | "pro") => ({ item: "plan" as const, plan: p, period: "yearly" as const });
    const topup = { item: "topup" as const };
    expect(checkoutRefusal("free", plan("plus"))).toBeNull();
    expect(checkoutRefusal("free", plan("pro"))).toBeNull();
    expect(checkoutRefusal("plus", plan("pro"))).toBeNull();
    expect(checkoutRefusal("plus", plan("plus"))).toBe("samePlan");
    expect(checkoutRefusal("pro", plan("plus"))).toBe("downgrade");
    expect(checkoutRefusal("free", topup)).toBe("topUpNeedsPlan");
    expect(checkoutRefusal("plus", topup)).toBeNull();
    expect(checkoutRefusal("pro", topup)).toBeNull();
  });
});

describe("checkoutCurrency", () => {
  it("allows the rupee list only for a rupee country, judged by the request's country", async () => {
    const { checkoutCurrency } = await import("@/lib/checkout");
    expect(checkoutCurrency("INR", "IN")).toBe("INR");
    expect(checkoutCurrency("INR", "NP")).toBe("INR");
    expect(checkoutCurrency("INR", "US")).toBe("USD");
    expect(checkoutCurrency("INR", "DE")).toBe("EUR");
    expect(checkoutCurrency("INR", null)).toBe("USD");
  });
  it("lets anyone pick a global-price currency, and defaults to the regional one", async () => {
    const { checkoutCurrency } = await import("@/lib/checkout");
    expect(checkoutCurrency("GBP", "IN")).toBe("GBP");
    expect(checkoutCurrency("JPY", "US")).toBe("JPY");
    expect(checkoutCurrency(undefined, "IN")).toBe("INR");
    expect(checkoutCurrency(undefined, "AU")).toBe("AUD");
    expect(checkoutCurrency(undefined, undefined)).toBe("USD");
  });
  it("lists only the currencies it would charge as is — the in-app switcher's options", async () => {
    const { checkoutCurrencies } = await import("@/lib/checkout");
    expect(checkoutCurrencies("IN")).toContain("INR");
    for (const country of ["US", "DE", null]) {
      const list = checkoutCurrencies(country);
      expect(list).not.toContain("INR");
      expect(list).toEqual(expect.arrayContaining(["USD", "EUR", "GBP", "AUD", "JPY"]));
    }
  });
});

