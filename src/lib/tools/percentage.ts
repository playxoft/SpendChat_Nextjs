/**
 * Percentage maths for `/tools/percentage-calculator`. Pure, so every mode is
 * unit-tested; each function returns `null` where the question has no answer
 * (dividing by zero) rather than `Infinity` or `NaN` for the UI to render.
 */

/** What is `percent`% of `value`? */
export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value;
}

/** `part` is what percent of `whole`? */
export function whatPercent(part: number, whole: number): number | null {
  return whole === 0 ? null : (part / whole) * 100;
}

/**
 * Percentage change from `from` to `to`. Relative to the absolute starting
 * value, so going from -50 to -25 reads as +50% (it rose), not -50%.
 */
export function percentChange(from: number, to: number): number | null {
  return from === 0 ? null : ((to - from) / Math.abs(from)) * 100;
}

/** `value` increased (or decreased) by `percent`%. */
export function applyPercent(value: number, percent: number, direction: "up" | "down"): number {
  const factor = direction === "up" ? 1 + percent / 100 : 1 - percent / 100;
  return value * factor;
}

/**
 * Percent difference between two values, relative to their average — the
 * symmetric measure, for comparing two things where neither is "the original".
 */
export function percentDifference(a: number, b: number): number | null {
  const mean = (Math.abs(a) + Math.abs(b)) / 2;
  return mean === 0 ? null : (Math.abs(a - b) / mean) * 100;
}

/** The sale price and the saving for `percentOff`% off `price`. */
export function discount(price: number, percentOff: number): { saving: number; final: number } {
  const saving = (percentOff / 100) * price;
  return { saving, final: price - saving };
}
