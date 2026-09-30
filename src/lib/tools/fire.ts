import { effectiveMonthlyRate } from "@/lib/tools/growth";

/**
 * FIRE (financial independence, retire early) maths for `/tools/fire-calculator`.
 *
 * Everything runs in today's money: the return is a *real* return (after
 * inflation), and the spending is today's spending, so the FIRE number never
 * has to be inflated and an answer like "age 46" needs no footnote about
 * future prices. The path is a month-by-month simulation — savings added at
 * the end of each month, growth compounding monthly at the rate equivalent to
 * the yearly return — and the unit tests hold it to the closed forms.
 *
 * Projections, so floats throughout; they round only for display.
 */

export const FIRE_LIMITS = {
  maxAmount: 1e12,
  minReturn: -20,
  maxReturn: 30,
  minWithdrawal: 1,
  maxWithdrawal: 10,
  minAge: 0,
  maxAge: 90,
  /** Paths stop here: financial independence any later isn't a plan. */
  horizonAge: 100,
} as const;

/**
 * Lean and Fat FIRE have no official line — the terms mean "a frugal budget"
 * and "a comfortable one". This calculator reads them as 70% and 150% of the
 * spending entered, and the page says so.
 */
export const VARIANTS = [
  { id: "lean", label: "Lean FIRE", factor: 0.7 },
  { id: "regular", label: "FIRE", factor: 1 },
  { id: "fat", label: "Fat FIRE", factor: 1.5 },
] as const;

export type VariantId = (typeof VARIANTS)[number]["id"];

/** The FIRE number: what you need invested so that `withdrawalPercent` of it pays a year's spending. */
export function fireNumber(annualSpend: number, withdrawalPercent: number): number {
  return annualSpend / (withdrawalPercent / 100);
}

/** How many years of spending the FIRE number is: 25× at 4%. */
export function spendingMultiple(withdrawalPercent: number): number {
  return 100 / withdrawalPercent;
}

/** The monthly growth rate that compounds to `returnPercent` a year. */
export function monthlyRate(returnPercent: number): number {
  return effectiveMonthlyRate(returnPercent / 100, 1);
}

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

export type PathRow = {
  /** Months from today — 0 is today. */
  months: number;
  /** Invested today plus everything saved since. */
  contributed: number;
  /** Balance minus contributed (negative after losses). */
  growth: number;
  balance: number;
};

export type PathInput = {
  initial: number;
  monthly: number;
  monthlyRate: number;
  /** Months to run. */
  months: number;
  /** Stop saving after this many months (Coast FIRE); defaults to saving the whole way. */
  saveMonths?: number;
};

/**
 * Month-by-month growth, one row for today, one per year, and a final row for
 * a part-year. The saving goes in at the end of each month.
 */
export function simulatePath({ initial, monthly, monthlyRate: i, months, saveMonths = months }: PathInput): PathRow[] {
  let balance = initial;
  let contributed = initial;
  const rows: PathRow[] = [{ months: 0, contributed, growth: 0, balance }];
  for (let m = 1; m <= months; m++) {
    balance *= 1 + i;
    if (m <= saveMonths) {
      balance += monthly;
      contributed += monthly;
    }
    if (m % 12 === 0 || m === months) rows.push({ months: m, contributed, growth: balance - contributed, balance });
  }
  return rows;
}

/**
 * The first whole month in which the balance reaches `target` — 0 if it
 * already has — or null if it doesn't within `maxMonths`.
 */
export function monthsToReach({
  initial,
  monthly,
  monthlyRate: i,
  target,
  maxMonths,
}: {
  initial: number;
  monthly: number;
  monthlyRate: number;
  target: number;
  maxMonths: number;
}): number | null {
  if (initial >= target) return 0;
  let balance = initial;
  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + i) + monthly;
    if (balance >= target) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Years to FIRE
// ---------------------------------------------------------------------------

export type FireInput = {
  /** A year's spending in retirement, in today's money. */
  annualSpend: number;
  withdrawalPercent: number;
  /** Invested today. */
  invested: number;
  /** Saved and invested every month from now on. */
  monthlySaving: number;
  /** Expected yearly return after inflation. */
  returnPercent: number;
  /** Age today (decimals allowed). */
  age: number;
};

export type FirePlan = {
  /** The FIRE number. */
  target: number;
  /** Invested today as a percentage of the FIRE number — past 100 once you're there. */
  progress: number;
  /** Months until the FIRE number: 0 = already there, null = not before `horizonAge`. */
  months: number | null;
  /** Age on reaching it, or null. */
  fireAge: number | null;
  /** Today to the FIRE month — or to `horizonAge` when it's never reached. */
  path: PathRow[];
};

/** Months from `age` to the horizon age — at least one year. */
export function horizonMonths(age: number): number {
  return Math.max(12, Math.floor((FIRE_LIMITS.horizonAge - age) * 12));
}

