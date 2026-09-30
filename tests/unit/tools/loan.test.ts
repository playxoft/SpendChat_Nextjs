import { describe, expect, it } from "vitest";
import {
  LOAN_LIMITS,
  amortize,
  cheapestOffer,
  effectiveRate,
  emi,
  loanPlan,
  monthIndexFromIso,
  monthIndexToIso,
  monthlyCsv,
  offerCost,
  prepaymentDue,
  processingFee,
  yearlyCsv,
  yearlySchedule,
  type LoanOffer,
  type LoanSchedule,
} from "@/lib/tools/loan";

// The textbook formula, written out independently of the code it checks.
const closedForm = (p: number, annual: number, n: number) => {
  const r = annual / 1200;
  return r === 0 ? p / n : (p * r * (1 + r) ** n) / ((1 + r) ** n - 1);
};

/** Sum in cents, so the check itself can't drift. */
const cents = (values: number[]) => values.reduce((s, v) => s + Math.round(v * 100), 0);

/** Every row is internally consistent and the balance walks down to exactly zero. */
function expectConsistent(s: LoanSchedule, principal: number) {
  let owed = Math.round(principal * 100);
  for (const row of s.rows) {
    expect(Math.round(row.payment * 100)).toBe(Math.round(row.interest * 100) + Math.round(row.principal * 100));
    owed -= Math.round(row.principal * 100) + Math.round(row.prepayment * 100);
    expect(Math.round(row.balance * 100)).toBe(owed);
  }
  expect(s.rows.at(-1)!.balance).toBe(0);
  expect(cents(s.rows.map((r) => r.principal + r.prepayment))).toBe(Math.round(principal * 100));
  expect(Math.round(s.totalPaid * 100)).toBe(Math.round(principal * 100) + Math.round(s.totalInterest * 100));
  expect(Math.round(s.totalInterest * 100)).toBe(cents(s.rows.map((r) => r.interest)));
}

describe("emi", () => {
  it("matches published figures", () => {
    // ₹10,00,000 at 8.5% for 20 years — the example on every Indian bank's calculator.
    expect(emi(1_000_000, 8.5, 240)).toBeCloseTo(8678.23, 2);
    // $300,000 at 6.5% for 30 years — a standard US mortgage example.
    expect(emi(300_000, 6.5, 360)).toBeCloseTo(1896.2, 2);
    // ₹5,00,000 at 10.5% for 5 years.
    expect(emi(500_000, 10.5, 60)).toBeCloseTo(10746.95, 2);
  });

  it("matches the closed form across rates and tenures", () => {
    for (const rate of [0.5, 3, 8.5, 12, 24, 36, 100]) {
      for (const n of [1, 12, 60, 240, 600]) {
        const expected = closedForm(250_000, rate, n);
        expect(Math.abs(emi(250_000, rate, n) - expected)).toBeLessThanOrEqual(expected * 1e-12);
      }
    }
  });

  it("is principal ÷ months at 0%, and close to it at a tiny rate", () => {
    expect(emi(12_000, 0, 12)).toBe(1000);
    expect(emi(12_000, 1e-9, 12)).toBeCloseTo(1000, 6);
  });

  it("is one payment of principal plus a month's interest over a single month", () => {
    expect(emi(1000, 12, 1)).toBeCloseTo(1010, 10);
  });
});

