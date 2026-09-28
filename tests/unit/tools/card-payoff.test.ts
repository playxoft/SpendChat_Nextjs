import { describe, expect, it } from "vitest";
import {
  MAX_MONTHS,
  formatDuration,
  minimumPayment,
  monthlyInterest,
  paymentForMonths,
  simulatePayoff,
  yearlySummary,
  type MinimumRule,
  type Payoff,
} from "@/lib/tools/card-payoff";

const US_RULE: MinimumRule = { percent: 1, floor: 25, plusInterest: true };

function paid(result: Payoff | null) {
  if (result?.status !== "paid") throw new Error(`expected a payoff, got ${JSON.stringify(result)}`);
  return result;
}

function never(result: Payoff | null) {
  if (result?.status !== "never") throw new Error(`expected no payoff, got ${result?.status}`);
  return result;
}

describe("monthlyInterest", () => {
  it("is a twelfth of the annual rate", () => {
    expect(monthlyInterest(1000, 12)).toBeCloseTo(10, 10);
    expect(monthlyInterest(5000, 0)).toBe(0);
  });
});

describe("minimumPayment", () => {
  it("takes the percent of the balance, plus interest when the rule says so", () => {
    expect(minimumPayment(5000, 90, { percent: 1, floor: 25, plusInterest: true })).toBeCloseTo(140, 10);
    expect(minimumPayment(5000, 90, { percent: 3, floor: 25, plusInterest: false })).toBeCloseTo(150, 10);
  });

  it("never asks for less than the floor", () => {
    expect(minimumPayment(1000, 0, { percent: 1, floor: 25, plusInterest: false })).toBe(25);
  });

  it("never asks for more than is owed", () => {
    expect(minimumPayment(18, 0.3, US_RULE)).toBe(18);
  });
});

describe("simulatePayoff — fixed payment", () => {
  it("matches the closed-form amortisation", () => {
    // 1,000 at 1% a month, 100 a month: ten full payments, then what's left
    // of B·1.01¹⁰ − 100·(1.01¹⁰ − 1)/0.01, plus that month's interest.
    const r = paid(simulatePayoff(1000, 12, { kind: "fixed", amount: 100 }));
    const left = 1000 * 1.01 ** 10 - (100 * (1.01 ** 10 - 1)) / 0.01;
    expect(r.months).toBe(11);
    expect(r.schedule.at(-1)!.payment).toBeCloseTo(left * 1.01, 8);
    expect(r.totalPaid).toBeCloseTo(1000 + left * 1.01, 8);
    expect(r.totalInterest).toBeCloseTo(r.totalPaid - 1000, 8);
  });

  it("clears a typical card in the expected time", () => {
    // n = −ln(1 − rB/P) / ln(1 + r) = 33.7 → 34 payments.
    const r = paid(simulatePayoff(5000, 22, { kind: "fixed", amount: 200 }));
    const rate = 0.22 / 12;
    expect(r.months).toBe(Math.ceil(-Math.log(1 - (rate * 5000) / 200) / Math.log(1 + rate)));
    expect(r.totalInterest).toBeGreaterThan(1700);
    expect(r.totalInterest).toBeLessThan(1800);
  });

  it("keeps the schedule consistent with the totals", () => {
    const r = paid(simulatePayoff(3200, 19.9, { kind: "fixed", amount: 150 }));
    const sum = (k: "payment" | "interest" | "principal") =>
      r.schedule.reduce((s, m) => s + m[k], 0);
    expect(r.schedule).toHaveLength(r.months);
    expect(sum("payment")).toBeCloseTo(r.totalPaid, 6);
    expect(sum("interest")).toBeCloseTo(r.totalInterest, 6);
    expect(sum("principal")).toBeCloseTo(3200, 6);
    expect(r.schedule.at(-1)!.balance).toBe(0);
    expect(r.schedule.every((m) => m.payment <= 150 + 1e-9)).toBe(true);
  });

  it("takes one month when the payment covers everything", () => {
    const r = paid(simulatePayoff(5000, 24, { kind: "fixed", amount: 10_000 }));
    expect(r.months).toBe(1);
    // Never more than is owed: the balance plus one month's interest.
    expect(r.totalPaid).toBeCloseTo(5100, 10);
    expect(r.totalInterest).toBeCloseTo(100, 10);
  });

  it("needs a second month when the payment equals the balance but not the interest", () => {
    const r = paid(simulatePayoff(5000, 24, { kind: "fixed", amount: 5000 }));
    expect(r.months).toBe(2);
    expect(r.schedule[1]!.payment).toBeCloseTo(102, 10);
  });

  it("divides evenly at zero APR", () => {
    const even = paid(simulatePayoff(5000, 0, { kind: "fixed", amount: 200 }));
    expect(even.months).toBe(25);
    expect(even.totalInterest).toBe(0);
    expect(even.totalPaid).toBe(5000);

    const uneven = paid(simulatePayoff(5000, 0, { kind: "fixed", amount: 300 }));
    expect(uneven.months).toBe(17);
    expect(uneven.schedule.at(-1)!.payment).toBeCloseTo(200, 10);
  });

  it("settles float dust instead of adding a near-zero last payment", () => {
    const r = paid(simulatePayoff(1000, 0, { kind: "fixed", amount: 1000 / 3 }));
    expect(r.months).toBe(3);
  });
});

