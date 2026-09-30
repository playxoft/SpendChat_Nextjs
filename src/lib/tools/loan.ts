/**
 * Loan maths shared by `/tools/loan-calculator` (EMI, amortisation schedule,
 * prepayments) and `/tools/loan-comparison-calculator` (offers side by side,
 * fees included).
 *
 * A reducing-balance loan: each month's interest is the yearly rate ÷ 12 on
 * what is still owed, and the fixed instalment (the EMI, or "monthly
 * payment") covers that interest with the rest repaying principal. The
 * closed form is EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1).
 *
 * The schedule itself runs in the currency's minor units and rounds the way
 * lenders do — the instalment and each month's interest to the cent (paisa,
 * penny) — with the last payment adjusted so the balance lands on exactly
 * zero. That is what makes every column add up: the principal column sums to
 * the loan to the cent, and interest + principal is the payment on every row,
 * so a downloaded schedule checks out in a spreadsheet.
 *
 * Rates come in as yearly percentages (`8.5` for 8.5%). Amounts come in and go
 * out in major units (rupees, dollars); the minor units stay inside.
 */

/** Input bounds for both calculators — wide enough for any real loan, narrow enough to stay exact. */
export const LOAN_LIMITS = {
  maxAmount: 1e12,
  maxRate: 100,
  /** 50 years. */
  maxMonths: 600,
} as const;

// ---------------------------------------------------------------------------
// The instalment
// ---------------------------------------------------------------------------

/**
 * The fixed monthly instalment that repays `principal` over `months` at
 * `ratePercent` a year: P × r × (1 + r)^n ÷ ((1 + r)^n − 1), with r the
 * monthly rate. At 0% it is simply P ÷ n.
 *
 * Unrounded — the schedule rounds it to the currency's minor unit.
 */
export function emi(principal: number, ratePercent: number, months: number): number {
  if (!(months >= 1)) return principal;
  const r = ratePercent / 1200;
  if (r === 0) return principal / months;
  // (1 + r)^n − 1 via expm1/log1p, so a tiny rate doesn't lose its digits.
  const grown = Math.expm1(months * Math.log1p(r));
  return (principal * r * (grown + 1)) / grown;
}

// ---------------------------------------------------------------------------
// Prepayments
// ---------------------------------------------------------------------------

/**
 * An extra payment towards principal, made straight after that month's EMI.
 *
 * - `once` — a lump sum with the EMI of `month` (1 = the first EMI).
 * - `monthly` — every month, from `from` (default the first).
 * - `yearly` — every 12 months, from `from` (default the 12th EMI, a year in).
 */
export type Prepayment =
  | { kind: "once"; month: number; amount: number }
  | { kind: "monthly"; amount: number; from?: number }
  | { kind: "yearly"; amount: number; from?: number };

/**
 * What a prepayment buys: `tenure` keeps the EMI and ends the loan sooner (the
 * lender's default, and the bigger interest saving); `emi` keeps the end date
 * and lowers the instalment instead.
 */
export type PrepaymentMode = "tenure" | "emi";

