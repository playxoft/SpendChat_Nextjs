import { describe, expect, it } from "vitest";
import {
  LIMITS,
  WEEKS_PER_MONTH,
  balanceAfter,
  cutSuggestion,
  depositFor,
  formatMonths,
  monthlyRate,
  monthsFrom,
  periodsToReach,
  periodsUntil,
  roundToOneFigure,
  savingsNeeded,
  weeklyRate,
  whenCanIAfford,
} from "@/lib/tools/savings-goal";

/** Month-by-month, written independently of the closed forms under test. */
function simulate(saved: number, deposit: number, i: number, n: number): number {
  let b = saved;
  for (let k = 0; k < n; k++) b = b * (1 + i) + deposit;
  return b;
}

describe("balanceAfter", () => {
  it("matches a month-by-month simulation", () => {
    for (const i of [0, 0.001, 0.05 / 12]) {
      for (const n of [0, 1, 12, 120]) {
        expect(balanceAfter(1000, 150, i, n)).toBeCloseTo(simulate(1000, 150, i, n), 6);
      }
    }
  });
});

describe("periodsToReach", () => {
  it("is (price − saved) ÷ deposit without interest", () => {
    expect(periodsToReach(2000, 350, 150, 0)).toBeCloseTo(11, 12);
  });

  it("inverts balanceAfter with interest", () => {
    const i = monthlyRate(6);
    const n = periodsToReach(10_000, 1000, 250, i)!;
    expect(balanceAfter(1000, 250, i, n)).toBeCloseTo(10_000, 6);
  });

  it("uses interest alone when nothing more goes in", () => {
    const i = monthlyRate(5);
    expect(periodsToReach(2000, 1000, 0, i)).toBeCloseTo(Math.log(2) / Math.log(1 + i), 9);
  });

  it("is 0 when you already have it and null when it never comes", () => {
    expect(periodsToReach(100, 100, 0, 0)).toBe(0);
    expect(periodsToReach(100, 50, 0, 0)).toBeNull();
    expect(periodsToReach(100, 0, 0, 0.01)).toBeNull();
  });
});

describe("whenCanIAfford", () => {
  it("counts whole months of saving", () => {
    const r = whenCanIAfford({ price: 2000, saved: 350, monthly: 150, ratePercent: 0 });
    expect(r).toMatchObject({ status: "ok", months: 11, balance: 2000, contributed: 2000, interest: 0 });
  });

  it("rounds a part-month up to the next deposit", () => {
    const r = whenCanIAfford({ price: 1000, saved: 0, monthly: 300, ratePercent: 0 });
    expect(r).toMatchObject({ status: "ok", months: 4, balance: 1200 });
  });

  it("doesn't let float noise add a month to an exact answer", () => {
    // 3 ÷ 0.1 is 29.999999999999996 in floats; 0.7 ÷ 0.1 is 6.999999999999999.
    expect(whenCanIAfford({ price: 3, saved: 0, monthly: 0.1, ratePercent: 0 })).toMatchObject({ months: 30 });
    expect(whenCanIAfford({ price: 0.7, saved: 0, monthly: 0.1, ratePercent: 0 })).toMatchObject({ months: 7 });
    expect(whenCanIAfford({ price: 1.1, saved: 0, monthly: 0.1, ratePercent: 0 })).toMatchObject({ months: 11 });
  });

  it("gets there sooner with interest, and the month before still falls short", () => {
    const input = { price: 10_000, saved: 1000, monthly: 250, ratePercent: 6 };
    const r = whenCanIAfford(input);
    if (r.status !== "ok") throw new Error(r.status);
    const i = monthlyRate(6);
    expect(r.months).toBeLessThan(36);
    expect(simulate(1000, 250, i, r.months)).toBeGreaterThanOrEqual(10_000);
    expect(simulate(1000, 250, i, r.months - 1)).toBeLessThan(10_000);
    expect(r.interest).toBeGreaterThan(0);
    expect(r.balance - r.contributed).toBeCloseTo(r.interest, 9);
  });

  it("says 'now' when the savings already cover it", () => {
    expect(whenCanIAfford({ price: 500, saved: 800, monthly: 0, ratePercent: 0 })).toEqual({
      status: "now",
      surplus: 300,
    });
    expect(whenCanIAfford({ price: 500, saved: 500, monthly: 10, ratePercent: 0 })).toEqual({
      status: "now",
      surplus: 0,
    });
  });

  it("says 'never' with nothing coming in", () => {
    expect(whenCanIAfford({ price: 500, saved: 100, monthly: 0, ratePercent: 0 })).toEqual({ status: "never" });
    expect(whenCanIAfford({ price: 500, saved: 0, monthly: 0, ratePercent: 5 })).toEqual({ status: "never" });
  });

  it("gives up past a hundred years", () => {
    expect(whenCanIAfford({ price: 1e12, saved: 0, monthly: 1, ratePercent: 0 })).toEqual({ status: "too-long" });
    const r = whenCanIAfford({ price: 1200, saved: 0, monthly: 1, ratePercent: 0 });
    expect(r).toMatchObject({ status: "ok", months: LIMITS.maxMonths });
  });

  it("grows a lump sum on interest alone", () => {
    const r = whenCanIAfford({ price: 2000, saved: 1000, monthly: 0, ratePercent: 5 });
    expect(r).toMatchObject({ status: "ok", months: 167 });
  });
});