describe("amortize", () => {
  it("builds the published schedule: ₹10 lakh at 8.5% for 20 years", () => {
    const s = amortize({ principal: 1_000_000, ratePercent: 8.5, months: 240 });
    expect(s.emi).toBe(8678.23);
    expect(s.months).toBe(240);
    expect(s.rows[0]).toEqual({
      month: 1,
      payment: 8678.23,
      interest: 7083.33,
      principal: 1594.9,
      prepayment: 0,
      balance: 998405.1,
    });
    expect(s.totalInterest).toBeCloseTo(1_082_776.63, 2);
    expect(s.totalPaid).toBeCloseTo(2_082_776.63, 2);
    expectConsistent(s, 1_000_000);
  });

  it("adjusts only the last payment, and only by cents", () => {
    const s = amortize({ principal: 300_000, ratePercent: 6.5, months: 360 });
    expect(s.emi).toBe(1896.2);
    for (const row of s.rows.slice(0, -1)) expect(row.payment).toBe(1896.2);
    expect(Math.abs(s.rows.at(-1)!.payment - 1896.2)).toBeLessThan(5);
    expectConsistent(s, 300_000);
  });

  it("has no interest at 0%, with the rounding cent in the last payment", () => {
    const s = amortize({ principal: 1000, ratePercent: 0, months: 3 });
    expect(s.rows.map((r) => r.payment)).toEqual([333.33, 333.33, 333.34]);
    expect(s.totalInterest).toBe(0);
    expectConsistent(s, 1000);
  });

  it("rounds to whole units for a currency without decimals", () => {
    const s = amortize({ principal: 3_000_000, ratePercent: 2, months: 120, decimals: 0 });
    expect(Number.isInteger(s.emi)).toBe(true);
    expect(s.rows.every((r) => Number.isInteger(r.interest) && Number.isInteger(r.balance))).toBe(true);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });

  it("stays exact at the largest amount, rate and tenure allowed", () => {
    const s = amortize({
      principal: LOAN_LIMITS.maxAmount,
      ratePercent: LOAN_LIMITS.maxRate,
      months: LOAN_LIMITS.maxMonths,
    });
    expect(s.months).toBe(600);
    expect(Number.isFinite(s.totalPaid)).toBe(true);
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(s.totalPaid).toBeCloseTo(LOAN_LIMITS.maxAmount + s.totalInterest, 0);
  });

  it("finishes a tiny loan without stalling", () => {
    const s = amortize({ principal: 0.05, ratePercent: 5, months: 600 });
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(s.months).toBeLessThanOrEqual(600);
    expect(s.emi).toBe(0.01);
  });

  it("repays a one-month loan in one payment", () => {
    const s = amortize({ principal: 1000, ratePercent: 12, months: 1 });
    expect(s.rows).toEqual([{ month: 1, payment: 1010, interest: 10, principal: 1000, prepayment: 0, balance: 0 }]);
  });
});

describe("prepaymentDue", () => {
  it("fires once, every month, or every 12 months", () => {
    const due = (p: Parameters<typeof prepaymentDue>[0]) =>
      Array.from({ length: 36 }, (_, i) => i + 1).filter((m) => prepaymentDue(p, m));
    expect(due({ kind: "once", month: 7, amount: 100 })).toEqual([7]);
    expect(due({ kind: "monthly", amount: 100, from: 34 })).toEqual([34, 35, 36]);
    expect(due({ kind: "monthly", amount: 100 })).toHaveLength(36);
    expect(due({ kind: "yearly", amount: 100 })).toEqual([12, 24, 36]);
    expect(due({ kind: "yearly", amount: 100, from: 3 })).toEqual([3, 15, 27]);
  });

  it("ignores a zero or negative amount", () => {
    expect(prepaymentDue({ kind: "monthly", amount: 0 }, 5)).toBe(false);
    expect(prepaymentDue({ kind: "once", month: 5, amount: -10 }, 5)).toBe(false);
  });
});

