import { parseNumber } from "@/lib/tools/format";

/**
 * Savings-growth maths shared by `/tools/compound-interest-calculator` and
 * `/tools/sip-calculator`.
 *
 * Both run the same month-by-month simulation rather than a closed-form
 * formula: one loop handles a lump sum, monthly deposits at either end of the
 * month, any compounding frequency and a yearly step-up, and it hands back the
 * year-by-year schedule for free. The closed forms are still the reference —
 * the unit tests hold the loop to them wherever one exists.
 *
 * Rates come in as percentages (`7` for 7%) at the public entry points and
 * as ratios (`0.07`) inside. Everything is a float: these are projections, so
 * they round only for display.
 */

/** Deposits land at the start of each month (SIP convention) or the end (bank convention). */
export type DepositTiming = "start" | "end";

export type Compounding = "daily" | "monthly" | "quarterly" | "half-yearly" | "yearly";

/** Compounding periods per year. Daily uses 365, as banks quoting a daily rate do. */
export const PERIODS_PER_YEAR: Record<Compounding, number> = {
  daily: 365,
  monthly: 12,
  quarterly: 4,
  "half-yearly": 2,
  yearly: 1,
};

/** Input bounds for both calculators — wide enough for any real plan, narrow enough to stay finite. */
export const LIMITS = {
  minYears: 1,
  maxYears: 100,
  minRate: -50,
  maxRate: 100,
  maxAmount: 1e12,
} as const;

export type YearRow = {
  /** Years elapsed at this row — whole, except a final part-year (2.5). */
  year: number;
  /** Months elapsed at this row. */
  months: number;
  /** Lump sum plus every deposit so far. */
  contributed: number;
  /** Growth so far: balance minus contributed (negative at a negative rate). */
  interest: number;
  balance: number;
  /** The balance in today's money, when an inflation rate was given. */
  real: number | null;
};

export type GrowthResult = {
  months: number;
  balance: number;
  contributed: number;
  interest: number;
  /** Final balance in today's money, or null without an inflation rate. */
  real: number | null;
  /** One row per year, plus a final row for any part-year. */
  rows: YearRow[];
};

export type GrowthInput = {
  /** Lump sum invested at month 0. */
  initial: number;
  /** Deposit per month in the first year. */
  monthly: number;
  /** Growth per month, as a ratio (0.01 = 1%). */
  monthlyRate: number;
  /** Whole months to run. */
  months: number;
  timing: DepositTiming;
  /** Yearly rise in the monthly deposit, as a ratio; applied every 12 months. */
  stepUp?: number;
  /** Yearly inflation as a ratio, for the today's-money figures. Null to skip. */
  inflation?: number | null;
};

/**
 * The monthly rate equivalent to `annualRate` (a ratio) compounded
 * `periodsPerYear` times a year: (1 + r/n)^(n/12) − 1.
 *
 * Converting the rate — instead of moving deposits onto the compounding
 * schedule — is what lets monthly deposits work with any frequency: a quarterly
 * account grows each month by exactly the amount that compounds to its quoted
 * quarterly rate.
 */
export function effectiveMonthlyRate(annualRate: number, periodsPerYear: number): number {
  return (1 + annualRate / periodsPerYear) ** (periodsPerYear / 12) - 1;
}

/** Deflates `amount` received `months` from now into today's money. */
export function inTodaysMoney(amount: number, inflation: number, months: number): number {
  return amount / (1 + inflation) ** (months / 12);
}

/** The month-by-month simulation both calculators run. */
export function simulateGrowth({
  initial,
  monthly,
  monthlyRate,
  months,
  timing,
  stepUp = 0,
  inflation = null,
}: GrowthInput): GrowthResult {
  let balance = initial;
  let contributed = initial;
  const rows: YearRow[] = [];

  for (let m = 0; m < months; m++) {
    // The deposit rises once every 12 months: year 1 at the base amount,
    // year 2 at base × (1 + step-up), and so on.
    const deposit = monthly * (1 + stepUp) ** Math.floor(m / 12);
    if (timing === "start") {
      balance += deposit;
      contributed += deposit;
    }
    balance *= 1 + monthlyRate;
    if (timing === "end") {
      balance += deposit;
      contributed += deposit;
    }

    const elapsed = m + 1;
    if (elapsed % 12 === 0 || elapsed === months) {
      rows.push({
        year: elapsed / 12,
        months: elapsed,
        contributed,
        interest: balance - contributed,
        balance,
        real: inflation === null ? null : inTodaysMoney(balance, inflation, elapsed),
      });
    }
  }

  return {
    months,
    balance,
    contributed,
    interest: balance - contributed,
    real: inflation === null ? null : inTodaysMoney(balance, inflation, months),
    rows,
  };
}

