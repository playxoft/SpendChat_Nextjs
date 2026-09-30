import { describe, expect, it } from "vitest";
import {
  addMonths,
  compoundedYearly,
  depositsYield,
  fixedDeposit,
  lumpSumValue,
  periodYears,
  recurringDeposit,
  SHORT_TENURE_MONTHS,
  simpleInterest,
  tenureLabel,
  toPeriod,
  type SimpleInterestAnswer,
} from "@/lib/tools/deposits";

/** A plain en-US formatter for the working — grouping, up to `d` decimals. */
const fmt = (v: number, d: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(v);

function ok(answer: SimpleInterestAnswer) {
  if (!answer.ok) throw new Error(`expected an answer, got: ${answer.error}`);
  return answer;
}

/** Relative closeness, for balances too large for a fixed number of decimals. */
function expectNear(actual: number, expected: number, rel = 1e-9) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-9);
}

// The IBA recurring-deposit formula, written out independently of the engine:
// M = R × ((1 + i)^n − 1) ÷ (1 − (1 + i)^(−1/3)), i = rate ÷ 400, n = quarters.
const ibaRd = (monthly: number, ratePercent: number, months: number) => {
  const i = ratePercent / 400;
  return (monthly * ((1 + i) ** (months / 3) - 1)) / (1 - (1 + i) ** (-1 / 3));
};

describe("periods", () => {
  it("expresses months and days as exact fractions of a year", () => {
    expect(periodYears(toPeriod(3, "years"))).toBe(3);
    expect(periodYears(toPeriod(18, "months"))).toBe(1.5);
    expect(periodYears(toPeriod(73, "days"))).toBe(0.2);
    expect(periodYears(toPeriod(90, "days", 360))).toBe(0.25);
  });
});

describe("simpleInterest — find the interest", () => {
  it("is P × R × T ÷ 100", () => {
    const { result } = ok(simpleInterest({ solveFor: "interest", principal: 10_000, rate: 7, period: toPeriod(3, "years") }, fmt));
    expect(result.interest).toBe(2100);
    expect(result.amount).toBe(12_100);
    expect(result.years).toBe(3);
  });

  it("shows the working step by step", () => {
    const { steps } = ok(simpleInterest({ solveFor: "interest", principal: 10_000, rate: 7, period: toPeriod(3, "years") }, fmt));
    expect(steps.map((s) => s.lines)).toEqual([
      ["SI = P × R × T ÷ 100", "= 10,000 × 7 × 3 ÷ 100", "= 210,000 ÷ 100", "= 2,100"],
      ["A = P + SI = 10,000 + 2,100 = 12,100"],
    ]);
  });

  it("keeps days as an exact fraction — the textbook 73 days is exactly a fifth of a year", () => {
    const { result, steps } = ok(
      simpleInterest({ solveFor: "interest", principal: 7300, rate: 5, period: toPeriod(73, "days") }, fmt),
    );
    expect(result.interest).toBeCloseTo(73, 10);
    expect(steps[0]!.lines).toEqual(["T = 73 ÷ 365 = 0.2 years"]);
    expect(steps[1]!.lines[1]).toBe("= 7,300 × 5 × 73 ÷ (100 × 365)");
  });

  it("marks a rounded figure with ≈", () => {
    const { result, steps } = ok(
      simpleInterest({ solveFor: "interest", principal: 10_000, rate: 7, period: toPeriod(90, "days") }, fmt),
    );
    expect(result.interest).toBeCloseTo((10_000 * 7 * 90) / 36_500, 10);
    expect(steps[0]!.lines[0]).toBe("T = 90 ÷ 365 ≈ 0.2466 years");
    expect(steps[1]!.lines.at(-1)).toBe("≈ 172.6");
  });

  it("uses a 360-day year under the banker's rule", () => {
    const { result } = ok(
      simpleInterest({ solveFor: "interest", principal: 10_000, rate: 7, period: toPeriod(90, "days", 360) }, fmt),
    );
    expect(result.interest).toBeCloseTo(175, 10);
  });

  it("turns a monthly rate into a yearly one first", () => {
    const { result, steps } = ok(
      simpleInterest(
        { solveFor: "interest", principal: 50_000, rate: 2, ratePer: "month", period: toPeriod(6, "months") },
        fmt,
      ),
    );
    expect(result.ratePercent).toBe(24);
    expect(result.interest).toBe(6000);
    expect(steps[0]!.lines).toEqual(["R = 2% × 12 = 24% a year"]);
  });

  it("is zero at a zero rate or a zero time", () => {
    expect(ok(simpleInterest({ solveFor: "interest", principal: 10_000, rate: 0, period: toPeriod(3, "years") }, fmt)).result.interest).toBe(0);
    expect(ok(simpleInterest({ solveFor: "interest", principal: 10_000, rate: 7, period: toPeriod(0, "days") }, fmt)).result.interest).toBe(0);
  });

  it("stays finite for huge values", () => {
    const { result } = ok(
      simpleInterest({ solveFor: "interest", principal: 1e12, rate: 100, period: toPeriod(100, "years") }, fmt),
    );
    expect(result.interest).toBe(1e14);
    expect(Number.isFinite(result.amount)).toBe(true);
  });
});

