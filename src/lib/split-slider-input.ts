import { getCurrency } from "./currencies";
import { minorToInputString, toMinorUnits } from "./money";
import { parseAmountInput } from "./parse-amount";
import { acceptAmountInput } from "./split-display";
import { percentToInputString } from "./split-math";
import { moveSlider, type SliderState } from "./split-sliders";

/**
 * The number box beside each split slider: type a figure instead of dragging.
 * What's typed is only text until it's committed (Enter or leaving the box);
 * then it's parsed in the viewer's number format — any keypad's digits — and
 * applied exactly like a slider move (`moveSlider`), so the rest rebalance and
 * the total still can't come out wrong. Pure, shared by the app and the free
 * calculator.
 */

export type SliderInput = {
  /** A value as the box shows it: "1200.00", "33.33" — the viewer's separators, Latin digits. */
  toText: (units: number) => string;
  /** What's typed as units (minor units or basis points), or null when it isn't a number. */
  parse: (text: string) => number | null;
  /** Filter a keystroke: keep digits from any script and the locale's separators. */
  accept: (previous: string, typed: string) => string;
  /** Shown inside the box: the currency symbol before, or "%" after. */
  prefix?: string;
  suffix?: string;
};

/** Amounts in a currency: units are its minor units. */
export function moneyInput(currency: string, locale: string, symbol = getCurrency(currency).symbol): SliderInput {
  return {
    toText: (minor) => minorToInputString(minor, currency, locale),
    parse: (text) => {
      const value = text.trim() ? parseAmountInput(text, locale) : null;
      return value === null ? null : toMinorUnits(value, currency);
    },
    accept: (previous, typed) => acceptAmountInput(previous, typed, locale),
    prefix: symbol,
  };
}

/** Percents with up to two decimals: units are basis points (33.33% = 3333). */
export function percentInput(locale: string): SliderInput {
  return {
    toText: (bp) => percentToInputString(bp, locale),
    parse: (text) => {
      const value = text.trim() ? parseAmountInput(text, locale) : null;
      return value === null ? null : Math.round(value * 100);
    },
    accept: (previous, typed) => acceptAmountInput(previous, typed, locale),
    suffix: "%",
  };
}

/**
 * What to say when a box can't read a figure: an example in the viewer's own
 * format — "Use a number like 12.50" (en-IN), "… like 12,50" (de-DE).
 */
export function inputHint(input: SliderInput): string {
  return `Use a number like ${input.toText(1250)}`;
}

/** What a committed box comes to: its units clamped to 0…total, or null to leave things as they were. */
export function committedUnits(text: string, input: SliderInput, total: number): number | null {
  const units = input.parse(text);
  if (units === null || !Number.isFinite(units)) return null;
  return Math.min(Math.max(units, 0), total);
}

/** Commit what was typed for `id`: a slider move to that value, or no change when it isn't a number. */
export function commitSliderText(state: SliderState, id: string, text: string, input: SliderInput): SliderState {
  const units = committedUnits(text, input, state.total);
  return units === null ? state : moveSlider(state, id, units);
}
