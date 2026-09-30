import { daysInMonth, parseDate, toISODate } from "@/lib/tools/date-math";
import {
  effectiveMonthlyRate,
  PERIODS_PER_YEAR,
  simulateGrowth,
  type GrowthResult,
  type YearRow,
} from "@/lib/tools/growth";

/**
 * Interest maths for `/tools/simple-interest-calculator` and
 * `/tools/fd-calculator` (fixed and recurring deposits).
 *
 * Rates come in as percentages (`7` for 7%) at the public entry points.
 * Everything is a float — these are estimates — and rounds only for display.
 *
 * Deposits follow Indian bank practice, which is what the FD/RD page is
 * written for (and what most term-deposit maths elsewhere matches anyway):
 *
 * - **Fixed deposits** compound for every *completed* period (a quarter by
 *   default) and earn simple interest for a broken period left over at the
 *   end, as SBI states for its term deposits. A deposit shorter than six
 *   months isn't compounded at all: it earns simple interest, paid at maturity.
 * - **Recurring deposits** use the Indian Banks' Association formula
 *   M = R × ((1 + i)^n − 1) ÷ (1 − (1 + i)^(−1/3)), with i the quarterly rate
 *   and n the number of quarters. That is exactly "each monthly instalment,
 *   paid at the start of its month, compounds quarterly for the time it has
 *   left", so it runs on the shared month-by-month simulation in `growth.ts`.
 */

// ---------------------------------------------------------------------------
// Simple interest
// ---------------------------------------------------------------------------

export type SolveFor = "interest" | "principal" | "rate" | "time";

/** Which figure the visitor already has, when solving for P, R or T: SI itself, or A = P + SI. */
export type Known = "interest" | "amount";

export type TimeUnit = "years" | "months" | "days";

/** Days in a year for a period in days: 365 ("exact" interest, the usual rule) or 360 (banker's rule). */
export type DayBasis = 365 | 360;

/** A span of time as typed, and its size as an exact fraction of a year: `count ÷ per`. */
export type Period = { count: number; unit: TimeUnit; per: number };

/** `count` years, months or days as a `Period`. */
export function toPeriod(count: number, unit: TimeUnit, basis: DayBasis = 365): Period {
  return { count, unit, per: unit === "years" ? 1 : unit === "months" ? 12 : basis };
}

/** A period in years. */
export function periodYears(p: Period): number {
  return p.count / p.per;
}

export type SimpleInterestInput = {
  solveFor: SolveFor;
  /** For principal/rate/time: whether `interest` or `amount` is the given figure. */
  known?: Known;
  principal?: number;
  /** The rate as typed, per `ratePer`. */
  rate?: number;
  ratePer?: "year" | "month";
  /** The time as typed. When solving for time, only its `unit` and `per` matter: they pick the answer's unit. */
  period?: Period;
  interest?: number;
  amount?: number;
};

export type SimpleInterestResult = {
  principal: number;
  /** Per year, as a percentage. */
  ratePercent: number;
  years: number;
  interest: number;
  /** Principal plus interest. */
  amount: number;
};

/** One line of working: what's being done, then the maths, one step per line. */
export type Step = { title: string; lines: string[] };

/** Formats a number for the working, with at most `decimals` decimals. */
export type NumberFormatter = (value: number, decimals: number) => string;

export type SimpleInterestAnswer =
  | { ok: true; result: SimpleInterestResult; steps: Step[] }
  | { ok: false; error: string };

const MONEY_DP = 2;
const RATIO_DP = 4;

/** "= 12" or "≈ 12.35", depending on whether rounding to `decimals` changed the value. */
function equals(value: number, decimals: number, fmt: NumberFormatter): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  const exact = Math.abs(rounded - value) <= Math.abs(value) * 1e-12 + 1e-12;
  return `${exact ? "=" : "≈"} ${fmt(value, decimals)}`;
}

const UNIT_WORD: Record<TimeUnit, [string, string]> = {
  years: ["year", "years"],
  months: ["month", "months"],
  days: ["day", "days"],
};

function unitWord(unit: TimeUnit, n: number): string {
  return UNIT_WORD[unit][n === 1 ? 0 : 1];
}

