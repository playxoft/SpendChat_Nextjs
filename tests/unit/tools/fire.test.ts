import { describe, expect, it } from "vitest";
import {
  FIRE_LIMITS,
  VARIANTS,
  coastNumber,
  coastPlan,
  durationLabel,
  fireNumber,
  firePlan,
  fireVariants,
  horizonMonths,
  monthAfter,
  monthlyRate,
  monthsToReach,
  simulatePath,
  spendingMultiple,
  type FireInput,
} from "@/lib/tools/fire";
import { simulateGrowth } from "@/lib/tools/growth";

const BASE: FireInput = {
  annualSpend: 40_000,
  withdrawalPercent: 4,
  invested: 100_000,
  monthlySaving: 2_500,
  returnPercent: 5,
  age: 30,
};

/** Months to grow P with deposits M (end of month) to F — the closed form, written independently. */
function closedFormMonths(p: number, m: number, i: number, f: number): number {
  if (i === 0) return Math.ceil((f - p) / m);
  return Math.ceil(Math.log((f * i + m) / (p * i + m)) / Math.log(1 + i));
}

describe("fireNumber", () => {
  it("is spending ÷ withdrawal rate — 25× at the 4% rule", () => {
    expect(fireNumber(40_000, 4)).toBeCloseTo(1_000_000, 6);
    expect(spendingMultiple(4)).toBe(25);
    expect(fireNumber(40_000, 3.5)).toBeCloseTo(1_142_857.142857, 4);
    expect(fireNumber(60_000, 5)).toBeCloseTo(1_200_000, 6);
    expect(fireNumber(0, 4)).toBe(0);
  });

  it("stays finite at the edges of the allowed inputs", () => {
    expect(Number.isFinite(fireNumber(FIRE_LIMITS.maxAmount, FIRE_LIMITS.minWithdrawal))).toBe(true);
    expect(fireNumber(FIRE_LIMITS.maxAmount, FIRE_LIMITS.minWithdrawal)).toBe(1e14);
  });
});

describe("monthlyRate", () => {
  it("compounds back to the yearly return", () => {
    for (const r of [5, 7, 0, -3, 30]) expect((1 + monthlyRate(r)) ** 12).toBeCloseTo(1 + r / 100, 12);
  });
});

describe("simulatePath", () => {
  it("starts with today's balance, then one row per year and a final part-year", () => {
    const rows = simulatePath({ initial: 1_000, monthly: 100, monthlyRate: 0.01, months: 30 });
    expect(rows.map((r) => r.months)).toEqual([0, 12, 24, 30]);
    expect(rows[0]).toEqual({ months: 0, contributed: 1_000, growth: 0, balance: 1_000 });
  });

  it("matches the shared growth simulation (end-of-month deposits)", () => {
    const i = monthlyRate(6);
    const rows = simulatePath({ initial: 5_000, monthly: 300, monthlyRate: i, months: 125 });
    const ref = simulateGrowth({ initial: 5_000, monthly: 300, monthlyRate: i, months: 125, timing: "end" });
    expect(rows.slice(1).map((r) => [r.months, r.contributed, r.balance])).toEqual(
      ref.rows.map((r) => [r.months, r.contributed, r.balance]),
    );
  });

  it("matches the closed form P(1+i)^n + M((1+i)^n − 1)/i", () => {
    const i = 0.004;
    const n = 240;
    const [, ...rows] = simulatePath({ initial: 20_000, monthly: 750, monthlyRate: i, months: n });
    const expected = 20_000 * (1 + i) ** n + (750 * ((1 + i) ** n - 1)) / i;
    expect(rows.at(-1)!.balance).toBeCloseTo(expected, 6);
  });

  it("stops saving after saveMonths and lets the balance coast", () => {
    const i = 0.005;
    const rows = simulatePath({ initial: 0, monthly: 100, monthlyRate: i, months: 48, saveMonths: 24 });
    const at24 = rows.find((r) => r.months === 24)!;
    const at48 = rows.at(-1)!;
    expect(at48.contributed).toBe(2_400);
    expect(at24.contributed).toBe(2_400);
    expect(at48.balance).toBeCloseTo(at24.balance * (1 + i) ** 24, 8);
  });

  it("has only today's row for a zero-month path", () => {
    expect(simulatePath({ initial: 10, monthly: 5, monthlyRate: 0.01, months: 0 })).toHaveLength(1);
  });
});

