import { fromMinorUnits } from "./money";
import {
  BASIS_POINTS_TOTAL,
  canonicalOrder,
  computeShares,
  describeSplitError,
  fromBasisPoints,
  primaryPayer,
  SplitMathError,
  type ShareSpec,
} from "./split-math";
import { moveSlider, sliderStep, slidersFrom, syncSliders, type SliderState } from "./split-sliders";
import type { SplitExpenseInput } from "./validation";

/**
 * The model behind the app's expense editors — the chat composer and the
 * expense dialog (`useExpenseEditor` holds one in state). Pure, so what
 * happens across edits, sends and people coming and going is testable
 * without a browser.
 *
 * The stored state (`EditorState`) is what was chosen: the split type, who's
 * in, who paid, and the sliders as last moved. Everything else — sliders
 * brought up to date with who's in and the amount, the main payer, the shares
 * — is derived by `viewEditor` on each render.
 */

export type SplitType = "equal" | "exact" | "percent";

/** Where an editor starts: a blank expense, the composer's draft, or one being edited. */
export type EditorStart = {
  splitType: SplitType;
  /** Who's in it. */
  included: string[];
  /** Who paid; amounts when they were saved (editing several payers). */
  payers: { memberId: string; amountMinor?: number }[];
  /** Editing an exact split: the saved amounts. */
  exact?: Record<string, number>;
  /** Editing a percent split: the saved basis points. */
  percent?: Record<string, number>;
};

export type EditorState = {
  splitType: SplitType;
  included: string[];
  payerIds: string[];
  payers: SliderState | null;
  exact: SliderState | null;
  percent: SliderState | null;
};

/** Saved values as sliders when there are some — reset to even if they don't add up. */
function savedSliders(values: Record<string, number> | undefined, ids: string[], total: number): SliderState | null {
  if (!values || ids.length === 0 || total <= 0) return null;
  return slidersFrom(ids, total, values);
}

export function editorFrom(start: EditorStart, totalMinor: number): EditorState {
  const payerIds = start.payers.map((p) => p.memberId);
  const paid = Object.fromEntries(
    start.payers.filter((p) => p.amountMinor !== undefined).map((p) => [p.memberId, p.amountMinor!]),
  );
  return {
    splitType: start.splitType,
    included: start.included,
    payerIds,
    payers: payerIds.length > 1 && Object.keys(paid).length ? savedSliders(paid, payerIds, totalMinor) : null,
    exact: savedSliders(start.exact, start.included, totalMinor),
    percent: savedSliders(start.percent, start.included, BASIS_POINTS_TOTAL),
  };
}

export type EditorContext = {
  /** Everyone who can be on it, in display order. */
  order: string[];
  meMemberId: string;
  currency: string;
  /** The typed amount in minor units; 0 while there isn't a valid one. */
  totalMinor: number;
  /** Minor units as money, for error messages. */
  format: (minor: number) => string;
};