/**
 * Simple interest, SI = P × R × T ÷ 100, solved for whichever of SI, P, R or
 * T is missing — with the working written out step by step, the way a
 * textbook shows it.
 *
 * A time in months or days is kept as an exact fraction of a year in the
 * working (T = 90 ÷ 365) rather than a rounded decimal, so the answer doesn't
 * drift by a paisa. Returns `ok: false` with a plain-words reason when the
 * inputs have no answer (a zero rate when solving for time, a final amount
 * no bigger than the principal).
 */
export function simpleInterest(input: SimpleInterestInput, fmt: NumberFormatter): SimpleInterestAnswer {
  const { solveFor, known = "interest", ratePer = "year" } = input;
  const steps: Step[] = [];
  const f = (v: number, d = MONEY_DP) => fmt(v, d);

  // The yearly rate, converting a monthly one first.
  let R = input.rate ?? 0;
  if (solveFor !== "rate" && ratePer === "month") {
    const yearly = R * 12;
    steps.push({
      title: "Turn the monthly rate into a yearly one",
      lines: [`R = ${f(R, RATIO_DP)}% × 12 ${equals(yearly, RATIO_DP, fmt)}% a year`],
    });
    R = yearly;
  }

  // The time as a fraction of a year, written the same way.
  const period = input.period ?? toPeriod(1, "years");
  const T = periodYears(period);
  /** "3", or "18 ÷ 12" for a fraction, for substituting into a formula. */
  const tText = period.unit === "years" ? f(period.count, RATIO_DP) : `${f(period.count, RATIO_DP)} ÷ ${period.per}`;
  if (solveFor !== "time" && period.unit !== "years") {
    steps.push({
      title: `Turn the time into years (${period.per} ${unitWord(period.unit, 2)} in a year)`,
      lines: [`T = ${f(period.count, RATIO_DP)} ÷ ${period.per} ${equals(T, RATIO_DP, fmt)} years`],
    });
  }

  // P, R, T and SI, as given or once found.
  let P = input.principal ?? 0;
  let SI = input.interest ?? 0;

  if (solveFor !== "interest" && solveFor !== "principal" && known === "amount") {
    const A = input.amount ?? 0;
    if (A <= P) return { ok: false, error: "The final amount has to be more than the principal." };
    SI = A - P;
    steps.push({
      title: "Find the interest from the final amount",
      lines: [`SI = A − P = ${f(A)} − ${f(P)} ${equals(SI, MONEY_DP, fmt)}`],
    });
  }

  switch (solveFor) {
    case "interest": {
      SI = (P * R * T) / 100;
      const top = P * R * period.count;
      const bottom = 100 * period.per;
      steps.push({
        title: "Put the numbers into SI = P × R × T ÷ 100",
        lines: [
          "SI = P × R × T ÷ 100",
          period.unit === "years"
            ? `= ${f(P)} × ${f(R, RATIO_DP)} × ${tText} ÷ 100`
            : `= ${f(P)} × ${f(R, RATIO_DP)} × ${f(period.count, RATIO_DP)} ÷ (100 × ${period.per})`,
          `= ${f(top, RATIO_DP)} ÷ ${f(bottom, 0)}`,
          `${equals(SI, MONEY_DP, fmt)}`,
        ],
      });
      break;
    }

    case "principal": {
      if (R <= 0) return { ok: false, error: "The rate has to be more than 0 to find the principal." };
      if (T <= 0) return { ok: false, error: "The time has to be more than 0 to find the principal." };
      if (known === "amount") {
        const A = input.amount ?? 0;
        if (A <= 0) return { ok: false, error: "Enter the final amount." };
        const factor = 1 + (R * T) / 100;
        P = A / factor;
        SI = A - P;
        steps.push(
          {
            title: "Find the growth factor: what 1 of principal becomes",
            lines: [
              "1 + R × T ÷ 100",
              period.unit === "years"
                ? `= 1 + ${f(R, RATIO_DP)} × ${tText} ÷ 100`
                : `= 1 + ${f(R, RATIO_DP)} × ${f(period.count, RATIO_DP)} ÷ (100 × ${period.per})`,
              `${equals(factor, 6, fmt)}`,
            ],
          },
          {
            title: "Divide the final amount by it",
            lines: [`P = A ÷ (1 + R × T ÷ 100)`, `= ${f(A)} ÷ ${f(factor, 6)}`, `${equals(P, MONEY_DP, fmt)}`],
          },
          {
            title: "The interest is the difference",
            lines: [`SI = A − P = ${f(A)} − ${f(P)} ${equals(SI, MONEY_DP, fmt)}`],
          },
        );
      } else {
        P = (SI * 100) / (R * T);
        const top = SI * 100 * period.per;
        const bottom = R * period.count;
        steps.push({
          title: "Rearrange the formula for P",
          lines: [
            period.unit === "years" ? "P = SI × 100 ÷ (R × T)" : `P = SI × 100 × ${period.per} ÷ (R × ${unitWord(period.unit, 2)})`,
            period.unit === "years"
              ? `= ${f(SI)} × 100 ÷ (${f(R, RATIO_DP)} × ${tText})`
              : `= ${f(SI)} × 100 × ${period.per} ÷ (${f(R, RATIO_DP)} × ${f(period.count, RATIO_DP)})`,
            `= ${f(top, RATIO_DP)} ÷ ${f(bottom, RATIO_DP)}`,
            `${equals(P, MONEY_DP, fmt)}`,
          ],
        });
      }
      break;
    }

    case "rate": {
      if (P <= 0) return { ok: false, error: "The principal has to be more than 0 to find the rate." };
      if (T <= 0) return { ok: false, error: "The time has to be more than 0 to find the rate." };
      R = (SI * 100) / (P * T);
      const top = SI * 100 * period.per;
      const bottom = P * period.count;
      const lines = [
        period.unit === "years" ? "R = SI × 100 ÷ (P × T)" : `R = SI × 100 × ${period.per} ÷ (P × ${unitWord(period.unit, 2)})`,
        period.unit === "years"
          ? `= ${f(SI)} × 100 ÷ (${f(P)} × ${tText})`
          : `= ${f(SI)} × 100 × ${period.per} ÷ (${f(P)} × ${f(period.count, RATIO_DP)})`,
        `= ${f(top, RATIO_DP)} ÷ ${f(bottom, RATIO_DP)}`,
        `${equals(R, RATIO_DP, fmt)}% a year`,
      ];
      steps.push({ title: "Rearrange the formula for R", lines });
      if (ratePer === "month") {
        steps.push({
          title: "Per month",
          lines: [`${f(R, RATIO_DP)}% ÷ 12 ${equals(R / 12, RATIO_DP, fmt)}% a month`],
        });
      }
      break;
    }

    case "time": {
      if (P <= 0) return { ok: false, error: "The principal has to be more than 0 to find the time." };
      if (R <= 0) return { ok: false, error: "The rate has to be more than 0 to find the time." };
      const years = (SI * 100) / (P * R);
      steps.push({
        title: "Rearrange the formula for T",
        lines: [
          "T = SI × 100 ÷ (P × R)",
          `= ${f(SI)} × 100 ÷ (${f(P)} × ${f(R, RATIO_DP)})`,
          `= ${f(SI * 100, RATIO_DP)} ÷ ${f(P * R, RATIO_DP)}`,
          `${equals(years, RATIO_DP, fmt)} years`,
        ],
      });
      if (period.unit !== "years") {
        steps.push({
          title: `In ${unitWord(period.unit, 2)}`,
          lines: [
            `${f(years, RATIO_DP)} × ${period.per} ${equals(years * period.per, 2, fmt)} ${unitWord(period.unit, 2)}`,
          ],
        });
      }
      const result = { principal: P, ratePercent: R, years, interest: SI, amount: P + SI };
      steps.push(amountStep(result, f, fmt));
      return { ok: true, result, steps };
    }
  }

  const result = { principal: P, ratePercent: R, years: T, interest: SI, amount: P + SI };
  if (!(solveFor === "principal" && known === "amount")) steps.push(amountStep(result, f, fmt));
  return { ok: true, result, steps };
}