describe("loanPlan with prepayments", () => {
  const base = { principal: 1_000_000, ratePercent: 8.5, months: 240 };

  it("changes nothing without prepayments", () => {
    const p = loanPlan(base);
    expect(p.interestSaved).toBe(0);
    expect(p.monthsSaved).toBe(0);
    expect(p.totalInterest).toBe(p.baseline.totalInterest);
  });

  it("keeps the EMI and ends sooner when reducing the tenure", () => {
    const p = loanPlan({ ...base, prepayments: [{ kind: "once", month: 12, amount: 100_000 }] });
    expect(p.emi).toBe(8678.23);
    expect(p.lastEmi).toBe(8678.23);
    expect(p.rows[11]!.prepayment).toBe(100_000);
    expect(p.months).toBe(192);
    expect(p.monthsSaved).toBe(48);
    expect(p.interestSaved).toBeCloseTo(320_738.55, 2);
    expect(p.interestSaved).toBeCloseTo(p.baseline.totalInterest - p.totalInterest, 2);
    expectConsistent(p, 1_000_000);
  });

  it("keeps the end date and lowers the EMI when reducing the EMI", () => {
    const p = loanPlan({ ...base, mode: "emi", prepayments: [{ kind: "once", month: 12, amount: 100_000 }] });
    expect(p.months).toBe(240);
    expect(p.monthsSaved).toBe(0);
    // The new EMI re-spreads the balance after month 12 over the 228 months left.
    const owed = p.rows[11]!.balance;
    expect(p.lastEmi).toBeCloseTo(emi(owed, 8.5, 228), 2);
    expect(p.lastEmi).toBe(7792.79);
    expect(p.rows[12]!.payment).toBe(7792.79);
    expect(p.interestSaved).toBeCloseTo(101_883.52, 2);
    expectConsistent(p, 1_000_000);
  });

  it("saves more interest by cutting the tenure than by cutting the EMI", () => {
    const prepayments = [{ kind: "yearly", amount: 50_000 }] as const;
    const tenure = loanPlan({ ...base, prepayments, mode: "tenure" });
    const lower = loanPlan({ ...base, prepayments, mode: "emi" });
    expect(tenure.interestSaved).toBeGreaterThan(lower.interestSaved);
    expect(lower.interestSaved).toBeGreaterThan(0);
  });

  it("clears the loan with a prepayment bigger than the balance, and caps it", () => {
    const p = loanPlan({ ...base, prepayments: [{ kind: "once", month: 6, amount: 5_000_000 }] });
    expect(p.months).toBe(6);
    expect(p.rows[5]!.balance).toBe(0);
    expect(p.totalPrepaid).toBe(p.rows[5]!.prepayment);
    expect(p.totalPrepaid).toBeLessThan(1_000_000);
    expectConsistent(p, 1_000_000);
  });

  it("ignores a prepayment after the loan has ended", () => {
    const p = loanPlan({ ...base, months: 24, prepayments: [{ kind: "once", month: 30, amount: 10_000 }] });
    expect(p.interestSaved).toBe(0);
    expect(p.totalPrepaid).toBe(0);
  });

  it("combines a lump sum with a regular prepayment", () => {
    const p = loanPlan({
      ...base,
      prepayments: [
        { kind: "once", month: 12, amount: 100_000 },
        { kind: "monthly", amount: 2000 },
      ],
    });
    expect(p.rows[0]!.prepayment).toBe(2000);
    expect(p.rows[11]!.prepayment).toBe(102_000);
    const onlyOnce = loanPlan({ ...base, prepayments: [{ kind: "once", month: 12, amount: 100_000 }] });
    expect(p.months).toBeLessThan(onlyOnce.months);
    expectConsistent(p, 1_000_000);
  });

  it("works at 0% — a prepayment shortens the loan but saves no interest", () => {
    const p = loanPlan({ principal: 12_000, ratePercent: 0, months: 12, prepayments: [{ kind: "once", month: 1, amount: 5000 }] });
    expect(p.interestSaved).toBe(0);
    expect(p.monthsSaved).toBeGreaterThan(0);
    expectConsistent(p, 12_000);
  });
});

describe("month indexes", () => {
  it("parses a date or a month and round-trips", () => {
    expect(monthIndexFromIso("2026-11-05")).toBe(2026 * 12 + 10);
    expect(monthIndexFromIso("2026-01")).toBe(2026 * 12);
    expect(monthIndexToIso(2026 * 12 + 10)).toBe("2026-11");
    expect(monthIndexToIso(2026 * 12 + 11 + 1)).toBe("2027-01");
  });

  it("rejects anything that isn't a date", () => {
    for (const bad of ["", "2026-13-01", "2026-00", "Nov 2026", "26-11-05"]) {
      expect(monthIndexFromIso(bad)).toBeNull();
    }
  });
});