describe("simulatePayoff — payments that never clear it", () => {
  it("reports a payment below the interest instead of looping", () => {
    // 24% on 1,000 is 20 a month in interest.
    const r = never(simulatePayoff(1000, 24, { kind: "fixed", amount: 15 }));
    expect(r.reason).toBe("interest");
    expect(r.firstInterest).toBeCloseTo(20, 10);
    expect(r.firstPayment).toBe(15);
  });

  it("treats a payment that only matches the interest as never", () => {
    expect(never(simulatePayoff(1000, 24, { kind: "fixed", amount: 20 })).reason).toBe("interest");
  });

  it("treats a zero payment as never", () => {
    expect(never(simulatePayoff(1000, 0, { kind: "fixed", amount: 0 })).reason).toBe("interest");
  });

  it("gives up at the month cap when progress is too slow", () => {
    const r = never(simulatePayoff(10_000, 24, { kind: "fixed", amount: 200.01 }, 120));
    expect(r.reason).toBe("too-long");
  });

  it("caps at 1,200 months by default", () => {
    expect(MAX_MONTHS).toBe(1200);
    // Just above the 200 interest: falls, but not within 100 years.
    const r = never(simulatePayoff(10_000, 24, { kind: "fixed", amount: 200.000000001 }));
    expect(r.reason).toBe("too-long");
  });

  it("catches a percent-only minimum below the monthly rate", () => {
    // 30% APR is 2.5% a month; a 2% minimum never catches up.
    const r = never(
      simulatePayoff(5000, 30, {
        kind: "minimum",
        rule: { percent: 2, floor: 25, plusInterest: false },
      }),
    );
    expect(r.reason).toBe("interest");
  });
});

describe("simulatePayoff — minimum payments", () => {
  it("takes far longer than a fixed payment", () => {
    const min = paid(simulatePayoff(5000, 22, { kind: "minimum", rule: US_RULE }));
    const fixed = paid(simulatePayoff(5000, 22, { kind: "fixed", amount: 200 }));
    expect(min.months).toBeGreaterThan(fixed.months * 5);
    expect(min.totalInterest).toBeGreaterThan(fixed.totalInterest * 3);
    // First statement: 1% of 5,091.67 plus 91.67 of interest.
    expect(min.firstPayment).toBeCloseTo(0.01 * (5000 + 5000 * 0.22 / 12) + 5000 * 0.22 / 12, 8);
  });

  it("shrinks as the balance shrinks, down to the floor", () => {
    const min = paid(simulatePayoff(5000, 22, { kind: "minimum", rule: US_RULE }));
    const payments = min.schedule.map((m) => m.payment);
    for (let i = 1; i < payments.length - 1; i++) {
      expect(payments[i]!).toBeLessThanOrEqual(payments[i - 1]! + 1e-9);
      expect(payments[i]!).toBeGreaterThanOrEqual(25 - 1e-9);
    }
    // The final payment is whatever was left, which can be under the floor.
    expect(payments.at(-1)!).toBeLessThanOrEqual(25);
  });

  it("pays the floor on a small balance", () => {
    // 1% of 1,000 is 10, so the 25 floor applies every month at 0%: 40 payments.
    const r = paid(
      simulatePayoff(1000, 0, { kind: "minimum", rule: { percent: 1, floor: 25, plusInterest: false } }),
    );
    expect(r.months).toBe(40);
    expect(r.schedule.every((m) => m.payment === 25)).toBe(true);
  });

  it("clears a balance under the floor in one month", () => {
    const r = paid(simulatePayoff(20, 24, { kind: "minimum", rule: US_RULE }));
    expect(r.months).toBe(1);
    expect(r.totalPaid).toBeCloseTo(20.4, 10);
  });

  it("clears it when the percent beats the monthly rate", () => {
    const r = paid(
      simulatePayoff(5000, 22, { kind: "minimum", rule: { percent: 3, floor: 25, plusInterest: false } }),
    );
    expect(r.firstPayment).toBeCloseTo(0.03 * (5000 + 5000 * 0.22 / 12), 8);
    expect(r.months).toBeLessThan(MAX_MONTHS);
  });
});