describe("simpleInterest — find the principal", () => {
  it("from the interest: P = SI × 100 ÷ (R × T)", () => {
    const { result } = ok(
      simpleInterest({ solveFor: "principal", known: "interest", interest: 2100, rate: 7, period: toPeriod(3, "years") }, fmt),
    );
    expect(result.principal).toBeCloseTo(10_000, 9);
    expect(result.amount).toBeCloseTo(12_100, 9);
  });

  it("from the final amount: P = A ÷ (1 + R × T ÷ 100)", () => {
    const { result, steps } = ok(
      simpleInterest({ solveFor: "principal", known: "amount", amount: 6000, rate: 5, period: toPeriod(4, "years") }, fmt),
    );
    expect(result.principal).toBeCloseTo(5000, 9);
    expect(result.interest).toBeCloseTo(1000, 9);
    expect(steps.map((s) => s.lines.at(-1))).toEqual(["= 1.2", "= 5,000", "SI = A − P = 6,000 − 5,000 = 1,000"]);
  });

  it("with the time in months", () => {
    const { result } = ok(
      simpleInterest({ solveFor: "principal", known: "interest", interest: 450, rate: 6, period: toPeriod(9, "months") }, fmt),
    );
    expect(result.principal).toBeCloseTo(10_000, 9);
  });

  it("has no answer at a zero rate or time", () => {
    expect(simpleInterest({ solveFor: "principal", interest: 100, rate: 0, period: toPeriod(3, "years") }, fmt).ok).toBe(false);
    expect(simpleInterest({ solveFor: "principal", interest: 100, rate: 5, period: toPeriod(0, "years") }, fmt).ok).toBe(false);
  });
});

describe("simpleInterest — find the rate", () => {
  it("from the interest: R = SI × 100 ÷ (P × T)", () => {
    const { result, steps } = ok(
      simpleInterest({ solveFor: "rate", known: "interest", principal: 10_000, interest: 2100, period: toPeriod(3, "years") }, fmt),
    );
    expect(result.ratePercent).toBeCloseTo(7, 12);
    expect(steps[0]!.lines.at(-1)).toBe("= 7% a year");
  });

  it("from the final amount, with the rate also shown per month", () => {
    const { result, steps } = ok(
      simpleInterest(
        { solveFor: "rate", known: "amount", principal: 50_000, amount: 56_000, ratePer: "month", period: toPeriod(6, "months") },
        fmt,
      ),
    );
    expect(result.ratePercent).toBeCloseTo(24, 12);
    expect(steps.map((s) => s.title)).toEqual([
      "Turn the time into years (12 months in a year)",
      "Find the interest from the final amount",
      "Rearrange the formula for R",
      "Per month",
      "Add the interest to the principal for the final amount",
    ]);
    expect(steps[1]!.lines).toEqual(["SI = A − P = 56,000 − 50,000 = 6,000"]);
    expect(steps.find((s) => s.title === "Per month")!.lines).toEqual(["24% ÷ 12 = 2% a month"]);
  });

  it("refuses a final amount that isn't more than the principal", () => {
    const a = simpleInterest({ solveFor: "rate", known: "amount", principal: 5000, amount: 5000, period: toPeriod(1, "years") }, fmt);
    expect(a.ok).toBe(false);
  });

  it("has no answer with a zero principal or time", () => {
    expect(simpleInterest({ solveFor: "rate", principal: 0, interest: 5, period: toPeriod(1, "years") }, fmt).ok).toBe(false);
    expect(simpleInterest({ solveFor: "rate", principal: 10, interest: 5, period: toPeriod(0, "months") }, fmt).ok).toBe(false);
  });
});