describe("monthsToReach", () => {
  it("agrees with the closed form across rates and savings", () => {
    for (const [p, m, r, f] of [
      [100_000, 2_500, 5, 1_000_000],
      [0, 1_000, 7, 500_000],
      [250_000, 500, 3, 800_000],
      [10_000, 4_000, 10, 2_000_000],
    ] as const) {
      const i = monthlyRate(r);
      expect(monthsToReach({ initial: p, monthly: m, monthlyRate: i, target: f, maxMonths: 1200 })).toBe(
        closedFormMonths(p, m, i, f),
      );
    }
  });

  it("counts plain saving at a zero return", () => {
    expect(monthsToReach({ initial: 0, monthly: 1_000, monthlyRate: 0, target: 120_000, maxMonths: 1200 })).toBe(120);
    expect(monthsToReach({ initial: 500, monthly: 1_000, monthlyRate: 0, target: 120_000, maxMonths: 1200 })).toBe(120);
  });

  it("is 0 when the target is already reached", () => {
    expect(monthsToReach({ initial: 1_000_000, monthly: 0, monthlyRate: 0, target: 1_000_000, maxMonths: 12 })).toBe(0);
  });

  it("is null when it never gets there", () => {
    // No saving and no growth.
    expect(monthsToReach({ initial: 10, monthly: 0, monthlyRate: 0, target: 100, maxMonths: 1200 })).toBeNull();
    // A falling market caps the balance at M ÷ −i = 100,000 — short of the target.
    expect(monthsToReach({ initial: 0, monthly: 500, monthlyRate: -0.005, target: 200_000, maxMonths: 1200 })).toBeNull();
    // Reachable, but not within the horizon.
    expect(monthsToReach({ initial: 0, monthly: 100, monthlyRate: 0, target: 100_000, maxMonths: 120 })).toBeNull();
  });
});

describe("firePlan", () => {
  it("works the page's example: $40k spend, $100k invested, $2,500 a month, 5% real, age 30", () => {
    const p = firePlan(BASE);
    expect(p.target).toBeCloseTo(1_000_000, 6);
    expect(p.progress).toBeCloseTo(10, 10);
    expect(p.months).toBe(201);
    expect(durationLabel(p.months!)).toBe("16 years 9 months");
    expect(p.fireAge).toBeCloseTo(46.75, 10);
    const last = p.path.at(-1)!;
    expect(last.months).toBe(201);
    expect(last.balance).toBeGreaterThanOrEqual(p.target);
    expect(last.contributed).toBe(100_000 + 201 * 2_500);
    // One month earlier it was still short.
    const before = simulatePath({ initial: 100_000, monthly: 2_500, monthlyRate: monthlyRate(5), months: 200 }).at(-1)!;
    expect(before.balance).toBeLessThan(p.target);
  });

  it("saving more gets there sooner", () => {
    expect(firePlan({ ...BASE, monthlySaving: 1_500 }).months).toBe(264);
    expect(firePlan({ ...BASE, monthlySaving: 3_000 }).months).toBe(180);
  });

  it("a lower withdrawal rate needs a bigger number and takes longer", () => {
    const p = firePlan({ ...BASE, withdrawalPercent: 3.5 });
    expect(p.target).toBeCloseTo(1_142_857.14, 1);
    expect(p.months).toBe(222);
  });

  it("is already there when invested ≥ the FIRE number", () => {
    const p = firePlan({ ...BASE, invested: 1_200_000 });
    expect(p.months).toBe(0);
    expect(p.fireAge).toBe(30);
    expect(p.progress).toBeCloseTo(120, 10);
    expect(p.path).toHaveLength(1);
  });

  it("gives up at the horizon age, with the path running to it", () => {
    const p = firePlan({ ...BASE, monthlySaving: 0, returnPercent: 0 });
    expect(p.months).toBeNull();
    expect(p.fireAge).toBeNull();
    expect(p.path.at(-1)!.months).toBe(horizonMonths(30));
    expect(horizonMonths(30)).toBe(840);
    expect(horizonMonths(FIRE_LIMITS.maxAge)).toBe(120);
    expect(horizonMonths(99.5)).toBe(12);
  });

  it("handles zero spending and huge values without NaN", () => {
    expect(firePlan({ ...BASE, annualSpend: 0 })).toMatchObject({ target: 0, months: 0, progress: 100 });
    const huge = firePlan({ ...BASE, annualSpend: FIRE_LIMITS.maxAmount, invested: FIRE_LIMITS.maxAmount, monthlySaving: FIRE_LIMITS.maxAmount });
    expect(Number.isFinite(huge.target)).toBe(true);
    expect(huge.months).not.toBeNull();
  });
});

describe("fireVariants", () => {
  it("scales the spending by 70%, 100% and 150%", () => {
    expect(VARIANTS.map((v) => v.factor)).toEqual([0.7, 1, 1.5]);
    const [lean, regular, fat] = fireVariants(BASE);
    expect(lean!.annualSpend).toBeCloseTo(28_000, 8);
    expect(lean!.plan.target).toBeCloseTo(700_000, 4);
    expect(lean!.plan.months).toBe(151);
    expect(regular!.plan.months).toBe(201);
    expect(fat!.annualSpend).toBe(60_000);
    expect(fat!.plan.target).toBeCloseTo(1_500_000, 4);
    expect(fat!.plan.months).toBe(268);
  });
});

