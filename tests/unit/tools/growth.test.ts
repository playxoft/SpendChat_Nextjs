import { describe, expect, it } from "vitest";
import {
  amountRangeError,
  compoundInterest,
  effectiveMonthlyRate,
  formatYear,
  inTodaysMoney,
  PERIODS_PER_YEAR,
  readField,
  scheduleCsv,
  simulateGrowth,
  sipGrowth,
  yearsToMonths,
} from "@/lib/tools/growth";

// Closed forms, written out independently of the simulation they check.
const lumpSum = (p: number, i: number, n: number) => p * (1 + i) ** n;
const annuityEnd = (d: number, i: number, n: number) => (i === 0 ? d * n : (d * ((1 + i) ** n - 1)) / i);
const annuityStart = (d: number, i: number, n: number) => annuityEnd(d, i, n) * (1 + i);

/** Relative closeness, for balances too large for a fixed number of decimals. */
function expectNear(actual: number, expected: number, rel = 1e-9) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-9);
}

describe("effectiveMonthlyRate", () => {
  it("is annual ÷ 12 for monthly compounding", () => {
    expect(effectiveMonthlyRate(0.12, 12)).toBeCloseTo(0.01, 12);
  });

  it("compounds back to the quoted effective annual rate", () => {
    for (const n of Object.values(PERIODS_PER_YEAR)) {
      const monthly = effectiveMonthlyRate(0.08, n);
      expect((1 + monthly) ** 12).toBeCloseTo((1 + 0.08 / n) ** n, 12);
    }
  });

  it("is zero at a zero rate, negative at a negative one", () => {
    expect(effectiveMonthlyRate(0, 4)).toBe(0);
    expect(effectiveMonthlyRate(-0.1, 12)).toBeLessThan(0);
  });
});

describe("compoundInterest", () => {
  it("matches P(1 + r/n)^(nt) for a lump sum, at every frequency", () => {
    for (const [name, n] of Object.entries(PERIODS_PER_YEAR)) {
      const r = compoundInterest({
        principal: 10_000,
        monthly: 0,
        ratePercent: 7,
        years: 10,
        compounding: name as keyof typeof PERIODS_PER_YEAR,
      });
      expect(r.balance).toBeCloseTo(10_000 * (1 + 0.07 / n) ** (n * 10), 6);
      expect(r.contributed).toBe(10_000);
    }
  });

  it("matches the closed form with end-of-month deposits", () => {
    const r = compoundInterest({
      principal: 10_000,
      monthly: 200,
      ratePercent: 7,
      years: 10,
      compounding: "monthly",
    });
    const i = 0.07 / 12;
    expect(r.balance).toBeCloseTo(lumpSum(10_000, i, 120) + annuityEnd(200, i, 120), 6);
    expect(r.contributed).toBe(10_000 + 200 * 120);
    expect(r.interest).toBeCloseTo(r.balance - r.contributed, 9);
  });

  it("matches the closed form with start-of-month deposits and quarterly compounding", () => {
    const r = compoundInterest({
      principal: 5_000,
      monthly: 150,
      ratePercent: 6,
      years: 15,
      compounding: "quarterly",
      timing: "start",
    });
    const i = effectiveMonthlyRate(0.06, 4);
    expect(r.balance).toBeCloseTo(lumpSum(5_000, i, 180) + annuityStart(150, i, 180), 6);
  });

  it("start-of-month deposits earn one extra month each", () => {
    const base = { principal: 0, monthly: 100, ratePercent: 5, years: 5, compounding: "monthly" as const };
    const end = compoundInterest({ ...base, timing: "end" });
    const start = compoundInterest({ ...base, timing: "start" });
    expect(start.balance).toBeCloseTo(end.balance * (1 + 0.05 / 12), 9);
  });

  it("daily compounding beats yearly, but not by much", () => {
    const base = { principal: 10_000, monthly: 0, ratePercent: 7, years: 10 };
    const daily = compoundInterest({ ...base, compounding: "daily" }).balance;
    const yearly = compoundInterest({ ...base, compounding: "yearly" }).balance;
    expect(daily).toBeGreaterThan(yearly);
    expect(daily / yearly - 1).toBeLessThan(0.03);
  });

  it("at a zero rate, the balance is just what went in", () => {
    const r = compoundInterest({
      principal: 1_000,
      monthly: 50,
      ratePercent: 0,
      years: 3,
      compounding: "daily",
    });
    expect(r.balance).toBe(1_000 + 50 * 36);
    expect(r.interest).toBe(0);
  });

  it("with nothing invested, nothing grows", () => {
    const r = compoundInterest({ principal: 0, monthly: 0, ratePercent: 9, years: 20, compounding: "monthly" });
    expect(r.balance).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.rows).toHaveLength(20);
  });

  it("loses money at a negative rate", () => {
    const r = compoundInterest({ principal: 1_000, monthly: 0, ratePercent: -10, years: 1, compounding: "yearly" });
    expect(r.balance).toBeCloseTo(900, 9);
    expect(r.interest).toBeCloseTo(-100, 9);
  });

  it("stays finite at the input limits (100% for 100 years, compounded daily)", () => {
    const r = compoundInterest({
      principal: 1e12,
      monthly: 1e12,
      ratePercent: 100,
      years: 100,
      compounding: "daily",
    });
    expect(Number.isFinite(r.balance)).toBe(true);
    expect(r.rows).toHaveLength(100);
  });

  it("deflates the final balance by inflation", () => {
    const r = compoundInterest({
      principal: 10_000,
      monthly: 0,
      ratePercent: 7,
      years: 10,
      compounding: "yearly",
      inflationPercent: 3,
    });
    expect(r.real).toBeCloseTo(r.balance / 1.03 ** 10, 6);
    expect(r.rows.at(-1)!.real).toBeCloseTo(r.real!, 9);
    expect(compoundInterest({ principal: 1, monthly: 0, ratePercent: 1, years: 1, compounding: "yearly" }).real).toBeNull();
  });
});

