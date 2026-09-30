import { describe, expect, it } from "vitest";
import { freelanceRate, LIMITS, splitShares, WEEKS_PER_YEAR, type FreelanceInput } from "@/lib/tools/freelance-rate";

const BASE: FreelanceInput = {
  takeHome: 60_000,
  expenses: 6_000,
  taxPercent: 25,
  weeksOff: 6,
  hoursPerWeek: 25,
};

/** Relative closeness, for figures too large for a fixed number of decimals. */
function expectNear(actual: number, expected: number, rel = 1e-12) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-9);
}

describe("freelanceRate", () => {
  it("works the default plan through by hand", () => {
    const r = freelanceRate(BASE)!;
    // 60,000 ÷ 0.75 = 80,000 before tax, plus 6,000 of expenses.
    expect(r.revenue).toBeCloseTo(86_000, 9);
    expect(r.workingWeeks).toBe(46);
    expect(r.billableHours).toBe(1_150);
    expect(r.hourly).toBeCloseTo(86_000 / 1_150, 9); // 74.78
    expect(r.daily).toBeCloseTo((86_000 / 1_150) * 8, 9); // 598.26
    expect(r.monthly).toBeCloseTo(86_000 / 12, 9); // 7,166.67
    expect(r.hoursPerDay).toBe(8);
    expect(r.split).toEqual({ takeHome: 60_000, tax: 20_000, expenses: 6_000, margin: 0 });
  });

  it("matches take-home ÷ (1 − t) + expenses with no margin", () => {
    for (const t of [0, 10, 33.3, 50, 90]) {
      const r = freelanceRate({ ...BASE, taxPercent: t })!;
      expectNear(r.revenue, 60_000 / (1 - t / 100) + 6_000);
    }
  });

  it("adds up: take-home + tax + expenses + margin = revenue", () => {
    const cases: FreelanceInput[] = [
      BASE,
      { ...BASE, marginPercent: 15 },
      { ...BASE, taxPercent: 0, marginPercent: 0 },
      { ...BASE, taxPercent: 45, marginPercent: 20, expenses: 25_000 },
      { takeHome: 1e9, expenses: 3e8, taxPercent: 60, weeksOff: 10, hoursPerWeek: 30, marginPercent: 30 },
    ];
    for (const input of cases) {
      const r = freelanceRate(input)!;
      const { takeHome, tax, expenses, margin } = r.split;
      expectNear(takeHome + tax + expenses + margin, r.revenue);
      // Tax is charged on everything above expenses, margin included…
      expectNear(tax, (input.taxPercent / 100) * (r.revenue - input.expenses));
      // …and the margin is its share of revenue.
      expectNear(margin, ((input.marginPercent ?? 0) / 100) * r.revenue);
    }
  });

  it("solves a margin plan exactly", () => {
    const r = freelanceRate({ ...BASE, marginPercent: 10 })!;
    // (60,000 + 0.75 × 6,000) ÷ (1 − 0.25 − 0.10) = 64,500 ÷ 0.65
    expect(r.revenue).toBeCloseTo(64_500 / 0.65, 9); // 99,230.77
    expect(r.hourly).toBeCloseTo(64_500 / 0.65 / 1_150, 9); // 86.29
    expect(r.split.margin).toBeCloseTo(6_450 / 0.65, 9);
  });

  it("uses the working-day length for the day rate", () => {
    const r = freelanceRate({ ...BASE, hoursPerDay: 7.5 })!;
    expect(r.daily).toBeCloseTo(r.hourly * 7.5, 12);
    expect(r.hoursPerDay).toBe(7.5);
  });

  it("gives zero when there's nothing to pay for", () => {
    const r = freelanceRate({ ...BASE, takeHome: 0, expenses: 0 })!;
    expect(r.revenue).toBe(0);
    expect(r.hourly).toBe(0);
    expect(splitShares(r)).toEqual({ takeHome: 0, tax: 0, expenses: 0, margin: 0 });
  });

  it("covers expenses alone when take-home is zero — no tax on a break-even year", () => {
    const r = freelanceRate({ ...BASE, takeHome: 0 })!;
    expect(r.revenue).toBeCloseTo(6_000, 9);
    expect(r.split.tax).toBeCloseTo(0, 9);
  });

  it("works with every week but one off, and with a single hour a week", () => {
    const r = freelanceRate({ ...BASE, weeksOff: LIMITS.maxWeeksOff, hoursPerWeek: 1 })!;
    expect(r.workingWeeks).toBe(1);
    expect(r.billableHours).toBe(1);
    expect(r.hourly).toBeCloseTo(r.revenue, 9);
  });

  it("accepts part weeks and part hours", () => {
    const r = freelanceRate({ ...BASE, weeksOff: 5.5, hoursPerWeek: 22.5 })!;
    expect(r.billableHours).toBeCloseTo((WEEKS_PER_YEAR - 5.5) * 22.5, 12);
  });

  it("refuses plans no rate can pay for", () => {
    expect(freelanceRate({ ...BASE, taxPercent: 100 })).toBeNull();
    expect(freelanceRate({ ...BASE, taxPercent: 60, marginPercent: 40 })).toBeNull();
    expect(freelanceRate({ ...BASE, weeksOff: WEEKS_PER_YEAR })).toBeNull();
    expect(freelanceRate({ ...BASE, weeksOff: 60 })).toBeNull();
    expect(freelanceRate({ ...BASE, hoursPerWeek: 0 })).toBeNull();
    expect(freelanceRate({ ...BASE, hoursPerDay: 0 })).toBeNull();
  });

  it("refuses negative and non-finite inputs", () => {
    expect(freelanceRate({ ...BASE, takeHome: -1 })).toBeNull();
    expect(freelanceRate({ ...BASE, expenses: -1 })).toBeNull();
    expect(freelanceRate({ ...BASE, taxPercent: -5 })).toBeNull();
    expect(freelanceRate({ ...BASE, marginPercent: -5 })).toBeNull();
    expect(freelanceRate({ ...BASE, takeHome: Number.NaN })).toBeNull();
    expect(freelanceRate({ ...BASE, expenses: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("stays finite at the input limits", () => {
    const r = freelanceRate({
      takeHome: LIMITS.maxAmount,
      expenses: LIMITS.maxAmount,
      taxPercent: 49,
      marginPercent: 50,
      weeksOff: 0,
      hoursPerWeek: LIMITS.maxHoursPerWeek,
    })!;
    expect(Number.isFinite(r.hourly)).toBe(true);
    expect(Number.isFinite(r.revenue)).toBe(true);
  });
});

describe("splitShares", () => {
  it("gives each part's share of the revenue, adding to 100", () => {
    const shares = splitShares(freelanceRate({ ...BASE, marginPercent: 10 })!);
    expect(shares.margin).toBeCloseTo(10, 9);
    expect(shares.takeHome + shares.tax + shares.expenses + shares.margin).toBeCloseTo(100, 9);
  });

  it("matches the default plan", () => {
    const shares = splitShares(freelanceRate(BASE)!);
    expect(shares.takeHome).toBeCloseTo((60_000 / 86_000) * 100, 9); // 69.8%
    expect(shares.tax).toBeCloseTo((20_000 / 86_000) * 100, 9); // 23.3%
    expect(shares.expenses).toBeCloseTo((6_000 / 86_000) * 100, 9); // 7.0%
  });
});