describe("coastNumber / coastPlan", () => {
  it("is the FIRE number discounted to today at the real return", () => {
    const i = monthlyRate(5);
    expect(coastNumber(1_000_000, i, 360)).toBeCloseTo(1_000_000 / 1.05 ** 30, 4);
    expect(coastNumber(1_000_000, 0, 360)).toBe(1_000_000);
    // A negative real return needs more than the FIRE number today.
    expect(coastNumber(1_000_000, monthlyRate(-2), 120)).toBeGreaterThan(1_000_000);
  });

  it("works the page's example: not there yet, save five more years then stop", () => {
    const c = coastPlan({ ...BASE, retireAge: 60 });
    expect(c.coastNumber).toBeCloseTo(231_377.45, 1);
    expect(c.reached).toBe(false);
    expect(c.gap).toBeCloseTo(131_377.45, 1);
    expect(c.progress).toBeCloseTo(43.22, 2);
    expect(c.monthsToRetire).toBe(360);
    expect(c.saveMonths).toBe(60);
    expect(c.coastingNow).toBeCloseTo(100_000 * 1.05 ** 30, 4);
    expect(c.coastMonths).toBeNull();

    // The plan lands on the FIRE number by 60; stopping a month earlier doesn't.
    const i = monthlyRate(5);
    const onPlan = simulatePath({ initial: 100_000, monthly: 2_500, monthlyRate: i, months: 360, saveMonths: 60 }).at(-1)!;
    const early = simulatePath({ initial: 100_000, monthly: 2_500, monthlyRate: i, months: 360, saveMonths: 59 }).at(-1)!;
    expect(onPlan.balance).toBeGreaterThanOrEqual(c.target);
    expect(early.balance).toBeLessThan(c.target);
    expect(c.path.at(-1)!.balance).toBeCloseTo(onPlan.balance, 6);
  });

  it("says when you've already hit Coast FIRE, and when growth alone gets you there", () => {
    const c = coastPlan({ ...BASE, invested: 250_000, age: 35, retireAge: 65 });
    expect(c.reached).toBe(true);
    expect(c.saveMonths).toBe(0);
    expect(c.gap).toBe(0);
    expect(c.coastMonths).toBe(341);
    expect(c.coastingNow).toBeGreaterThan(c.target);
    // No saving on the path at all.
    expect(c.path.at(-1)!.contributed).toBe(250_000);
  });

  it("returns null saveMonths when saving the whole way still falls short", () => {
    const c = coastPlan({ ...BASE, invested: 0, monthlySaving: 100, retireAge: 40 });
    expect(c.saveMonths).toBeNull();
    expect(c.reached).toBe(false);
    expect(c.path.at(-1)!.contributed).toBe(120 * 100);
  });

  it("with no time left the Coast FIRE number is the FIRE number", () => {
    const c = coastPlan({ ...BASE, retireAge: 30 });
    expect(c.monthsToRetire).toBe(0);
    expect(c.coastNumber).toBeCloseTo(c.target, 8);
    expect(c.reached).toBe(false);
    expect(coastPlan({ ...BASE, invested: 1_000_000, retireAge: 30 }).reached).toBe(true);
  });

  it("counts an exact landing as reached", () => {
    const i = monthlyRate(5);
    const exact = coastNumber(1_000_000, i, 360);
    expect(coastPlan({ ...BASE, invested: exact, monthlySaving: 0, retireAge: 60 }).reached).toBe(true);
  });
});

describe("monthAfter", () => {
  it("adds months across year ends", () => {
    expect(monthAfter("2026-09-30", 0)).toEqual({ year: 2026, month: 9 });
    expect(monthAfter("2026-09-30", 3)).toEqual({ year: 2026, month: 12 });
    expect(monthAfter("2026-09-30", 4)).toEqual({ year: 2027, month: 1 });
    expect(monthAfter("2026-09-30", 201)).toEqual({ year: 2043, month: 6 });
    expect(monthAfter("2024-02-29", 12)).toEqual({ year: 2025, month: 2 });
  });
});

describe("durationLabel", () => {
  it("reads months as years and months", () => {
    expect(durationLabel(0)).toBe("0 months");
    expect(durationLabel(1)).toBe("1 month");
    expect(durationLabel(12)).toBe("1 year");
    expect(durationLabel(13)).toBe("1 year 1 month");
    expect(durationLabel(24)).toBe("2 years");
    expect(durationLabel(201)).toBe("16 years 9 months");
  });
});
