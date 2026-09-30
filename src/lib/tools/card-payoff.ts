/**
 * Credit card payoff maths for `/tools/credit-card-payoff-calculator`.
 *
 * A month-by-month simulation rather than the closed-form loan formula,
 * because a card's minimum payment shrinks with the balance — there is no
 * formula for that, only the loop. Each month the balance accrues
 * `balance × APR ÷ 12` of interest and then the payment comes off. Issuers
 * actually charge on the average daily balance, which lands within cents of
 * this for a balance that isn't growing with new purchases.
 *
 * Pure and unit-tested. Invalid inputs return `null`; a payment that can
 * never clear the balance returns a `never` result instead of looping.
 */

/** 100 years. A plan that runs past this isn't a plan. */
export const MAX_MONTHS = 1200;

/**
 * A remainder smaller than this after a payment is treated as paid, so float
 * dust doesn't produce a final "payment" of 0.0000001.
 */
const SETTLE = 0.005;

/** How the card works out its minimum payment each month. */
export type MinimumRule = {
  /** Percent of the balance, e.g. `1` for "1% + interest", `3` for "3% of the balance". */
  percent: number;
  /** The smallest minimum the card asks for, e.g. `25` — unless you owe less. */
  floor: number;
  /** Add the month's interest on top of the percent (the common US "1% + interest"). */
  plusInterest: boolean;
};

export type PaymentPlan =
  | { kind: "fixed"; amount: number }
  | { kind: "minimum"; rule: MinimumRule };

export type PayoffMonth = {
  /** 1-based: month 1 is the first payment. */
  month: number;
  payment: number;
  interest: number;
  /** The part of the payment that reduced the balance. */
  principal: number;
  /** What's left after this month's payment. */
  balance: number;
};

export type Payoff =
  | {
      status: "paid";
      months: number;
      totalInterest: number;
      totalPaid: number;
      /** The first month's payment — for a minimum plan, what the card asks for now. */
      firstPayment: number;
      schedule: PayoffMonth[];
    }
  | {
      status: "never";
      /**
       * `interest`: the payment doesn't beat the interest, so the balance never
       * falls. `too-long`: it falls, but not within `MAX_MONTHS`.
       */
      reason: "interest" | "too-long";
      /** The first month's interest — the payment has to be more than this. */
      firstInterest: number;
      firstPayment: number;
    };

/** One month's interest on `balance` at `aprPercent` a year. */
export function monthlyInterest(balance: number, aprPercent: number): number {
  return (balance * aprPercent) / 100 / 12;
}

/**
 * The card's minimum payment on a statement `balance` that already includes
 * this month's `interest`. Never more than you owe.
 */
export function minimumPayment(balance: number, interest: number, rule: MinimumRule): number {
  const byPercent = (balance * rule.percent) / 100 + (rule.plusInterest ? interest : 0);
  return Math.min(balance, Math.max(rule.floor, byPercent));
}

function validPlan(plan: PaymentPlan): boolean {
  if (plan.kind === "fixed") return Number.isFinite(plan.amount) && plan.amount >= 0;
  const { percent, floor } = plan.rule;
  return Number.isFinite(percent) && percent >= 0 && Number.isFinite(floor) && floor >= 0;
}

/**
 * Pay `balance` down at `aprPercent` a year with `plan`, one month at a time,
 * assuming no new spending on the card.
 */
export function simulatePayoff(
  balance: number,
  aprPercent: number,
  plan: PaymentPlan,
  maxMonths = MAX_MONTHS,
): Payoff | null {
  if (!Number.isFinite(balance) || balance <= 0) return null;
  if (!Number.isFinite(aprPercent) || aprPercent < 0) return null;
  if (!validPlan(plan)) return null;

  const firstInterest = monthlyInterest(balance, aprPercent);
  let firstPayment = 0;
  let owed = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  const schedule: PayoffMonth[] = [];

  for (let month = 1; month <= maxMonths; month++) {
    const interest = monthlyInterest(owed, aprPercent);
    const statement = owed + interest;
    let payment =
      plan.kind === "fixed" ? plan.amount : minimumPayment(statement, interest, plan.rule);
    payment = Math.min(payment, statement);
    if (statement - payment < SETTLE) payment = statement;
    if (month === 1) firstPayment = payment;

    const next = statement - payment;
    // Once a month goes by without the balance falling, none ever will: a fixed
    // payment stays put while the interest grows, and a percent-of-balance
    // minimum grows no faster than the interest does.
    if (next >= owed) {
      return { status: "never", reason: "interest", firstInterest, firstPayment };
    }

    totalInterest += interest;
    totalPaid += payment;
    schedule.push({ month, payment, interest, principal: payment - interest, balance: next });
    owed = next;

    if (owed === 0) {
      return { status: "paid", months: month, totalInterest, totalPaid, firstPayment, schedule };
    }
  }

  return { status: "never", reason: "too-long", firstInterest, firstPayment };
}

/**
 * The fixed monthly payment that clears `balance` in exactly `months` — the
 * standard amortising-payment formula, which matches `simulatePayoff`'s
 * interest-then-payment month.
 */
export function paymentForMonths(balance: number, aprPercent: number, months: number): number | null {
  if (!Number.isFinite(balance) || balance <= 0) return null;
  if (!Number.isFinite(aprPercent) || aprPercent < 0) return null;
  if (!Number.isInteger(months) || months < 1) return null;
  const r = aprPercent / 100 / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

export type PayoffYear = {
  /** 1-based year of the plan, not a calendar year. */
  year: number;
  paid: number;
  interest: number;
  principal: number;
  /** Balance left at the end of this year (or at payoff, in the last one). */
  balance: number;
};

/** A monthly schedule rolled up into years — the table under the result. */
export function yearlySummary(schedule: readonly PayoffMonth[]): PayoffYear[] {
  const years: PayoffYear[] = [];
  for (const m of schedule) {
    const year = Math.ceil(m.month / 12);
    let row = years[year - 1];
    if (!row) {
      row = { year, paid: 0, interest: 0, principal: 0, balance: 0 };
      years.push(row);
    }
    row.paid += m.payment;
    row.interest += m.interest;
    row.principal += m.principal;
    row.balance = m.balance;
  }
  return years;
}

/** `34` → `"2 years 10 months"`, `12` → `"1 year"`, `1` → `"1 month"`. */
export function formatDuration(totalMonths: number): string {
  const months = Math.max(0, Math.round(totalMonths));
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = y === 0 ? "" : `${y} ${y === 1 ? "year" : "years"}`;
  const rest = m === 0 ? "" : `${m} ${m === 1 ? "month" : "months"}`;
  return [years, rest].filter(Boolean).join(" ") || "0 months";
}
