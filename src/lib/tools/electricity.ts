import { CUSTOM_APPLIANCE, getAppliance } from "@/lib/tools/data/appliances";

/**
 * Electricity cost maths for `/tools/electricity-cost-calculator`, plus the
 * compact encoding its appliance list uses in the query string.
 *
 * kWh = watts × hours × quantity ÷ 1000, and cost = kWh × the visitor's own
 * price per kWh — no tariff table, so nothing here goes stale. A month is an
 * average month, a twelfth of a 365-day year (≈ 30.42 days), so the monthly
 * figure × 12 is exactly the yearly one.
 */

export const DAYS_PER_YEAR = 365;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

/** Most rows the list holds — and reads back from a link. */
export const MAX_ROWS = 20;

export type ApplianceUse = {
  /** Power while running, in watts. */
  watts: number;
  hoursPerDay: number;
  quantity: number;
};

export type EnergyCost = {
  /** kWh used in one hour of running (all units together). */
  kwhPerHour: number;
  kwhPerDay: number;
  kwhPerMonth: number;
  kwhPerYear: number;
  /** Cost of one hour of running. */
  perHour: number;
  perDay: number;
  perMonth: number;
  perYear: number;
};

/** What one appliance row uses and costs at `tariff` per kWh. */
export function applianceCost(use: ApplianceUse, tariff: number): EnergyCost {
  const kwhPerHour = (use.watts * use.quantity) / 1000;
  const kwhPerDay = kwhPerHour * use.hoursPerDay;
  const kwhPerYear = kwhPerDay * DAYS_PER_YEAR;
  const kwhPerMonth = kwhPerYear / 12;
  return {
    kwhPerHour,
    kwhPerDay,
    kwhPerMonth,
    kwhPerYear,
    perHour: kwhPerHour * tariff,
    perDay: kwhPerDay * tariff,
    perMonth: kwhPerMonth * tariff,
    perYear: kwhPerYear * tariff,
  };
}

export type EnergyTotals = {
  rows: EnergyCost[];
  total: Omit<EnergyCost, "kwhPerHour" | "perHour">;
  /** Index of the row with the highest monthly use, or null with nothing using power. */
  biggest: number | null;
};

/** Every row costed, the household total, and which row costs the most. */
export function electricityTotals(uses: readonly ApplianceUse[], tariff: number): EnergyTotals {
  const rows = uses.map((u) => applianceCost(u, tariff));
  const total = { kwhPerDay: 0, kwhPerMonth: 0, kwhPerYear: 0, perDay: 0, perMonth: 0, perYear: 0 };
  let biggest: number | null = null;
  rows.forEach((r, i) => {
    total.kwhPerDay += r.kwhPerDay;
    total.kwhPerMonth += r.kwhPerMonth;
    total.kwhPerYear += r.kwhPerYear;
    total.perDay += r.perDay;
    total.perMonth += r.perMonth;
    total.perYear += r.perYear;
    // Ranked on kWh, not cost, so a zero tariff still names the biggest user.
    if (r.kwhPerMonth > 0 && (biggest === null || r.kwhPerMonth > rows[biggest]!.kwhPerMonth)) {
      biggest = i;
    }
  });
  return { rows, total, biggest };
}

/**
 * Validate one row's typed values. `null` fields mean "not filled in yet" —
 * the row is left out of the total rather than counted as zero.
 */
export function rowErrors(use: {
  watts: number | null;
  hoursPerDay: number | null;
  quantity: number | null;
}): { watts?: string; hoursPerDay?: string; quantity?: string } {
  const errors: { watts?: string; hoursPerDay?: string; quantity?: string } = {};
  if (use.watts !== null && use.watts < 0) errors.watts = "Can't be negative.";
  if (use.hoursPerDay !== null && (use.hoursPerDay < 0 || use.hoursPerDay > 24)) {
    errors.hoursPerDay = "Between 0 and 24.";
  }
  if (use.quantity !== null && (use.quantity < 0 || !Number.isInteger(use.quantity))) {
    errors.quantity = "A whole number.";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// The appliance list in one query parameter: `fridge~75~24~1|fan~75~10~2`
// ---------------------------------------------------------------------------

/**
 * One appliance row as typed. The numbers stay strings — the raw field text —
 * so a half-typed "1," survives the round trip through the URL.
 */
export type ApplianceRow = {
  /** A preset id from `APPLIANCES`, or `"custom"`. */
  id: string;
  watts: string;
  hours: string;
  qty: string;
};

const ROW_SEP = "|";
const FIELD_SEP = "~";
/** Longest field text kept — a number, not a payload. */
const MAX_FIELD = 12;

/** Strip the separators (and whitespace) so typed text can't break the encoding. */
function cleanField(value: string): string {
  return value.replace(/[|~\s]/g, "").slice(0, MAX_FIELD);
}

export function encodeRows(rows: readonly ApplianceRow[]): string {
  return rows
    .slice(0, MAX_ROWS)
    .map((r) => [r.id, r.watts, r.hours, r.qty].map(cleanField).join(FIELD_SEP))
    .join(ROW_SEP);
}

/**
 * Read the list back from a (possibly hand-edited) link. Unknown appliance ids
 * become custom rows, missing fields become blanks, and anything past
 * `MAX_ROWS` is dropped — it never throws.
 */
export function decodeRows(param: string): ApplianceRow[] {
  if (!param.trim()) return [];
  return param
    .split(ROW_SEP)
    .slice(0, MAX_ROWS)
    .map((chunk) => {
      const [id = "", watts = "", hours = "", qty = ""] = chunk.split(FIELD_SEP);
      const known = getAppliance(id.trim()) ? id.trim() : CUSTOM_APPLIANCE;
      return {
        id: known,
        watts: cleanField(watts),
        hours: cleanField(hours),
        qty: cleanField(qty),
      };
    });
}

/**
 * A rough household price per kWh for the currencies where one figure is a
 * fair starting point — the calculator's default until the visitor types the
 * rate from their own bill. Deliberately approximate (tariffs vary by region,
 * slab and supplier, and the page says so); a currency missing here starts
 * blank rather than with a number that would be wildly off, as a single
 * default of 0.15 was for rupees or yen.
 */
export const TYPICAL_TARIFF: Readonly<Record<string, number>> = {
  USD: 0.17,
  EUR: 0.3,
  GBP: 0.25,
  INR: 7,
  CAD: 0.15,
  AUD: 0.3,
  NZD: 0.33,
  JPY: 31,
  SGD: 0.3,
  AED: 0.3,
  CHF: 0.3,
};