function amountStep(
  r: SimpleInterestResult,
  f: (v: number, d?: number) => string,
  fmt: NumberFormatter,
): Step {
  return {
    title: "Add the interest to the principal for the final amount",
    lines: [`A = P + SI = ${f(r.principal)} + ${f(r.interest)} ${equals(r.amount, MONEY_DP, fmt)}`],
  };
}

/**
 * What `principal` grows to over `years` at `ratePercent` compounded once a
 * year — whole years compounded, any part-year left over at simple interest,
 * as a bank pays it. Over a year or less it equals simple interest.
 */
export function compoundedYearly(principal: number, ratePercent: number, years: number): number {
  const r = ratePercent / 100;
  const whole = Math.floor(years + 1e-9);
  const rest = Math.max(0, years - whole);
  return principal * (1 + r) ** whole * (1 + r * rest);
}

// ---------------------------------------------------------------------------
// Fixed and recurring deposits
// ---------------------------------------------------------------------------

/** How a deposit's interest is added: compounded at a frequency, or `simple` (paid out, never compounded). */
export type DepositCompounding = "monthly" | "quarterly" | "half-yearly" | "yearly" | "simple";

/** Below this many months a fixed deposit earns simple interest — Indian banks don't compound it. */
export const SHORT_TENURE_MONTHS = 6;