describe("the year-by-year schedule", () => {
  it("has one row per year, ending on the final balance", () => {
    const r = compoundInterest({ principal: 1_000, monthly: 100, ratePercent: 5, years: 10, compounding: "monthly" });
    expect(r.rows.map((row) => row.year)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const last = r.rows.at(-1)!;
    expect(last.balance).toBe(r.balance);
    expect(last.contributed).toBe(r.contributed);
    expect(r.rows[0]!.contributed).toBe(1_000 + 1_200);
  });

  it("matches the closed form at every year-end", () => {
    const r = compoundInterest({ principal: 2_000, monthly: 75, ratePercent: 8, years: 5, compounding: "monthly" });
    const i = 0.08 / 12;
    r.rows.forEach((row) => {
      expect(row.balance).toBeCloseTo(lumpSum(2_000, i, row.months) + annuityEnd(75, i, row.months), 6);
      expect(row.interest).toBeCloseTo(row.balance - row.contributed, 9);
    });
  });

  it("adds a final row for a part-year", () => {
    const r = compoundInterest({ principal: 100, monthly: 10, ratePercent: 5, years: 2.5, compounding: "monthly" });
    expect(r.months).toBe(30);
    expect(r.rows.map((row) => row.months)).toEqual([12, 24, 30]);
    expect(r.rows.at(-1)!.year).toBe(2.5);
  });
});

describe("sipGrowth", () => {
  it("matches P × ((1 + i)^n − 1) ÷ i × (1 + i) — ₹5,000 a month, 12%, 10 years", () => {
    const r = sipGrowth({ monthly: 5_000, returnPercent: 12, years: 10 });
    expect(r.balance).toBeCloseTo(annuityStart(5_000, 0.01, 120), 6);
    // What Indian SIP calculators show for the same inputs.
    expect(Math.round(r.balance)).toBe(1_161_695);
    expect(r.contributed).toBe(600_000);
    expect(r.interest).toBeCloseTo(r.balance - 600_000, 9);
  });

  it("handles a single month", () => {
    const r = sipGrowth({ monthly: 1_000, returnPercent: 12, years: 1 / 12 });
    expect(r.months).toBe(1);
    expect(r.balance).toBeCloseTo(1_010, 9);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.year).toBeCloseTo(1 / 12, 12);
  });

  it("stays on the closed form over 50 years", () => {
    const r = sipGrowth({ monthly: 10_000, returnPercent: 11, years: 50 });
    expectNear(r.balance, annuityStart(10_000, 0.11 / 12, 600));
    expect(r.rows).toHaveLength(50);
  });

  it("at a zero return, the value is what you invested", () => {
    const r = sipGrowth({ monthly: 2_500, returnPercent: 0, years: 4 });
    expect(r.balance).toBe(2_500 * 48);
    expect(r.interest).toBe(0);
  });

  it("with a zero instalment, nothing grows", () => {
    const r = sipGrowth({ monthly: 0, returnPercent: 12, years: 5 });
    expect(r.balance).toBe(0);
  });

  it("steps the instalment up once every 12 months", () => {
    const r = sipGrowth({ monthly: 1_000, returnPercent: 0, years: 3, stepUpPercent: 10 });
    // 12 × 1,000 + 12 × 1,100 + 12 × 1,210
    expect(r.contributed).toBeCloseTo(12_000 + 13_200 + 14_520, 9);
    expect(r.rows.map((row) => Math.round(row.contributed))).toEqual([12_000, 25_200, 39_720]);
  });

  it("matches a sum of yearly SIPs when stepped up", () => {
    const i = 0.12 / 12;
    const r = sipGrowth({ monthly: 5_000, returnPercent: 12, years: 3, stepUpPercent: 10 });
    // Each year is its own 12-month SIP, then compounds for the years after it.
    const expected =
      annuityStart(5_000, i, 12) * (1 + i) ** 24 +
      annuityStart(5_500, i, 12) * (1 + i) ** 12 +
      annuityStart(6_050, i, 12);
    expect(r.balance).toBeCloseTo(expected, 6);
  });

  it("reports the value in today's money", () => {
    const r = sipGrowth({ monthly: 5_000, returnPercent: 12, years: 10, inflationPercent: 6 });
    expect(r.real).toBeCloseTo(r.balance / 1.06 ** 10, 6);
    expect(r.rows.every((row) => row.real !== null)).toBe(true);
  });
});