describe("simpleInterest — find the time", () => {
  it("T = SI × 100 ÷ (P × R), in years", () => {
    const { result } = ok(
      simpleInterest({ solveFor: "time", known: "amount", principal: 5000, amount: 6000, rate: 5, period: toPeriod(1, "years") }, fmt),
    );
    expect(result.years).toBeCloseTo(4, 12);
  });

  it("money doubles at 8% simple in 12.5 years — and it's converted into the chosen unit", () => {
    const { result, steps } = ok(
      simpleInterest({ solveFor: "time", known: "amount", principal: 10_000, amount: 20_000, rate: 8, period: toPeriod(1, "months") }, fmt),
    );
    expect(result.years).toBeCloseTo(12.5, 12);
    expect(steps.find((s) => s.title === "In months")!.lines).toEqual(["12.5 × 12 = 150 months"]);
  });

  it("in days on either day basis", () => {
    const a = ok(simpleInterest({ solveFor: "time", principal: 36_500, interest: 100, rate: 10, period: toPeriod(1, "days") }, fmt));
    expect(a.result.years * 365).toBeCloseTo(10, 9);
    const b = ok(simpleInterest({ solveFor: "time", principal: 36_000, interest: 100, rate: 10, period: toPeriod(1, "days", 360) }, fmt));
    expect(b.steps.find((s) => s.title === "In days")!.lines[0]).toMatch(/= 10 days$/);
  });

  it("has no answer at a zero rate", () => {
    expect(simpleInterest({ solveFor: "time", principal: 100, interest: 5, rate: 0 }, fmt).ok).toBe(false);
  });
});

describe("the four modes agree", () => {
  it("solving any one of P, R, T back from the others gives the same scenario", () => {
    const period = toPeriod(20, "months");
    const base = ok(simpleInterest({ solveFor: "interest", principal: 12_345.67, rate: 8.25, period }, fmt)).result;
    const p = ok(simpleInterest({ solveFor: "principal", known: "interest", interest: base.interest, rate: 8.25, period }, fmt)).result;
    const pa = ok(simpleInterest({ solveFor: "principal", known: "amount", amount: base.amount, rate: 8.25, period }, fmt)).result;
    const r = ok(simpleInterest({ solveFor: "rate", known: "amount", principal: 12_345.67, amount: base.amount, period }, fmt)).result;
    const t = ok(simpleInterest({ solveFor: "time", known: "interest", principal: 12_345.67, interest: base.interest, rate: 8.25, period }, fmt)).result;
    expect(p.principal).toBeCloseTo(12_345.67, 8);
    expect(pa.principal).toBeCloseTo(12_345.67, 8);
    expect(r.ratePercent).toBeCloseTo(8.25, 10);
    expect(t.years * 12).toBeCloseTo(20, 10);
  });
});

describe("compoundedYearly", () => {
  it("matches P(1 + r)^t for whole years", () => {
    expect(compoundedYearly(10_000, 7, 3)).toBeCloseTo(12_250.43, 6);
    expect(compoundedYearly(10_000, 7, 10)).toBeCloseTo(10_000 * 1.07 ** 10, 6);
  });

  it("equals simple interest for a year or less", () => {
    expect(compoundedYearly(10_000, 7, 1)).toBeCloseTo(10_700, 9);
    expect(compoundedYearly(10_000, 7, 0.25)).toBeCloseTo(10_175, 9);
  });

  it("pays a part-year at simple interest on the compounded balance", () => {
    expect(compoundedYearly(10_000, 10, 1.5)).toBeCloseTo(11_000 * 1.05, 9);
  });
});