describe("simulatePayoff — invalid input", () => {
  it("returns null instead of a result", () => {
    const plan = { kind: "fixed", amount: 100 } as const;
    expect(simulatePayoff(0, 20, plan)).toBeNull();
    expect(simulatePayoff(-50, 20, plan)).toBeNull();
    expect(simulatePayoff(Number.NaN, 20, plan)).toBeNull();
    expect(simulatePayoff(1000, -1, plan)).toBeNull();
    expect(simulatePayoff(1000, Infinity, plan)).toBeNull();
    expect(simulatePayoff(1000, 20, { kind: "fixed", amount: -5 })).toBeNull();
    expect(
      simulatePayoff(1000, 20, { kind: "minimum", rule: { percent: -1, floor: 25, plusInterest: true } }),
    ).toBeNull();
  });

  it("copes with huge balances", () => {
    const r = paid(simulatePayoff(1e12, 20, { kind: "fixed", amount: 1e11 }));
    expect(r.months).toBeGreaterThan(10);
    expect(Number.isFinite(r.totalInterest)).toBe(true);
  });
});

describe("paymentForMonths", () => {
  it("clears the balance in exactly that many months", () => {
    const p = paymentForMonths(5000, 22, 36)!;
    const r = paid(simulatePayoff(5000, 22, { kind: "fixed", amount: p }));
    expect(r.months).toBe(36);
    expect(r.schedule.at(-1)!.payment).toBeCloseTo(p, 4);
  });

  it("splits evenly at zero APR", () => {
    expect(paymentForMonths(3600, 0, 36)).toBe(100);
  });

  it("rejects nonsense", () => {
    expect(paymentForMonths(0, 20, 12)).toBeNull();
    expect(paymentForMonths(1000, -2, 12)).toBeNull();
    expect(paymentForMonths(1000, 20, 0)).toBeNull();
    expect(paymentForMonths(1000, 20, 1.5)).toBeNull();
  });
});

describe("yearlySummary", () => {
  it("rolls months up into years that add back to the totals", () => {
    const r = paid(simulatePayoff(5000, 22, { kind: "fixed", amount: 200 }));
    const years = yearlySummary(r.schedule);
    expect(years).toHaveLength(Math.ceil(r.months / 12));
    expect(years.map((y) => y.year)).toEqual([1, 2, 3]);
    expect(years.reduce((s, y) => s + y.paid, 0)).toBeCloseTo(r.totalPaid, 6);
    expect(years.reduce((s, y) => s + y.interest, 0)).toBeCloseTo(r.totalInterest, 6);
    expect(years[0]!.paid).toBeCloseTo(2400, 6);
    expect(years[0]!.balance).toBeCloseTo(r.schedule[11]!.balance, 10);
    expect(years.at(-1)!.balance).toBe(0);
  });

  it("is empty for an empty schedule", () => {
    expect(yearlySummary([])).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("reads months back as years and months", () => {
    expect(formatDuration(34)).toBe("2 years 10 months");
    expect(formatDuration(12)).toBe("1 year");
    expect(formatDuration(13)).toBe("1 year 1 month");
    expect(formatDuration(24)).toBe("2 years");
    expect(formatDuration(1)).toBe("1 month");
    expect(formatDuration(11)).toBe("11 months");
    expect(formatDuration(0)).toBe("0 months");
  });
});
