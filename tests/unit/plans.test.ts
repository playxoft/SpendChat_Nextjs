import { describe, it, expect } from "vitest";
import { fromMinorUnits } from "@/lib/money";
import {
  INVOICE_ADDON_PRICE,
  PERSONAL_PLANS,
  PLAN_LIMITS,
  voiceActionsFor,
  type PersonalPlan,
  type PlanLimits,
} from "@/lib/plans";
import {
  CURRENCIES,
  PAID_PERSONAL_PLANS,
  PERIODS,
  PERIOD_MONTHS,
  formatAmount,
  invoiceAddonPriceMinor,
  isPaidPersonalPlan,
  priceMinor,
  quote,
  topUpPrice,
  topUpPriceMinor,
  type Currency,
} from "@/lib/pricing";

const NUMERIC_KEYS = (Object.keys(PLAN_LIMITS.free) as (keyof PlanLimits)[]).filter(
  (k) => typeof PLAN_LIMITS.free[k] === "number",
);
const BOOLEAN_KEYS = (Object.keys(PLAN_LIMITS.free) as (keyof PlanLimits)[]).filter(
  (k) => typeof PLAN_LIMITS.free[k] === "boolean",
);

/** Every numeric limit, `budgets.max` included, by name. */
function numericLimits(plan: PersonalPlan): Record<string, number> {
  const limits = PLAN_LIMITS[plan];
  return {
    ...Object.fromEntries(NUMERIC_KEYS.map((k) => [k, limits[k] as number])),
    "budgets.max": limits.budgets.max,
  };
}

/** [lower, higher] for every pair of plans, cheapest first. */
const UPGRADES: [PersonalPlan, PersonalPlan][] = PERSONAL_PLANS.flatMap((lower, i) =>
  PERSONAL_PLANS.slice(i + 1).map((higher) => [lower, higher] as [PersonalPlan, PersonalPlan]),
);

describe("PLAN_LIMITS", () => {
  it("covers every limit the plans promise", () => {
    // Guards the derived key lists, so the checks below can't pass vacuously.
    expect(NUMERIC_KEYS).toEqual(
      expect.arrayContaining([
        "members",
        "spaces",
        "profilesPerSpace",
        "aiActionsPerMonth",
        "storageBytes",
        "categories",
        "tags",
      ]),
    );
    expect(BOOLEAN_KEYS).toEqual(
      expect.arrayContaining(["voice", "fileTrash", "profileLevelAccess", "topUps"]),
    );
  });

  it("never gives a paid plan a numeric limit below Free's", () => {
    const free = numericLimits("free");
    for (const plan of PERSONAL_PLANS.filter((p) => p !== "free")) {
      for (const [key, value] of Object.entries(numericLimits(plan))) {
        expect(value, `${plan}.${key}`).toBeGreaterThanOrEqual(free[key]);
      }
    }
  });

  it("never shrinks a numeric limit on an upgrade", () => {
    for (const [lower, higher] of UPGRADES) {
      const low = numericLimits(lower);
      for (const [key, value] of Object.entries(numericLimits(higher))) {
        expect(value, `${lower} → ${higher}: ${key}`).toBeGreaterThanOrEqual(low[key]);
      }
    }
  });

  it("never takes a feature away on an upgrade", () => {
    for (const [lower, higher] of UPGRADES) {
      for (const key of BOOLEAN_KEYS) {
        if (PLAN_LIMITS[lower][key]) {
          expect(PLAN_LIMITS[higher][key], `${lower} → ${higher}: ${key}`).toBe(true);
        }
      }
    }
  });
});

describe("voiceActionsFor", () => {
  it("charges one action per started minute, at least one, clamped to the clip cap", () => {
    expect(voiceActionsFor(0)).toBe(1);
    expect(voiceActionsFor(60_000)).toBe(1);
    expect(voiceActionsFor(60_001)).toBe(2);
    expect(voiceActionsFor(120_000)).toBe(2);
    expect(voiceActionsFor(500_000)).toBe(2);
  });
});

describe("voice", () => {
  it("is a Pro feature from day one — no grace period keeps it on Free or Plus", () => {
    expect(PERSONAL_PLANS.filter((p) => PLAN_LIMITS[p].voice)).toEqual(["pro"]);
  });
});

const CODES = CURRENCIES.map((c) => c.code);