/** Input bounds for the FD/RD calculator. */
export const DEPOSIT_LIMITS = {
  maxAmount: 1e12,
  maxRate: 50,
  /** 50 years — far past any bank's longest deposit (10 years in India). */
  maxMonths: 600,
} as const;

export type DepositResult = GrowthResult & {
  /** The compounding actually applied (`simple` for a short fixed deposit). */
  compounding: DepositCompounding;
  /** True when a fixed deposit was too short to compound and fell back to simple interest. */
  shortTenure: boolean;
  /** The yearly rate that, compounded once a year, would give the same result — as a percentage. */
  annualYieldPercent: number;
  /** Estimated TDS on the interest, or null when no TDS rate was given. */
  tds: number | null;
  /** Maturity amount less the TDS estimate, or null without one. */
  afterTds: number | null;
};

/**
 * What a lump sum is worth after `months`: every completed compounding period
 * compounded, then simple interest for the broken period left over.
 */
export function lumpSumValue(
  principal: number,
  annualRate: number,
  months: number,
  compounding: DepositCompounding,
): number {
  if (compounding === "simple") return principal * (1 + (annualRate * months) / 12);
  const n = PERIODS_PER_YEAR[compounding];
  const monthsPerPeriod = 12 / n;
  const whole = Math.floor(months / monthsPerPeriod + 1e-9);
  const rest = Math.max(0, months - whole * monthsPerPeriod);
  return principal * (1 + annualRate / n) ** whole * (1 + (annualRate * rest) / 12);
}

/** The year-end rows (and a final part-year row) for a value that's `valueAt(months)`. */
function yearRows(months: number, contributedAt: (m: number) => number, valueAt: (m: number) => number): YearRow[] {
  const rows: YearRow[] = [];
  for (let m = 12; m < months; m += 12) rows.push(row(m, contributedAt(m), valueAt(m)));
  rows.push(row(months, contributedAt(months), valueAt(months)));
  return rows;
}

function row(months: number, contributed: number, balance: number): YearRow {
  return { year: months / 12, months, contributed, interest: balance - contributed, balance, real: null };
}

function withTds(interest: number, balance: number, tdsPercent: number | null | undefined) {
  if (tdsPercent == null) return { tds: null, afterTds: null };
  const tds = Math.max(0, interest) * (tdsPercent / 100);
  return { tds, afterTds: balance - tds };
}

/**
 * A fixed deposit: `principal` left for `months` at `ratePercent` a year.
 * Quarterly compounding is the Indian default; a deposit under six months
 * earns simple interest whatever the compounding says.
 */