/** Whether prepayment `p` falls due with the EMI of `month`. */
export function prepaymentDue(p: Prepayment, month: number): boolean {
  if (!(p.amount > 0)) return false;
  switch (p.kind) {
    case "once":
      return month === p.month;
    case "monthly":
      return month >= (p.from ?? 1);
    case "yearly": {
      const from = p.from ?? 12;
      return month >= from && (month - from) % 12 === 0;
    }
  }
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

export type LoanRow = {
  /** 1 for the first EMI. */
  month: number;
  /** The instalment paid this month (the last one is adjusted to clear the loan). */
  payment: number;
  interest: number;
  /** The part of the instalment that repaid principal. */
  principal: number;
  /** Extra principal paid on top of the instalment. */
  prepayment: number;
  /** Still owed after this month's payment and prepayment. */
  balance: number;
};

export type LoanSchedule = {
  /** The first month's instalment. */
  emi: number;
  /** The instalment in force at the end — lower than `emi` after prepayments in `emi` mode. */
  lastEmi: number;
  /** Months until the balance reached zero. */
  months: number;
  totalInterest: number;
  totalPrepaid: number;
  /** Every instalment and prepayment: the loan plus all its interest. */
  totalPaid: number;
  rows: LoanRow[];
};

export type LoanInput = {
  principal: number;
  ratePercent: number;
  /** Whole months, 1 to `LOAN_LIMITS.maxMonths`. */
  months: number;
  prepayments?: readonly Prepayment[];
  mode?: PrepaymentMode;
  /** The currency's minor-unit decimals (2 for most, 0 for JPY). */
  decimals?: number;
};

/** The month-by-month amortisation schedule. */
export function amortize({
  principal,
  ratePercent,
  months,
  prepayments = [],
  mode = "tenure",
  decimals = 2,
}: LoanInput): LoanSchedule {
  const scale = 10 ** decimals;
  const r = ratePercent / 1200;
  const n = Math.max(1, Math.round(months));
  // Never below one minor unit, or a tiny loan would never move.
  const instalment = (owed: number, left: number) => Math.max(1, Math.round(emi(owed, ratePercent, left)));

  let balance = Math.round(principal * scale);
  let payment = instalment(balance, n);
  const firstEmi = payment;
  let totalInterest = 0;
  let totalPrepaid = 0;
  let totalPaid = 0;
  const rows: LoanRow[] = [];

  for (let m = 1; m <= n && balance > 0; m++) {
    const interest = Math.round(balance * r);
    let paid = payment;
    let repaid = payment - interest;
    // The last month — scheduled, or reached early — clears whatever is left,
    // which absorbs every rounding cent along the way.
    if (m === n || repaid >= balance) {
      repaid = balance;
      paid = balance + interest;
    }
    balance -= repaid;

    let extra = 0;
    if (balance > 0) {
      for (const p of prepayments) {
        if (prepaymentDue(p, m)) extra += Math.round(p.amount * scale);
      }
      extra = Math.min(extra, balance);
      balance -= extra;
      // Same end date, smaller instalment: re-spread what's left over the months left.
      if (extra > 0 && mode === "emi" && balance > 0 && m < n) payment = instalment(balance, n - m);
    }

    totalInterest += interest;
    totalPrepaid += extra;
    totalPaid += paid + extra;
    rows.push({
      month: m,
      payment: paid / scale,
      interest: interest / scale,
      principal: repaid / scale,
      prepayment: extra / scale,
      balance: balance / scale,
    });
  }

  return {
    emi: firstEmi / scale,
    lastEmi: payment / scale,
    months: rows.length,
    totalInterest: totalInterest / scale,
    totalPrepaid: totalPrepaid / scale,
    totalPaid: totalPaid / scale,
    rows,
  };
}

export type LoanPlan = LoanSchedule & {
  /** The same loan with no prepayments — what the savings are measured against. */
  baseline: LoanSchedule;
  interestSaved: number;
  monthsSaved: number;
};

/** The schedule with prepayments, next to the one without them. */
export function loanPlan(input: LoanInput): LoanPlan {
  const baseline = amortize({ ...input, prepayments: [] });
  const plan = input.prepayments?.some((p) => p.amount > 0) ? amortize(input) : baseline;
  return {
    ...plan,
    baseline,
    interestSaved: Math.max(0, round(baseline.totalInterest - plan.totalInterest, input.decimals ?? 2)),
    monthsSaved: Math.max(0, baseline.months - plan.months),
  };
}

/** `v` on the minor unit — sums of cent amounts drift in binary. */
function round(v: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(v * scale) / scale;
}

// ---------------------------------------------------------------------------
// Dates and the yearly view
// ---------------------------------------------------------------------------

/**
 * A calendar month as one number — year × 12 + month (0-based) — so "the
 * 14th EMI" is simply `start + 13`.
 */
export type MonthIndex = number;

/** `2026-11-05` (or `2026-11`) → the index of November 2026; null for anything else. */
export function monthIndexFromIso(iso: string): MonthIndex | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(iso.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + month - 1;
}

/** The index back as `2026-11` — how dates travel in the CSV. */
export function monthIndexToIso(index: MonthIndex): string {
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

export type LoanYear = {
  /** The calendar year, or the loan year (1, 2, …) without a start date. */
  year: number;
  /** First and last EMI numbers in this year. */
  fromMonth: number;
  toMonth: number;
  payment: number;
  interest: number;
  principal: number;
  prepayment: number;
  /** Still owed at the end of the year. */
  balance: number;
};

/**
 * The schedule summed by year. With the month of the first EMI, years are
 * calendar years (the first and last usually partial) — the way a tax year or
 * an annual statement counts them; without it, loan years of 12 EMIs each.
 */
export function yearlySchedule(
  rows: readonly LoanRow[],
  start: MonthIndex | null = null,
  decimals = 2,
): LoanYear[] {
  const years: LoanYear[] = [];
  for (const row of rows) {
    const year = start === null ? Math.ceil(row.month / 12) : Math.floor((start + row.month - 1) / 12);
    let bucket = years.at(-1);
    if (!bucket || bucket.year !== year) {
      bucket = {
        year,
        fromMonth: row.month,
        toMonth: row.month,
        payment: 0,
        interest: 0,
        principal: 0,
        prepayment: 0,
        balance: row.balance,
      };
      years.push(bucket);
    }
    bucket.toMonth = row.month;
    bucket.payment += row.payment;
    bucket.interest += row.interest;
    bucket.principal += row.principal;
    bucket.prepayment += row.prepayment;
    bucket.balance = row.balance;
  }
  for (const y of years) {
    y.payment = round(y.payment, decimals);
    y.interest = round(y.interest, decimals);
    y.principal = round(y.principal, decimals);
    y.prepayment = round(y.prepayment, decimals);
  }
  return years;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * The month-by-month schedule as CSV — plain numbers with the currency in the
 * headers, so it opens cleanly in any spreadsheet whatever the locale.
 */
export function monthlyCsv(
  rows: readonly LoanRow[],
  { currency, start = null, decimals = 2 }: { currency: string; start?: MonthIndex | null; decimals?: number },
): string {
  const withPrepay = rows.some((r) => r.prepayment > 0);
  const header = [
    "Month",
    ...(start === null ? [] : ["Date"]),
    `Payment (${currency})`,
    `Principal (${currency})`,
    `Interest (${currency})`,
    ...(withPrepay ? [`Prepayment (${currency})`] : []),
    `Balance (${currency})`,
  ];
  const lines = rows.map((r) =>
    [
      String(r.month),
      ...(start === null ? [] : [monthIndexToIso(start + r.month - 1)]),
      r.payment.toFixed(decimals),
      r.principal.toFixed(decimals),
      r.interest.toFixed(decimals),
      ...(withPrepay ? [r.prepayment.toFixed(decimals)] : []),
      r.balance.toFixed(decimals),
    ].join(","),
  );
  return toCsv(header, lines);
}

/** The yearly summary as CSV, headed "Year" (calendar) or "Loan year". */
export function yearlyCsv(
  years: readonly LoanYear[],
  { currency, calendar, decimals = 2 }: { currency: string; calendar: boolean; decimals?: number },
): string {
  const withPrepay = years.some((y) => y.prepayment > 0);
  const header = [
    calendar ? "Year" : "Loan year",
    `Payments (${currency})`,
    `Principal (${currency})`,
    `Interest (${currency})`,
    ...(withPrepay ? [`Prepayments (${currency})`] : []),
    `Balance (${currency})`,
  ];
  const lines = years.map((y) =>
    [
      String(y.year),
      y.payment.toFixed(decimals),
      y.principal.toFixed(decimals),
      y.interest.toFixed(decimals),
      ...(withPrepay ? [y.prepayment.toFixed(decimals)] : []),
      y.balance.toFixed(decimals),
    ].join(","),
  );
  return toCsv(header, lines);
}

function toCsv(header: string[], lines: string[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Comparing offers
// ---------------------------------------------------------------------------

/** A processing fee as a percentage of the loan, or a fixed amount. */
export type Fee = { kind: "percent" | "fixed"; value: number };

export type LoanOffer = {
  amount: number;
  ratePercent: number;
  months: number;
  processingFee: Fee;
  /** Anything else charged up front — documentation, valuation, legal. */
  otherCharges: number;
};

export type OfferCost = {
  emi: number;
  months: number;
  totalInterest: number;
  /** Processing fee plus other charges. */
  fees: number;
  /** What borrowing costs: interest plus fees. The figure offers are ranked on. */
  totalCost: number;
  /** Everything handed to the lender: the loan, its interest and the fees. */
  totalPaid: number;
  /**
   * The yearly rate once fees are counted (APR): the rate at which the
   * instalments repay only what actually reached you — the loan minus the
   * fees. Null when the fees swallow the whole loan.
   */
  effectiveRate: number | null;
};

/** The processing fee on `amount`, rounded to the minor unit. */
export function processingFee(amount: number, fee: Fee, decimals = 2): number {
  return fee.kind === "percent" ? round((amount * fee.value) / 100, decimals) : fee.value;
}

/** One offer's EMI, interest, fees and true cost. */
export function offerCost(offer: LoanOffer, decimals = 2): OfferCost {
  const schedule = amortize({
    principal: offer.amount,
    ratePercent: offer.ratePercent,
    months: offer.months,
    decimals,
  });
  const fees = round(processingFee(offer.amount, offer.processingFee, decimals) + offer.otherCharges, decimals);
  return {
    emi: schedule.emi,
    months: schedule.months,
    totalInterest: schedule.totalInterest,
    fees,
    totalCost: round(schedule.totalInterest + fees, decimals),
    totalPaid: round(schedule.totalPaid + fees, decimals),
    effectiveRate:
      fees > 0
        ? effectiveRate(
            offer.amount - fees,
            schedule.rows.map((r) => r.payment),
          )
        : offer.ratePercent,
  };
}

/**
 * The yearly rate (monthly rate × 12, the way an APR is quoted) at which
 * `payments` — one a month, the first a month from now — are worth exactly
 * `received` today. Found by bisection: the present value only falls as the
 * rate rises, so the answer is bracketed and can't be missed.
 */
export function effectiveRate(received: number, payments: readonly number[]): number | null {
  if (!(received > 0) || payments.length === 0) return null;
  const presentValue = (i: number) => {
    let pv = 0;
    let discount = 1;
    for (const p of payments) {
      discount /= 1 + i;
      pv += p * discount;
    }
    return pv;
  };
  // Paying back no more than you received is a rate of zero or less — not a
  // case a fee can produce, and not one worth a negative APR.
  if (presentValue(0) <= received) return 0;
  let lo = 0;
  let hi = 0.1;
  while (presentValue(hi) > received) {
    hi *= 2;
    if (hi > 100) return null;
  }
  for (let k = 0; k < 200 && hi - lo > 1e-12; k++) {
    const mid = (lo + hi) / 2;
    if (presentValue(mid) > received) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

/**
 * The cheapest of the offers that could be worked out (nulls are skipped),
 * by total cost. `tie` when the best two are within a minor unit — then no
 * offer should be called the winner. Null with fewer than two to compare.
 */
export function cheapestOffer(
  costs: readonly (OfferCost | null)[],
  decimals = 2,
): { index: number; tie: boolean } | null {
  const ranked = costs
    .map((c, index) => (c ? { index, cost: c.totalCost } : null))
    .filter((c): c is { index: number; cost: number } => c !== null)
    .sort((a, b) => a.cost - b.cost || a.index - b.index);
  if (ranked.length < 2) return null;
  const [best, next] = ranked as [(typeof ranked)[0], (typeof ranked)[0]];
  return { index: best.index, tie: next.cost - best.cost < 1 / 10 ** decimals - 1e-9 };
}