describe("roundToOneFigure", () => {
  it("rounds to one significant figure", () => {
    expect(roundToOneFigure(3.46)).toBe(3);
    expect(roundToOneFigure(11.5)).toBe(10);
    expect(roundToOneFigure(46)).toBe(50);
    expect(roundToOneFigure(230.8)).toBe(200);
    expect(roundToOneFigure(0.346)).toBe(0.3);
    expect(roundToOneFigure(9.6)).toBe(10);
  });

  it("is 0 for nothing, negatives and non-numbers", () => {
    expect(roundToOneFigure(0)).toBe(0);
    expect(roundToOneFigure(-5)).toBe(0);
    expect(roundToOneFigure(Number.NaN)).toBe(0);
    expect(roundToOneFigure(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("cutSuggestion", () => {
  it("suggests a tenth of the weekly saving, rounded, and the weeks it saves", () => {
    // 150 a month is 34.62 a week; a tenth is 3.46 → 3. 1,650 ÷ 163 = 10.12
    // months instead of 11: 0.88 months, about 4 weeks.
    expect(cutSuggestion({ price: 2000, saved: 350, monthly: 150, ratePercent: 0 })).toEqual({
      weeklyCut: 3,
      weeksSooner: 4,
    });
  });

  it("measures the effect on the unrounded timeline, with interest", () => {
    const input = { price: 10_000, saved: 1000, monthly: 250, ratePercent: 6 };
    const s = cutSuggestion(input)!;
    expect(s.weeklyCut).toBe(6); // 250 ÷ 4.33 × 0.1 = 5.77 → 6
    const i = monthlyRate(6);
    const before = periodsToReach(10_000, 1000, 250, i)!;
    const after = periodsToReach(10_000, 1000, 250 + 6 * WEEKS_PER_MONTH, i)!;
    expect(s.weeksSooner).toBe(Math.round((before - after) * WEEKS_PER_MONTH));
  });

  it("is null when there's nothing to cut from, or it wouldn't save a week", () => {
    expect(cutSuggestion({ price: 2000, saved: 350, monthly: 0, ratePercent: 0 })).toBeNull();
    expect(cutSuggestion({ price: 500, saved: 800, monthly: 100, ratePercent: 0 })).toBeNull();
    // A month away: a tenth faster is under a week.
    expect(cutSuggestion({ price: 1000, saved: 0, monthly: 1000, ratePercent: 0 })).toBeNull();
  });

  it("won't suggest less than the currency's smallest unit", () => {
    expect(cutSuggestion({ price: 1000, saved: 0, monthly: 20, ratePercent: 0 }, 1)).toBeNull(); // 0.50 a week
    expect(cutSuggestion({ price: 1000, saved: 0, monthly: 20, ratePercent: 0 }, 0.01)).toMatchObject({ weeklyCut: 0.5 });
  });
});

describe("periodsUntil", () => {
  it("counts days, whole weeks and whole calendar months", () => {
    expect(periodsUntil("2026-09-30", "2027-09-30")).toEqual({ days: 365, weeks: 52, months: 12 });
    expect(periodsUntil("2026-01-31", "2026-02-28")).toEqual({ days: 28, weeks: 4, months: 0 });
    expect(periodsUntil("2026-01-31", "2026-03-01")).toEqual({ days: 29, weeks: 4, months: 1 });
    // Across a leap day.
    expect(periodsUntil("2028-02-01", "2028-03-01")).toEqual({ days: 29, weeks: 4, months: 1 });
  });

  it("is null for today, the past, or a bad date", () => {
    expect(periodsUntil("2026-09-30", "2026-09-30")).toBeNull();
    expect(periodsUntil("2026-09-30", "2026-01-01")).toBeNull();
    expect(periodsUntil("2026-09-30", "2026-02-30")).toBeNull();
  });
});

describe("depositFor", () => {
  it("is the gap ÷ periods without interest", () => {
    expect(depositFor(2000, 350, 0, 12)).toBeCloseTo(137.5, 12);
  });

  it("inverts balanceAfter with interest", () => {
    const i = monthlyRate(4);
    const d = depositFor(20_000, 2000, i, 36);
    expect(simulate(2000, d, i, 36)).toBeCloseTo(20_000, 6);
  });

  it("is 0 when the savings grow there on their own", () => {
    expect(depositFor(1000, 1000, 0, 12)).toBe(0);
    expect(depositFor(1010, 1000, monthlyRate(5), 12)).toBe(0);
  });

  it("rejects a non-positive number of periods", () => {
    expect(() => depositFor(1000, 0, 0, 0)).toThrow(RangeError);
  });
});

describe("savingsNeeded", () => {
  const year = periodsUntil("2026-09-30", "2027-09-30")!;

  it("splits the gap by months, weeks and days", () => {
    const r = savingsNeeded({ price: 2000, saved: 350, ratePercent: 0, periods: year });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.monthly).toBeCloseTo(137.5, 9);
    expect(r.weekly).toBeCloseTo(1650 / 52, 9);
    expect(r.daily).toBeCloseTo(1650 / 365, 9);
    expect(r.gap).toBe(1650);
    expect(r.interest).toBeCloseTo(0, 9);
    expect(r.grows).toBe(false);
  });

  it("needs less with interest, and counts what interest adds", () => {
    const r = savingsNeeded({ price: 2000, saved: 350, ratePercent: 5, periods: year });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.monthly!).toBeLessThan(137.5);
    expect(r.weekly!).toBeLessThan(1650 / 52);
    expect(350 + r.monthly! * 12 + r.interest).toBeCloseTo(2000, 6);
  });

  it("leaves monthly out when the date is under a month away", () => {
    const r = savingsNeeded({
      price: 1000,
      saved: 0,
      ratePercent: 0,
      periods: periodsUntil("2026-01-31", "2026-02-28")!,
    });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.monthly).toBeNull();
    expect(r.weekly).toBe(250);
    expect(r.daily).toBeCloseTo(1000 / 28, 9);
  });

  it("leaves weekly out too when it's under a week away", () => {
    const r = savingsNeeded({
      price: 1000,
      saved: 0,
      ratePercent: 0,
      periods: periodsUntil("2026-09-30", "2026-10-03")!,
    });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.monthly).toBeNull();
    expect(r.weekly).toBeNull();
    expect(r.daily).toBeCloseTo(1000 / 3, 9);
  });

  it("notices when interest on the savings covers the gap", () => {
    const r = savingsNeeded({ price: 1010, saved: 1000, ratePercent: 5, periods: year });
    expect(r).toMatchObject({ status: "ok", monthly: 0, grows: true });
  });

  it("says 'now' when you already have it", () => {
    expect(savingsNeeded({ price: 100, saved: 150, ratePercent: 0, periods: year })).toEqual({
      status: "now",
      surplus: 50,
    });
  });
});

describe("helpers", () => {
  it("compounds the weekly rate to the same year as the monthly one", () => {
    const i = monthlyRate(6);
    expect((1 + weeklyRate(i)) ** 52).toBeCloseTo((1 + i) ** 12, 12);
    expect(weeklyRate(0)).toBe(0);
  });

  it("moves a month on, across year ends", () => {
    expect(monthsFrom("2026-09-30", 11)).toBe("2027-08");
    expect(monthsFrom("2026-12-15", 1)).toBe("2027-01");
    expect(monthsFrom("2026-09-30", 0)).toBe("2026-09");
    expect(monthsFrom("2026-09-30", 1200)).toBe("2126-09");
    expect(monthsFrom("9999-06-01", 12)).toBeNull();
    expect(monthsFrom("nope", 1)).toBeNull();
  });

  it("formats whole months as years and months", () => {
    expect(formatMonths(1)).toBe("1 month");
    expect(formatMonths(11)).toBe("11 months");
    expect(formatMonths(12)).toBe("1 year");
    expect(formatMonths(27)).toBe("2 years, 3 months");
    expect(formatMonths(1200)).toBe("100 years");
  });
});