describe("price list", () => {
  it("charges the agreed rupee prices", () => {
    expect(PERIODS.map((p) => priceMinor("plus", p, "INR"))).toEqual([19900, 39900, 129900]);
    expect(PERIODS.map((p) => priceMinor("pro", p, "INR"))).toEqual([29900, 59900, 199900]);
    expect(invoiceAddonPriceMinor("monthly", "INR")).toBe(INVOICE_ADDON_PRICE.monthly);
    expect(invoiceAddonPriceMinor("yearly", "INR")).toBe(INVOICE_ADDON_PRICE.yearly);
  });

  it("knows exactly which plans are paid", () => {
    expect(PERSONAL_PLANS.filter(isPaidPersonalPlan)).toEqual([...PAID_PERSONAL_PLANS]);
  });

  it.each(CODES)("in %s, a longer period always costs less per month", (currency) => {
    for (const plan of PAID_PERSONAL_PLANS) {
      // Exact per-month cost, not the truncated display figure.
      const [monthly, quarterly, yearly] = PERIODS.map(
        (p) => priceMinor(plan, p, currency) / PERIOD_MONTHS[p],
      );
      expect(yearly, `${plan} yearly vs 3 months`).toBeLessThan(quarterly);
      expect(quarterly, `${plan} 3 months vs monthly`).toBeLessThan(monthly);
    }
  });

  it.each(CODES)("in %s, every amount is a positive whole number of minor units", (currency) => {
    const amounts = [
      ...PAID_PERSONAL_PLANS.flatMap((plan) => PERIODS.map((p) => priceMinor(plan, p, currency))),
      topUpPriceMinor(currency),
      invoiceAddonPriceMinor("monthly", currency),
      invoiceAddonPriceMinor("yearly", currency),
    ];
    for (const minor of amounts) {
      expect(Number.isInteger(minor), String(minor)).toBe(true);
      expect(minor).toBeGreaterThan(0);
    }
  });

  it("prices a top-up at ₹199", () => {
    expect(topUpPriceMinor("INR")).toBe(19900);
    expect(topUpPrice("INR")).toBe(199);
    expect(formatAmount(topUpPrice("INR"), "INR")).toBe("₹199");
  });

  it("never shows a per-month figure above what's charged", () => {
    for (const currency of CODES) {
      for (const plan of PAID_PERSONAL_PLANS) {
        for (const period of PERIODS) {
          const q = quote(plan, period, currency);
          expect(q.perMonth * PERIOD_MONTHS[period]).toBeLessThanOrEqual(q.price + 1e-9);
        }
      }
    }
  });

  it("derives every currency from the rupee list the same way (review any change here)", () => {
    const show = (minorFor: (c: Currency) => number, c: Currency) =>
      formatAmount(fromMinorUnits(minorFor(c), c), c);
    const table = Object.fromEntries(
      CODES.map((c) => [
        c,
        {
          ...Object.fromEntries(
            PAID_PERSONAL_PLANS.map((plan) => [
              plan,
              PERIODS.map((p) => show((x) => priceMinor(plan, p, x), c)).join(" / "),
            ]),
          ),
          topUp: show(topUpPriceMinor, c),
          invoiceAddon: [
            show((x) => invoiceAddonPriceMinor("monthly", x), c),
            show((x) => invoiceAddonPriceMinor("yearly", x), c),
          ].join(" / "),
        },
      ]),
    );
    expect(table).toMatchInlineSnapshot(`
      {
        "AUD": {
          "invoiceAddon": "A$8.99 / A$45",
          "plus": "A$8.99 / A$17.99 / A$59",
          "pro": "A$13.99 / A$26.99 / A$91",
          "topUp": "A$8.99",
        },
        "EUR": {
          "invoiceAddon": "€5.99 / €29.99",
          "plus": "€5.99 / €11.99 / €39",
          "pro": "€8.99 / €17.99 / €59",
          "topUp": "€5.99",
        },
        "GBP": {
          "invoiceAddon": "£4.99 / £23.99",
          "plus": "£4.99 / £8.99 / £31",
          "pro": "£6.99 / £13.99 / £47",
          "topUp": "£4.99",
        },
        "INR": {
          "invoiceAddon": "₹199 / ₹999",
          "plus": "₹199 / ₹399 / ₹1,299",
          "pro": "₹299 / ₹599 / ₹1,999",
          "topUp": "₹199",
        },
        "JPY": {
          "invoiceAddon": "¥870 / ¥4,400",
          "plus": "¥870 / ¥1,800 / ¥5,700",
          "pro": "¥1,300 / ¥2,600 / ¥8,800",
          "topUp": "¥870",
        },
        "USD": {
          "invoiceAddon": "$5.99 / $29.99",
          "plus": "$5.99 / $11.99 / $39",
          "pro": "$8.99 / $17.99 / $59",
          "topUp": "$5.99",
        },
      }
    `);
  });
});