/** Everything an editor shows, worked out from what was chosen. */
export function viewEditor(state: EditorState, ctx: EditorContext) {
  const { order, totalMinor } = ctx;
  const inOrder = (ids: Iterable<string>) => {
    const set = new Set(ids);
    return order.filter((id) => set.has(id));
  };
  const includedIds = inOrder(state.included);
  const payerIds = inOrder(state.payerIds);

  // Several payers share the total, evenly by default (leftover by member id,
  // as the server would divide it).
  const payers = payerIds.length > 1 ? syncSliders(state.payers, payerIds, totalMinor, [...payerIds].sort()) : null;
  const paidAmounts =
    payers && totalMinor > 0
      ? payerIds.map((id) => ({ memberId: id, amountMinor: payers.values[id] ?? 0 }))
      : payerIds.map((id) => ({ memberId: id, amountMinor: payerIds.length === 1 ? totalMinor : 0 }));
  const positive = paidAmounts.filter((p) => p.amountMinor > 0);
  const primary = positive.length ? primaryPayer(positive) : (payerIds[0] ?? ctx.meMemberId);

  // Sliders start even, leftover in the order an equal split would use.
  const shareOrder = canonicalOrder(includedIds, primary);
  const exact = syncSliders(state.exact, includedIds, totalMinor, shareOrder);
  const percent = syncSliders(state.percent, includedIds, BASIS_POINTS_TOTAL, shareOrder);

  const spec: ShareSpec =
    state.splitType === "exact"
      ? { type: "exact", shares: includedIds.map((id) => ({ memberId: id, amountMinor: exact.values[id] ?? 0 })) }
      : state.splitType === "percent"
        ? { type: "percent", shares: includedIds.map((id) => ({ memberId: id, bp: percent.values[id] ?? 0 })) }
        : { type: "equal", memberIds: includedIds };

  const preview = ((): { shares: Map<string, number> | null; error: string | null } => {
    if (includedIds.length === 0) return { shares: null, error: "Pick who it's split between" };
    if (payerIds.length === 0) return { shares: null, error: "Pick who paid" };
    if (totalMinor <= 0) return { shares: null, error: null };
    try {
      const shares = computeShares(totalMinor, primary, spec);
      return { shares: new Map(shares.map((s) => [s.memberId, s.amountMinor])), error: null };
    } catch (err) {
      if (err instanceof SplitMathError) return { shares: null, error: describeSplitError(err, ctx.format) };
      throw err;
    }
  })();

  /** The body the expense actions take, with `base` (title, amount, date). */
  function input(base: { title: string; amount: number; occurredOn: string }): SplitExpenseInput {
    const who =
      payers && totalMinor > 0
        ? payerIds.map((id) => ({ memberId: id, amount: fromMinorUnits(payers.values[id] ?? 0, ctx.currency) }))
        : payerIds.map((id) => ({ memberId: id }));
    if (state.splitType === "exact") {
      return {
        ...base,
        payers: who,
        splitType: "exact",
        shares: includedIds.map((id) => ({
          memberId: id,
          amount: fromMinorUnits(exact.values[id] ?? 0, ctx.currency),
        })),
      };
    }
    if (state.splitType === "percent") {
      return {
        ...base,
        payers: who,
        splitType: "percent",
        shares: includedIds.map((id) => ({ memberId: id, percent: fromBasisPoints(percent.values[id] ?? 0) })),
      };
    }
    return { ...base, payers: who, splitType: "equal", memberIds: includedIds };
  }

  /** Where things stand, to carry into another editor (the composer's expand button). */
  function snapshot(): EditorStart {
    return {
      splitType: state.splitType,
      included: includedIds,
      payers: paidAmounts.map((p) =>
        payers && totalMinor > 0 ? { memberId: p.memberId, amountMinor: p.amountMinor } : { memberId: p.memberId },
      ),
      ...(totalMinor > 0 ? { exact: { ...exact.values } } : {}),
      percent: { ...percent.values },
    };
  }

  return {
    splitType: state.splitType,
    includedIds,
    included: new Set(includedIds),
    payerIds,
    primary,
    paidAmounts,
    payers,
    exact,
    percent,
    moneyStep: sliderStep(totalMinor, 200),
    percentStep: sliderStep(BASIS_POINTS_TOTAL),
    preview,
    input,
    snapshot,
  };
}

export type EditorView = ReturnType<typeof viewEditor>;

/* Changes — each takes the stored state (and, for a slider, the view it was moved in). */

export function withSplitType(state: EditorState, splitType: SplitType): EditorState {
  return { ...state, splitType };
}

/**
 * Tick or untick people. Payers have to be in the split: anyone dropped stops
 * being a payer, and if that leaves nobody paying, you (when you're in) or the
 * first person in takes over.
 */
export function withIncluded(state: EditorState, ids: string[], ctx: Pick<EditorContext, "order" | "meMemberId">): EditorState {
  const next = new Set(ids);
  const stillPaying = state.payerIds.filter((id) => next.has(id));
  const fallback = next.has(ctx.meMemberId) ? ctx.meMemberId : ctx.order.find((id) => next.has(id));
  return { ...state, included: ids, payerIds: stillPaying.length ? stillPaying : fallback ? [fallback] : state.payerIds };
}

/** Who paid — never nobody. */
export function withPayerIds(state: EditorState, ids: string[]): EditorState {
  return ids.length ? { ...state, payerIds: ids } : state;
}

export function withSliderMoved(
  state: EditorState,
  view: EditorView,
  which: "payers" | "exact" | "percent",
  id: string,
  units: number,
): EditorState {
  const current = view[which];
  return current ? { ...state, [which]: moveSlider(current, id, units) } : state;
}

/**
 * After a send: every slider forgets its adjustments (the next expense starts
 * even), while who's in it and who paid carry over; the split goes back to equal.
 */
export function withSlidersReset(state: EditorState): EditorState {
  return { ...state, splitType: "equal", payers: null, exact: null, percent: null };
}