describe("yearlySchedule", () => {
  const s = amortize({ principal: 1_000_000, ratePercent: 8.5, months: 240 });

  it("groups loan years of 12 EMIs without a start date", () => {
    const years = yearlySchedule(s.rows);
    expect(years).toHaveLength(20);
    expect(years[0]).toMatchObject({ year: 1, fromMonth: 1, toMonth: 12 });
    expect(years[0]!.balance).toBe(s.rows[11]!.balance);
    expect(cents(years.map((y) => y.interest))).toBe(Math.round(s.totalInterest * 100));
    expect(cents(years.map((y) => y.principal))).toBe(100_000_000);
    expect(years.at(-1)!.balance).toBe(0);
  });

  it("groups calendar years from the first EMI's month", () => {
    const years = yearlySchedule(s.rows, monthIndexFromIso("2026-10-05"));
    // Oct–Dec 2026, 19 full years, then Jan–Sep 2046.
    expect(years).toHaveLength(21);
    expect(years[0]).toMatchObject({ year: 2026, fromMonth: 1, toMonth: 3 });
    expect(years[1]).toMatchObject({ year: 2027, fromMonth: 4, toMonth: 15 });
    expect(years.at(-1)).toMatchObject({ year: 2046, fromMonth: 232, toMonth: 240, balance: 0 });
    expect(cents(years.map((y) => y.payment))).toBe(cents(s.rows.map((r) => r.payment)));
  });

  it("keeps a January start in one calendar year per loan year", () => {
    const years = yearlySchedule(s.rows, monthIndexFromIso("2027-01"));
    expect(years).toHaveLength(20);
    expect(years[0]).toMatchObject({ year: 2027, fromMonth: 1, toMonth: 12 });
  });

  it("is empty for an empty schedule", () => {
    expect(yearlySchedule([])).toEqual([]);
  });
});

describe("CSV", () => {
  const plan = loanPlan({
    principal: 10_000,
    ratePercent: 12,
    months: 12,
    prepayments: [{ kind: "once", month: 3, amount: 1000 }],
  });

  it("writes the monthly schedule with plain numbers and optional columns", () => {
    const csv = monthlyCsv(plan.rows, { currency: "USD", start: monthIndexFromIso("2026-11") });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Month,Date,Payment (USD),Principal (USD),Interest (USD),Prepayment (USD),Balance (USD)",
    );
    expect(lines).toHaveLength(plan.rows.length + 1);
    expect(lines[1]).toMatch(/^1,2026-11,888\.49,788\.49,100\.00,0\.00,9211\.51$/);
    expect(lines[3]).toContain(",2027-01,");
    expect(lines[3]).toContain(",1000.00,");
  });

  it("leaves out the date and prepayment columns when there are none", () => {
    const csv = monthlyCsv(plan.baseline.rows, { currency: "INR", decimals: 2 });
    expect(csv.split("\r\n")[0]).toBe("Month,Payment (INR),Principal (INR),Interest (INR),Balance (INR)");
  });

  it("writes the yearly summary", () => {
    const years = yearlySchedule(plan.rows);
    expect(yearlyCsv(years, { currency: "EUR", calendar: false }).split("\r\n")[0]).toBe(
      "Loan year,Payments (EUR),Principal (EUR),Interest (EUR),Prepayments (EUR),Balance (EUR)",
    );
    expect(yearlyCsv(years, { currency: "EUR", calendar: true, decimals: 0 }).split("\r\n")[1]).toMatch(
      /^1,\d+,9000,\d+,1000,0$/,
    );
  });
});