export function firePlan(input: FireInput): FirePlan {
  const target = fireNumber(input.annualSpend, input.withdrawalPercent);
  const i = monthlyRate(input.returnPercent);
  const maxMonths = horizonMonths(input.age);
  const months = monthsToReach({
    initial: input.invested,
    monthly: input.monthlySaving,
    monthlyRate: i,
    target,
    maxMonths,
  });
  return {
    target,
    progress: target > 0 ? (input.invested / target) * 100 : 100,
    months,
    fireAge: months === null ? null : input.age + months / 12,
    path: simulatePath({
      initial: input.invested,
      monthly: input.monthlySaving,
      monthlyRate: i,
      months: months ?? maxMonths,
    }),
  };
}

/** The plan at 70%, 100% and 150% of the spending. */
export function fireVariants(input: FireInput): { id: VariantId; label: string; factor: number; annualSpend: number; plan: FirePlan }[] {
  return VARIANTS.map((v) => {
    const annualSpend = input.annualSpend * v.factor;
    return { id: v.id, label: v.label, factor: v.factor, annualSpend, plan: firePlan({ ...input, annualSpend }) };
  });
}

// ---------------------------------------------------------------------------
// Coast FIRE
// ---------------------------------------------------------------------------

export type CoastInput = FireInput & {
  /** The age by which growth alone should reach the FIRE number. */
  retireAge: number;
};

export type CoastPlan = {
  target: number;
  /** What you need invested today for growth alone to reach the target by `retireAge`. */
  coastNumber: number;
  /** Invested today is at least the Coast FIRE number. */
  reached: boolean;
  /** How far short of the Coast FIRE number you are today (0 once reached). */
  gap: number;
  /** Invested today as a percentage of the Coast FIRE number. */
  progress: number;
  /** Months from today to `retireAge`. */
  monthsToRetire: number;
  /**
   * Months of saving before you can stop and still reach the target by
   * `retireAge`: 0 when you're already coasting, null when even saving the
   * whole way falls short.
   */
  saveMonths: number | null;
  /** If you stop saving today: what you'd have at `retireAge`. */
  coastingNow: number;
  /** Months until growth alone gets today's balance to the target, or null if not by `retireAge`. */
  coastMonths: number | null;
  /** Saving until `saveMonths` (or the whole way), then coasting, up to `retireAge`. */
  path: PathRow[];
};

/** The amount that grows to `target` in `months` at monthly rate `i`, with nothing added. */
export function coastNumber(target: number, i: number, months: number): number {
  return target / (1 + i) ** months;
}

export function coastPlan(input: CoastInput): CoastPlan {
  const target = fireNumber(input.annualSpend, input.withdrawalPercent);
  const i = monthlyRate(input.returnPercent);
  const n = Math.max(0, Math.round((input.retireAge - input.age) * 12));
  const coast = coastNumber(target, i, n);
  const growth = (1 + i) ** n;

  // The first month whose balance, left alone, grows to the target by
  // retirement. Compared as balance × growth-to-come against the target —
  // the same test as balance ≥ coast number for that month — with a hair of
  // tolerance so a balance that lands exactly on it isn't lost to rounding.
  let saveMonths: number | null = null;
  let balance = input.invested;
  for (let m = 0; m <= n; m++) {
    if (m > 0) balance = balance * (1 + i) + input.monthlySaving;
    if (balance * (1 + i) ** (n - m) >= target * (1 - 1e-12)) {
      saveMonths = m;
      break;
    }
  }

  const coastingNow = input.invested * growth;
  const coastMonths = monthsToReach({ initial: input.invested, monthly: 0, monthlyRate: i, target, maxMonths: n });

  return {
    target,
    coastNumber: coast,
    reached: saveMonths === 0,
    gap: Math.max(0, coast - input.invested),
    progress: coast > 0 ? (input.invested / coast) * 100 : 100,
    monthsToRetire: n,
    saveMonths,
    coastingNow,
    coastMonths,
    path: simulatePath({
      initial: input.invested,
      monthly: input.monthlySaving,
      monthlyRate: i,
      months: n,
      saveMonths: saveMonths ?? n,
    }),
  };
}

// ---------------------------------------------------------------------------
// Dates and durations
// ---------------------------------------------------------------------------

/** The month that is `months` after `today` (`YYYY-MM-DD`), as a year and a 1–12 month. */
export function monthAfter(today: string, months: number): { year: number; month: number } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "16 years 9 months", "1 year", "5 months" — a duration in whole months, in words. */
export function durationLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = y === 1 ? "1 year" : `${y} years`;
  const rest = m === 1 ? "1 month" : `${m} months`;
  if (y === 0) return rest;
  return m === 0 ? years : `${years} ${rest}`;
}