describe("lumpSumValue", () => {
  it("compounds whole periods and pays the broken period at simple interest", () => {
    // 14 months quarterly = 4 whole quarters + 2 months.
    expect(lumpSumValue(100_000, 0.07, 14, "quarterly")).toBeCloseTo(100_000 * 1.0175 ** 4 * (1 + (0.07 * 2) / 12), 6);
    // 9 months half-yearly = 1 half-year + 3 months.
    expect(lumpSumValue(1000, 0.1, 9, "half-yearly")).toBeCloseTo(1000 * 1.05 * 1.025, 9);
  });

  it("is P(1 + r/n)^(nt) when the tenure is whole periods", () => {
    for (const [c, n] of [["monthly", 12], ["quarterly", 4], ["half-yearly", 2], ["yearly", 1]] as const) {
      expectNear(lumpSumValue(50_000, 0.065, 36, c), 50_000 * (1 + 0.065 / n) ** (n * 3));
    }
  });

  it("is simple interest when compounding is off", () => {
    expect(lumpSumValue(100_000, 0.07, 30, "simple")).toBeCloseTo(117_500, 9);
  });
});

describe("fixedDeposit", () => {
  it("₹1,00,000 at 7% for 5 years, compounded quarterly, is ₹1,41,478", () => {
    const r = fixedDeposit({ principal: 100_000, ratePercent: 7, months: 60 });
    expect(r.balance).toBeCloseTo(100_000 * 1.0175 ** 20, 6);
    expect(Math.round(r.balance)).toBe(141_478);
    expect(Math.round(r.interest)).toBe(41_478);
    expect(r.compounding).toBe("quarterly");
    expect(r.shortTenure).toBe(false);
  });

  it("₹1,00,000 at 6.5% for 5 years is ₹1,38,042 — (1 + 0.065/4)^20", () => {
    const r = fixedDeposit({ principal: 100_000, ratePercent: 6.5, months: 60 });
    expect(r.balance).toBeCloseTo(100_000 * (1 + 0.065 / 4) ** 20, 6);
    expect(Math.round(r.balance)).toBe(138_042);
  });

  it("reports the effective annual yield: (1 + r/4)^4 − 1 for quarterly", () => {
    const r = fixedDeposit({ principal: 100_000, ratePercent: 7, months: 60 });
    expect(r.annualYieldPercent).toBeCloseTo(((1 + 0.07 / 4) ** 4 - 1) * 100, 9);
    expect(r.annualYieldPercent.toFixed(2)).toBe("7.19");
  });

  it("pays simple interest under six months, whatever the compounding", () => {
    for (const months of [1, 3, 5]) {
      const r = fixedDeposit({ principal: 100_000, ratePercent: 7, months, compounding: "monthly" });
      expect(r.compounding).toBe("simple");
      expect(r.shortTenure).toBe(true);
      expect(r.balance).toBeCloseTo(100_000 * (1 + (0.07 * months) / 12), 9);
    }
    const six = fixedDeposit({ principal: 100_000, ratePercent: 7, months: SHORT_TENURE_MONTHS });
    expect(six.shortTenure).toBe(false);
    expect(six.balance).toBeCloseTo(100_000 * 1.0175 ** 2, 9);
  });

  it("isn't flagged short when simple interest was chosen anyway", () => {
    expect(fixedDeposit({ principal: 1000, ratePercent: 7, months: 3, compounding: "simple" }).shortTenure).toBe(false);
  });

  it("gives one row per year plus the part-year, all holding the same deposit", () => {
    const r = fixedDeposit({ principal: 100_000, ratePercent: 7, months: 30 });
    expect(r.rows.map((x) => x.months)).toEqual([12, 24, 30]);
    expect(r.rows.every((x) => x.contributed === 100_000)).toBe(true);
    expect(r.rows[0]!.balance).toBeCloseTo(100_000 * 1.0175 ** 4, 6);
    expect(r.rows.at(-1)!.balance).toBe(r.balance);
    expect(r.rows.at(-1)!.interest).toBeCloseTo(r.interest, 9);
  });

  it("estimates TDS as a share of the interest", () => {
    const r = fixedDeposit({ principal: 100_000, ratePercent: 7, months: 60, tdsPercent: 10 });
    expect(r.tds).toBeCloseTo(r.interest * 0.1, 9);
    expect(r.afterTds).toBeCloseTo(r.balance - r.tds!, 9);
    expect(fixedDeposit({ principal: 100_000, ratePercent: 7, months: 60 }).tds).toBeNull();
  });

  it("is flat at a zero rate", () => {
    const r = fixedDeposit({ principal: 5000, ratePercent: 0, months: 24, tdsPercent: 10 });
    expect(r.balance).toBe(5000);
    expect(r.interest).toBe(0);
    expect(r.annualYieldPercent).toBe(0);
    expect(r.tds).toBe(0);
  });

  it("stays finite at the limits", () => {
    const r = fixedDeposit({ principal: 1e12, ratePercent: 50, months: 600 });
    expect(Number.isFinite(r.balance)).toBe(true);
    expect(r.rows).toHaveLength(50);
  });
});