describe("simulateGrowth", () => {
  it("runs zero months as just the lump sum", () => {
    const r = simulateGrowth({ initial: 500, monthly: 10, monthlyRate: 0.01, months: 0, timing: "end" });
    expect(r.balance).toBe(500);
    expect(r.rows).toEqual([]);
  });
});

describe("inTodaysMoney / yearsToMonths / formatYear", () => {
  it("deflates by whole and part years", () => {
    expect(inTodaysMoney(1_000, 0, 120)).toBe(1_000);
    expect(inTodaysMoney(1_210, 0.1, 24)).toBeCloseTo(1_000, 9);
  });

  it("rounds a period to whole months", () => {
    expect(yearsToMonths(10)).toBe(120);
    expect(yearsToMonths(2.5)).toBe(30);
    expect(yearsToMonths(1.04)).toBe(12);
  });

  it("prints whole and part years", () => {
    expect(formatYear(120)).toBe("10");
    expect(formatYear(30)).toBe("2.5");
    expect(formatYear(1)).toBe("0.08");
  });
});

describe("readField", () => {
  const rate = { min: -50, max: 100, required: "Enter a rate.", range: "Use a rate between −50% and 100%." };

  it("reads a number in the visitor's format", () => {
    expect(readField("1,00,000", "en-IN", { min: 0, max: 1e12, range: "x" })).toEqual({ value: 100_000, error: null });
    expect(readField("7,5", "de-DE", rate)).toEqual({ value: 7.5, error: null });
    expect(readField("-5", "en-US", rate)).toEqual({ value: -5, error: null });
  });

  it("uses the blank value for an empty optional field", () => {
    expect(readField("  ", "en-US", { min: 0, max: 10, blank: 0, range: "x" })).toEqual({ value: 0, error: null });
    expect(readField("", "en-US", { min: 0, max: 10, blank: null, range: "x" })).toEqual({ value: null, error: null });
  });

  it("asks for a required field", () => {
    expect(readField("", "en-US", rate)).toEqual({ value: null, error: "Enter a rate." });
  });

  it("rejects text and out-of-range numbers", () => {
    expect(readField("abc", "en-US", rate).error).toBe("That doesn't look like a number.");
    expect(readField("101", "en-US", rate)).toEqual({ value: null, error: rate.range });
    expect(readField("-51", "en-US", rate)).toEqual({ value: null, error: rate.range });
  });

  it("can word the range error by side", () => {
    const amount = { min: 0, max: 1e12, blank: 0, range: amountRangeError };
    expect(readField("-1", "en-US", amount).error).toBe("Can't be negative.");
    expect(readField("2000000000000", "en-US", amount).error).toBe("That's more than this calculator can handle.");
  });
});

describe("scheduleCsv", () => {
  it("writes plain numbers with the currency in the headers", () => {
    const r = sipGrowth({ monthly: 1_000, returnPercent: 0, years: 2 });
    expect(scheduleCsv(r.rows, { currency: "INR", contributedLabel: "Invested", interestLabel: "Returns", balanceLabel: "Value" })).toBe(
      "Year,Invested (INR),Returns (INR),Value (INR)\r\n1,12000.00,0.00,12000.00\r\n2,24000.00,0.00,24000.00\r\n",
    );
  });

  it("adds a today's-money column when inflation is set", () => {
    const r = compoundInterest({
      principal: 1_000,
      monthly: 0,
      ratePercent: 10,
      years: 1,
      compounding: "yearly",
      inflationPercent: 10,
    });
    const [header, row] = scheduleCsv(r.rows, { currency: "USD" }).split("\r\n");
    expect(header).toBe("Year,Contributed (USD),Interest (USD),Balance (USD),In today's money (USD)");
    expect(row).toBe("1,1000.00,100.00,1100.00,1000.00");
  });
});
