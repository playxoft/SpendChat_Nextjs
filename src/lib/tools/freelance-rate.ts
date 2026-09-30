/**
 * Freelance rate maths for `/tools/freelance-rate-calculator`.
 *
 * Works backwards from the take-home you want to the revenue that pays for
 * it, then spreads that revenue over the hours you can actually bill:
 *
 *   revenue R = expenses + tax + take-home + margin
 *   tax       = t × (R − expenses)      — tax is on profit, margin included
 *   margin    = m × R                   — a share of every invoice you keep
 *
 * which solves to R = (take-home + (1 − t) × expenses) ÷ (1 − t − m). With no
 * margin that's the familiar take-home ÷ (1 − t) + expenses.
 *
 * Rates come in as percentages (`25` for 25%). Everything is a float — the
 * result is a price to quote, not a ledger entry — rounded only for display.
 */

/** Weeks in a year, as freelancers plan it (holidays come off this). */
export const WEEKS_PER_YEAR = 52;

/** Input bounds — wide enough for any real plan, narrow enough to stay finite. */
export const LIMITS = {
  maxAmount: 1e12,
  /** Tax and margin, each and together, must stay under 100% or no revenue is enough. */
  maxPercent: 99,
  /** At least one working week has to be left. */
  maxWeeksOff: WEEKS_PER_YEAR - 1,
  maxHoursPerWeek: 100,
  maxHoursPerDay: 24,
} as const;

export type FreelanceInput = {
  /** What you want to keep each year, after tax. */
  takeHome: number;
  /** Yearly business costs: software, equipment, insurance, accountant… */
  expenses: number;
  /** Overall tax on profit, in percent. */
  taxPercent: number;
  /** Holidays, public holidays and sick days, in weeks. */
  weeksOff: number;
  /** Hours a week you can bill a client for. */
  hoursPerWeek: number;
  /** Share of revenue kept as profit on top of take-home, in percent. */
  marginPercent?: number;
  /** Hours in the working day a day rate buys. */
  hoursPerDay?: number;
};

/** Where a year's revenue goes. The four parts add up to the revenue. */
export type RateSplit = {
  takeHome: number;
  tax: number;
  expenses: number;
  margin: number;
};

export type FreelanceResult = {
  /** Gross revenue needed per year. */
  revenue: number;
  /** Minimum rate per billable hour. */
  hourly: number;
  /** Hourly rate × hours in a working day. */
  daily: number;
  /** Revenue ÷ 12 — what one client paying monthly for all your time would pay. */
  monthly: number;
  workingWeeks: number;
  billableHours: number;
  hoursPerDay: number;
  /** Per year. */
  split: RateSplit;
};

/**
 * The rate that pays for the plan, or null when no rate can: no working weeks
 * or hours left, tax plus margin at 100% or more, or a negative input.
 */
export function freelanceRate({
  takeHome,
  expenses,
  taxPercent,
  weeksOff,
  hoursPerWeek,
  marginPercent = 0,
  hoursPerDay = 8,
}: FreelanceInput): FreelanceResult | null {
  const numbers = [takeHome, expenses, taxPercent, weeksOff, hoursPerWeek, marginPercent, hoursPerDay];
  if (!numbers.every(Number.isFinite) || numbers.some((n) => n < 0)) return null;

  const t = taxPercent / 100;
  const m = marginPercent / 100;
  const workingWeeks = WEEKS_PER_YEAR - weeksOff;
  const billableHours = workingWeeks * hoursPerWeek;
  if (t + m >= 1 || workingWeeks <= 0 || billableHours <= 0 || hoursPerDay <= 0) return null;

  const revenue = (takeHome + (1 - t) * expenses) / (1 - t - m);
  const hourly = revenue / billableHours;

  return {
    revenue,
    hourly,
    daily: hourly * hoursPerDay,
    monthly: revenue / 12,
    workingWeeks,
    billableHours,
    hoursPerDay,
    split: {
      takeHome,
      tax: t * (revenue - expenses),
      expenses,
      margin: m * revenue,
    },
  };
}

/** The split as shares of the revenue, in percent (all zero when there's no revenue). */
export function splitShares(result: FreelanceResult): RateSplit {
  const { split, revenue } = result;
  const share = (v: number) => (revenue > 0 ? (v / revenue) * 100 : 0);
  return {
    takeHome: share(split.takeHome),
    tax: share(split.tax),
    expenses: share(split.expenses),
    margin: share(split.margin),
  };
}