describe("offerCost", () => {
  const offerA: LoanOffer = {
    amount: 500_000,
    ratePercent: 10.5,
    months: 60,
    processingFee: { kind: "percent", value: 2 },
    otherCharges: 2000,
  };
  const offerB: LoanOffer = {
    amount: 500_000,
    ratePercent: 11,
    months: 60,
    processingFee: { kind: "percent", value: 0.5 },
    otherCharges: 0,
  };

  it("adds the fees to the interest", () => {
    const a = offerCost(offerA);
    expect(a.emi).toBe(10746.95);
    expect(a.fees).toBe(12_000);
    expect(a.totalInterest).toBeCloseTo(144_816.99, 2);
    expect(a.totalCost).toBeCloseTo(156_816.99, 2);
    expect(a.totalPaid).toBeCloseTo(656_816.99, 2);
  });

  it("finds the higher-rate offer cheaper once fees count", () => {
    const a = offerCost(offerA);
    const b = offerCost(offerB);
    expect(b.totalInterest).toBeGreaterThan(a.totalInterest);
    expect(b.totalCost).toBeCloseTo(154_772.7, 2);
    expect(a.totalCost - b.totalCost).toBeCloseTo(2044.29, 2);
    expect(cheapestOffer([a, b])).toEqual({ index: 1, tie: false });
  });

  it("reports the quoted rate as the effective rate when there are no fees", () => {
    const c = offerCost({ ...offerB, processingFee: { kind: "fixed", value: 0 } });
    expect(c.effectiveRate).toBe(11);
    expect(c.fees).toBe(0);
  });

  it("raises the effective rate by the fees", () => {
    const a = offerCost(offerA);
    expect(a.effectiveRate).toBeGreaterThan(10.5);
    // Cross-check: at that rate, the loan minus the fees repays with the same EMI.
    expect(emi(500_000 - 12_000, a.effectiveRate!, 60)).toBeCloseTo(a.emi, 1);
    expect(a.effectiveRate).toBeCloseTo(11.56, 2);
  });

  it("takes a fixed processing fee as typed", () => {
    expect(processingFee(500_000, { kind: "fixed", value: 999 })).toBe(999);
    expect(processingFee(333_333, { kind: "percent", value: 1.5 })).toBe(5000);
    expect(processingFee(1_234_567, { kind: "percent", value: 1 }, 0)).toBe(12_346);
  });

  it("has no effective rate when the fees eat the whole loan", () => {
    const c = offerCost({ ...offerA, processingFee: { kind: "percent", value: 100 } });
    expect(c.effectiveRate).toBeNull();
  });
});

describe("effectiveRate", () => {
  it("recovers the rate of a plain loan", () => {
    const s = amortize({ principal: 100_000, ratePercent: 9, months: 36 });
    expect(effectiveRate(100_000, s.rows.map((r) => r.payment))).toBeCloseTo(9, 3);
  });

  it("gives a 0% loan with a fee a positive rate", () => {
    // 1,200 repaid as 12 × 100, but only 1,150 received.
    const apr = effectiveRate(1150, Array(12).fill(100));
    expect(apr).toBeGreaterThan(7);
    expect(apr).toBeLessThan(9);
  });

  it("is null for nothing received or nothing repaid", () => {
    expect(effectiveRate(0, [100])).toBeNull();
    expect(effectiveRate(-5, [100])).toBeNull();
    expect(effectiveRate(100, [])).toBeNull();
  });

  it("is zero when the payments don't exceed what was received", () => {
    expect(effectiveRate(1200, Array(12).fill(100))).toBe(0);
  });
});

describe("cheapestOffer", () => {
  const cost = (totalCost: number) => ({
    emi: 0,
    months: 12,
    totalInterest: totalCost,
    fees: 0,
    totalCost,
    totalPaid: totalCost,
    effectiveRate: 0,
  });

  it("needs two offers to compare", () => {
    expect(cheapestOffer([])).toBeNull();
    expect(cheapestOffer([cost(5)])).toBeNull();
    expect(cheapestOffer([cost(5), null])).toBeNull();
  });

  it("skips offers that couldn't be worked out", () => {
    expect(cheapestOffer([null, cost(900), cost(800)])).toEqual({ index: 2, tie: false });
  });

  it("calls a tie within a minor unit", () => {
    expect(cheapestOffer([cost(100), cost(100.004)])).toEqual({ index: 0, tie: true });
    expect(cheapestOffer([cost(100.02), cost(100)])).toEqual({ index: 1, tie: false });
    expect(cheapestOffer([cost(100), cost(100.5)], 0)).toEqual({ index: 0, tie: true });
  });
});
