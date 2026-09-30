/**
 * VAT / GST / sales-tax maths for `/tools/vat-calculator`.
 *
 * Everything is in integer minor units (pence, paise, cents) so net + tax =
 * gross to the last unit, the way an invoice has to. Rates are scaled to
 * integers and the division is done in `BigInt`: `1005 × 5.5 ÷ 100` is
 * 55.275 exactly, but 55.27499… in floating point, and that stray digit is
 * enough to round a penny the wrong way.
 */

export type TaxMode = "add" | "remove";

/** A price split into its parts, all in minor units. */
export type TaxBreakdown = { net: number; tax: number; gross: number };

/** Rates are kept to four decimal places (8.1%, 5.5%, 13.5%, 2.1% all fit). */
const RATE_SCALE = 10_000;

/**
 * Largest amount we calculate, in minor units. Past this, a float can no
 * longer hold every whole number (2^53 ≈ 9 × 10^15) and "exact" would be a lie.
 */
export const MAX_MINOR = 1e15;

/**
 * A typed amount in minor units, or null when it's too large to hold exactly.
 * Shifts the decimal point through the number's string form rather than
 * multiplying, so 1.005 becomes 100.5 (and rounds to 101), not 100.49999….
 */
export function toMinor(amount: number, decimals: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const text = String(amount);
  // Exponent-form numbers (1e-7, 1e+21) can't take a second exponent; they're
  // far too small or too large for the float error to matter anyway.
  const shifted = text.includes("e") ? amount * 10 ** decimals : Number(`${text}e${decimals}`);
  if (!Number.isFinite(shifted)) return null;
  const minor = roundHalfAway(shifted);
  if (Math.abs(minor) > MAX_MINOR) return null;
  return minor === 0 ? 0 : minor; // never −0
}

/** Commercial rounding: halves go away from zero, so −2.5 → −3 like 2.5 → 3. */
function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** `numerator ÷ denominator`, rounded half away from zero. Denominator > 0. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < BigInt(0);
  const abs = negative ? -numerator : numerator;
  const q = (abs * BigInt(2) + denominator) / (denominator * BigInt(2));
  return negative ? -q : q;
}

/**
 * Split an amount by a tax rate.
 *
 * - `add`: `amount` is the price before tax. Tax = net × rate ÷ 100.
 * - `remove`: `amount` already includes tax. Tax = gross × rate ÷ (100 + rate)
 *   — the "VAT fraction" (1/6 at 20%). The tempting gross × rate ÷ 100 takes
 *   the percentage of the wrong number and overstates the tax.
 *
 * Only the tax is rounded; the other side is derived from it, so the three
 * figures always add up. Returns null for a negative, non-finite or >100%
 * rate, or an amount too large to hold exactly.
 */
export function calculateTax(amountMinor: number, ratePercent: number, mode: TaxMode): TaxBreakdown | null {
  if (!Number.isSafeInteger(amountMinor) || Math.abs(amountMinor) > MAX_MINOR) return null;
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return null;

  const rate = BigInt(Math.round(ratePercent * RATE_SCALE));
  const hundred = BigInt(100 * RATE_SCALE);
  const amount = BigInt(amountMinor);

  if (mode === "add") {
    const tax = Number(divRound(amount * rate, hundred));
    return { net: amountMinor, tax, gross: amountMinor + tax };
  }
  const tax = Number(divRound(amount * rate, hundred + rate));
  return { net: amountMinor - tax, tax, gross: amountMinor };
}

/**
 * India's intra-state GST: CGST and SGST are each charged at half the rate and
 * rounded on their own — the way GST invoices show them — so the two halves are
 * always equal and the GST is exactly twice one half. (Splitting a GST figure
 * rounded at the full rate would hand an odd paisa to one side.) Adding tax,
 * the total follows the halves; removing it, the price stays as entered and the
 * net absorbs the rounding.
 */
export function calculateIntraStateGst(
  amountMinor: number,
  ratePercent: number,
  mode: TaxMode,
): (TaxBreakdown & { cgst: number; sgst: number }) | null {
  const full = calculateTax(amountMinor, ratePercent, mode);
  if (!full) return null;
  const halfOnNet = calculateTax(full.net, ratePercent / 2, "add");
  if (!halfOnNet) return null;
  const half = halfOnNet.tax;
  const tax = half * 2;
  return mode === "add"
    ? { net: full.net, tax, gross: full.net + tax, cgst: half, sgst: half }
    : { net: amountMinor - tax, tax, gross: amountMinor, cgst: half, sgst: half };
}