describe("recurringDeposit", () => {
  it("matches ICICI Bank's published example: ₹5,000 a month at 8% for 1 year is ₹62,647", () => {
    // https://www.icici.bank.in/personal-banking/deposits/recurring-deposits/rd-calculator
    const r = recurringDeposit({ monthly: 5000, ratePercent: 8, months: 12 });
    expect(Math.round(r.balance)).toBe(62_647);
    expect(r.contributed).toBe(60_000);
  });

  it("matches the IBA formula for any tenure, whole quarters or not", () => {
    for (const months of [3, 6, 12, 14, 25, 60, 120]) {
      expectNear(recurringDeposit({ monthly: 2500, ratePercent: 7.1, months }).balance, ibaRd(2500, 7.1, months));
    }
  });

  it("₹5,000 a month at 7% for 5 years grows to about ₹3,59,664", () => {
    const r = recurringDeposit({ monthly: 5000, ratePercent: 7, months: 60 });
    expect(Math.round(r.balance)).toBe(359_664);
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]!.contributed).toBe(60_000);
  });

  it("yields (1 + r/4)^4 − 1 a year, the same as a quarterly FD", () => {
    const r = recurringDeposit({ monthly: 5000, ratePercent: 8, months: 12 });
    expect(r.annualYieldPercent).toBeCloseTo((1.02 ** 4 - 1) * 100, 6);
  });

  it("can pay simple interest on each instalment instead", () => {
    const r = recurringDeposit({ monthly: 1000, ratePercent: 12, months: 12, compounding: "simple" });
    // Σ 1000 × (1 + 0.01 × k) for k = 1…12 = 12,000 + 10 × 78.
    expect(r.balance).toBeCloseTo(12_780, 9);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.interest).toBeCloseTo(780, 9);
  });

  it("estimates TDS and is flat at a zero rate", () => {
    const r = recurringDeposit({ monthly: 5000, ratePercent: 8, months: 12, tdsPercent: 20 });
    expect(r.tds).toBeCloseTo(r.interest * 0.2, 9);
    const zero = recurringDeposit({ monthly: 5000, ratePercent: 0, months: 12 });
    expect(zero.balance).toBeCloseTo(60_000, 9);
    expect(zero.annualYieldPercent).toBeCloseTo(0, 9);
  });
});

describe("depositsYield", () => {
  it("is zero when nothing was earned, and zero for empty input", () => {
    expect(depositsYield(100, 12, 1200)).toBeCloseTo(0, 9);
    expect(depositsYield(0, 12, 1200)).toBe(0);
  });

  it("recovers the monthly rate the deposits grew at", () => {
    const j = 0.01;
    const maturity = (100 * (1 + j) * ((1 + j) ** 24 - 1)) / j;
    expect(depositsYield(100, 24, maturity)).toBeCloseTo(1.01 ** 12 - 1, 9);
  });

  it("handles a loss", () => {
    expect(depositsYield(100, 12, 1100)).toBeLessThan(0);
  });
});

describe("addMonths", () => {
  it("moves by whole months, clamping to the month's last day", () => {
    expect(addMonths("2026-09-30", 60)).toBe("2031-09-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("returns null for bad input or a date past 9999", () => {
    expect(addMonths("2026-02-30", 1)).toBeNull();
    expect(addMonths("nonsense", 1)).toBeNull();
    expect(addMonths("9999-12-01", 1)).toBeNull();
    expect(addMonths("2026-01-01", 1.5)).toBeNull();
  });
});

describe("tenureLabel", () => {
  it("reads months back in years and months", () => {
    expect(tenureLabel(60)).toBe("5 years");
    expect(tenureLabel(12)).toBe("1 year");
    expect(tenureLabel(18)).toBe("1 year 6 months");
    expect(tenureLabel(1)).toBe("1 month");
    expect(tenureLabel(25)).toBe("2 years 1 month");
  });
});