export function fixedDeposit({
  principal,
  ratePercent,
  months,
  compounding = "quarterly",
  tdsPercent = null,
}: {
  principal: number;
  ratePercent: number;
  months: number;
  compounding?: DepositCompounding;
  tdsPercent?: number | null;
}): DepositResult {
  const shortTenure = months < SHORT_TENURE_MONTHS && compounding !== "simple";
  const applied: DepositCompounding = months < SHORT_TENURE_MONTHS ? "simple" : compounding;
  const r = ratePercent / 100;
  const valueAt = (m: number) => lumpSumValue(principal, r, m, applied);
  const balance = valueAt(months);
  const interest = balance - principal;
  return {
    months,
    balance,
    contributed: principal,
    interest,
    real: null,
    rows: yearRows(months, () => principal, valueAt),
    compounding: applied,
    shortTenure,
    annualYieldPercent: principal > 0 && months > 0 ? ((balance / principal) ** (12 / months) - 1) * 100 : 0,
    ...withTds(interest, balance, tdsPercent),
  };
}

/**
 * A recurring deposit: `monthly` paid in at the start of every month for
 * `months` months. Compounded deposits follow the IBA formula (see the file
 * comment); `simple` pays each instalment simple interest for the months it
 * has left: R × m + R × r ÷ 12 × m(m + 1) ÷ 2.
 */
export function recurringDeposit({
  monthly,
  ratePercent,
  months,
  compounding = "quarterly",
  tdsPercent = null,
}: {
  monthly: number;
  ratePercent: number;
  months: number;
  compounding?: DepositCompounding;
  tdsPercent?: number | null;
}): DepositResult {
  const r = ratePercent / 100;
  let growth: GrowthResult;
  if (compounding === "simple") {
    const valueAt = (m: number) => monthly * m + ((monthly * r) / 12) * ((m * (m + 1)) / 2);
    const balance = valueAt(months);
    growth = {
      months,
      balance,
      contributed: monthly * months,
      interest: balance - monthly * months,
      real: null,
      rows: yearRows(months, (m) => monthly * m, valueAt),
    };
  } else {
    growth = simulateGrowth({
      initial: 0,
      monthly,
      monthlyRate: effectiveMonthlyRate(r, PERIODS_PER_YEAR[compounding]),
      months,
      timing: "start",
    });
  }
  return {
    ...growth,
    compounding,
    shortTenure: false,
    annualYieldPercent: depositsYield(monthly, months, growth.balance) * 100,
    ...withTds(growth.interest, growth.balance, tdsPercent),
  };
}

/**
 * The effective annual yield of `months` equal deposits, each at the start of
 * its month, that add up to `maturity` at the end: the monthly rate j with
 * R × Σ (1 + j)^k = maturity (k = 1…months), found by bisection, as
 * (1 + j)^12 − 1. For a compounded RD it lands exactly on (1 + r/n)^n − 1.
 */
export function depositsYield(monthly: number, months: number, maturity: number): number {
  if (monthly <= 0 || months <= 0 || maturity <= 0) return 0;
  // Σ (1 + j)^k by Horner's rule: no (x^n − 1) ÷ j, which loses every digit near j = 0.
  const valueAt = (j: number) => {
    let sum = 0;
    for (let k = 0; k < months; k++) sum = (sum + 1) * (1 + j);
    return monthly * sum;
  };
  let lo = -0.99;
  let hi = 1;
  // Widen the bracket for absurd inputs rather than returning a wrong answer.
  while (valueAt(hi) < maturity && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (valueAt(mid) < maturity) lo = mid;
    else hi = mid;
  }
  return (1 + (lo + hi) / 2) ** 12 - 1;
}

/**
 * `date` (`YYYY-MM-DD`) moved on by `months` whole months. A day the target
 * month doesn't have lands on its last day — a deposit opened on 31 January
 * for a month matures on 28 (or 29) February, as a bank's EDATE-style
 * maturity date does. Null for a malformed date or a result past 9999.
 */
export function addMonths(date: string, months: number): string | null {
  const p = parseDate(date);
  if (!p || !Number.isInteger(months)) return null;
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  if (y < 1 || y > 9999) return null;
  return toISODate({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

/** "5 years", "1 year 6 months", "3 months". */
export function tenureLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (y === 0) return part(m, "month");
  return m === 0 ? part(y, "year") : `${part(y, "year")} ${part(m, "month")}`;
}