/** A period in years (decimals allowed) as whole months — 2.5 years is 30. */
export function yearsToMonths(years: number): number {
  return Math.round(years * 12);
}

/**
 * Compound interest on a lump sum plus monthly deposits, at a rate
 * compounded `compounding` times a year. Deposits default to the end of the
 * month, which is how savings accounts and most compound interest
 * calculators count them.
 */
export function compoundInterest({
  principal,
  monthly,
  ratePercent,
  years,
  compounding,
  timing = "end",
  inflationPercent = null,
}: {
  principal: number;
  monthly: number;
  ratePercent: number;
  years: number;
  compounding: Compounding;
  timing?: DepositTiming;
  inflationPercent?: number | null;
}): GrowthResult {
  return simulateGrowth({
    initial: principal,
    monthly,
    monthlyRate: effectiveMonthlyRate(ratePercent / 100, PERIODS_PER_YEAR[compounding]),
    months: yearsToMonths(years),
    timing,
    inflation: inflationPercent === null ? null : inflationPercent / 100,
  });
}

/**
 * A SIP (systematic investment plan): the same amount invested every month.
 *
 * Follows the convention Indian SIP calculators and fund houses use, so the
 * numbers match what people compare against: a monthly rate of annual ÷ 12,
 * and each instalment invested at the *start* of its month —
 * FV = P × ((1 + i)^n − 1) ÷ i × (1 + i).
 */
export function sipGrowth({
  monthly,
  returnPercent,
  years,
  stepUpPercent = 0,
  inflationPercent = null,
}: {
  monthly: number;
  returnPercent: number;
  years: number;
  stepUpPercent?: number;
  inflationPercent?: number | null;
}): GrowthResult {
  return simulateGrowth({
    initial: 0,
    monthly,
    monthlyRate: returnPercent / 100 / 12,
    months: yearsToMonths(years),
    timing: "start",
    stepUp: stepUpPercent / 100,
    inflation: inflationPercent === null ? null : inflationPercent / 100,
  });
}

// ---------------------------------------------------------------------------
// Reading the form
// ---------------------------------------------------------------------------

export type FieldRead = { value: number | null; error: string | null };

/**
 * One form field as a number, with the message to show under it when it's
 * missing or out of range. `blank` is what an empty optional field means —
 * 0 for "Initial amount", null for "Inflation rate" (skip it).
 */
export function readField(
  raw: string,
  locale: string,
  {
    min,
    max,
    blank,
    required,
    range,
  }: {
    min: number;
    max: number;
    /** Value for an empty field; ignored when `required` is set. */
    blank?: number | null;
    /** Message for an empty field that must be filled in. */
    required?: string;
    /** Message when the number is outside min..max (a function to vary it by side). */
    range: string | ((n: number) => string);
  },
): FieldRead {
  if (!raw.trim()) {
    return required ? { value: null, error: required } : { value: blank ?? null, error: null };
  }
  const n = parseNumber(raw, locale);
  if (n === null) return { value: null, error: "That doesn't look like a number." };
  if (n < min || n > max) return { value: null, error: typeof range === "string" ? range : range(n) };
  return { value: n, error: null };
}

/** The out-of-range message for a money field. */
export function amountRangeError(n: number): string {
  return n < 0 ? "Can't be negative." : "That's more than this calculator can handle.";
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** A year as the table shows it: 10, or 2.5 for a part-year. */
export function formatYear(months: number): string {
  const years = months / 12;
  return Number.isInteger(years) ? String(years) : String(Math.round(years * 100) / 100);
}

/**
 * The year-by-year schedule as CSV — plain numbers (no symbols or grouping),
 * so it opens cleanly in any spreadsheet whatever the visitor's locale. The
 * currency goes in the headers instead.
 */
export function scheduleCsv(
  rows: YearRow[],
  {
    currency,
    contributedLabel = "Contributed",
    interestLabel = "Interest",
    balanceLabel = "Balance",
  }: {
    currency: string;
    contributedLabel?: string;
    interestLabel?: string;
    balanceLabel?: string;
  },
): string {
  const withReal = rows.some((r) => r.real !== null);
  const header = [
    "Year",
    `${contributedLabel} (${currency})`,
    `${interestLabel} (${currency})`,
    `${balanceLabel} (${currency})`,
    ...(withReal ? [`In today's money (${currency})`] : []),
  ];
  const lines = rows.map((r) =>
    [
      formatYear(r.months),
      r.contributed.toFixed(2),
      r.interest.toFixed(2),
      r.balance.toFixed(2),
      ...(withReal ? [(r.real ?? 0).toFixed(2)] : []),
    ].join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
