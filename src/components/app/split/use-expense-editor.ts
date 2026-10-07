"use client";

import * as React from "react";
import { fromMinorUnits } from "@/lib/money";
import {
  canonicalOrder,
  computeShares,
  describeSplitError,
  fromBasisPoints,
  primaryPayer,
  SplitMathError,
  BASIS_POINTS_TOTAL,
  type ShareSpec,
} from "@/lib/split-math";
import { moveSlider, sliderStep, syncSliders, type SliderState } from "@/lib/split-sliders";
import type { SplitExpenseInput } from "@/lib/validation";

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

type Raw = {
  splitType: SplitType;
  included: string[];
  payerIds: string[];
  payers: SliderState | null;
  exact: SliderState | null;
  percent: SliderState | null;
};

function rawFrom(start: EditorStart, totalMinor: number): Raw {
  const payerIds = start.payers.map((p) => p.memberId);
  const saved = (values: Record<string, number> | undefined, ids: string[], total: number): SliderState | null => {
    if (!values) return null;
    const sum = ids.reduce((a, id) => a + (values[id] ?? 0), 0);
    return sum === total && total > 0
      ? { ids, values: Object.fromEntries(ids.map((id) => [id, values[id] ?? 0])), total, touched: [] }
      : null;
  };
  const paid = Object.fromEntries(
    start.payers.filter((p) => p.amountMinor !== undefined).map((p) => [p.memberId, p.amountMinor!]),
  );
  return {
    splitType: start.splitType,
    included: start.included,
    payerIds,
    payers: payerIds.length > 1 ? saved(paid, payerIds, totalMinor) : null,
    exact: saved(start.exact, start.included, totalMinor),
    percent: saved(start.percent, start.included, BASIS_POINTS_TOTAL),
  };
}

/**
 * Everything the composer and the expense dialog share about an expense being
 * put together: who's in it, who paid (one or several, each in the split),
 * how it's divided, the sliders for exact amounts, percents and payers — kept
 * adding up as people and the amount change — and the shares it comes to,
 * worked out by the same `computeShares` the server runs.
 *
 * `members` is display order (the group's order); `totalMinor` is the typed
 * amount in minor units, or 0 while there isn't a valid one.
 */
export function useExpenseEditor({
  members,
  meMemberId,
  currency,
  totalMinor,
  start,
  format,
}: {
  members: { id: string }[];
  meMemberId: string;
  currency: string;
  totalMinor: number;
  start: EditorStart;
  /** Minor units as money, for error messages. */
  format: (minor: number) => string;
}) {
  const [raw, setRaw] = React.useState<Raw>(() => rawFrom(start, totalMinor));
  /** Start again from somewhere else (a dialog opening on another expense). */
  const reset = (next: EditorStart, total: number) => setRaw(rawFrom(next, total));

  const order = members.map((m) => m.id);
  const inOrder = (ids: Iterable<string>) => {
    const set = new Set(ids);
    return order.filter((id) => set.has(id));
  };
  const includedIds = inOrder(raw.included);
  const included = new Set(includedIds);
  const payerIds = inOrder(raw.payerIds);

  // Who paid what — several payers share the total, evenly by default
  // (leftover by member id, as the server would divide it).
  const payers =
    payerIds.length > 1 ? syncSliders(raw.payers, payerIds, totalMinor, [...payerIds].sort()) : null;
  const paidAmounts =
    payers && totalMinor > 0
      ? payerIds.map((id) => ({ memberId: id, amountMinor: payers.values[id] ?? 0 }))
      : payerIds.map((id) => ({ memberId: id, amountMinor: payerIds.length === 1 ? totalMinor : 0 }));
  const positive = paidAmounts.filter((p) => p.amountMinor > 0);
  const primary = positive.length ? primaryPayer(positive) : (payerIds[0] ?? meMemberId);

  // Sliders start even, leftover in the order an equal split would use.
  const shareOrder = canonicalOrder(includedIds, primary);
  const exact = syncSliders(raw.exact, includedIds, totalMinor, shareOrder);
  const percent = syncSliders(raw.percent, includedIds, BASIS_POINTS_TOTAL, shareOrder);

  const spec = ((): ShareSpec => {
    if (raw.splitType === "exact") {
      return { type: "exact", shares: includedIds.map((id) => ({ memberId: id, amountMinor: exact.values[id] ?? 0 })) };
    }
    if (raw.splitType === "percent") {
      return { type: "percent", shares: includedIds.map((id) => ({ memberId: id, bp: percent.values[id] ?? 0 })) };
    }
    return { type: "equal", memberIds: includedIds };
  })();

  const preview = ((): { shares: Map<string, number> | null; error: string | null } => {
    if (includedIds.length === 0) return { shares: null, error: "Pick who it's split between" };
    if (payerIds.length === 0) return { shares: null, error: "Pick who paid" };
    if (totalMinor <= 0) return { shares: null, error: null };
    try {
      const shares = computeShares(totalMinor, primary, spec);
      return { shares: new Map(shares.map((s) => [s.memberId, s.amountMinor])), error: null };
    } catch (err) {
      if (err instanceof SplitMathError) return { shares: null, error: describeSplitError(err, format) };
      throw err;
    }
  })();

  /** The body the expense actions take, with `base` (title, amount, date). */
  function input(base: { title: string; amount: number; occurredOn: string }): SplitExpenseInput {
    const who =
      payerIds.length > 1 && payers
        ? payerIds.map((id) => ({ memberId: id, amount: fromMinorUnits(payers.values[id] ?? 0, currency) }))
        : payerIds.map((id) => ({ memberId: id }));
    if (raw.splitType === "exact") {
      return {
        ...base,
        payers: who,
        splitType: "exact",
        shares: includedIds.map((id) => ({ memberId: id, amount: fromMinorUnits(exact.values[id] ?? 0, currency) })),
      };
    }
    if (raw.splitType === "percent") {
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
      splitType: raw.splitType,
      included: includedIds,
      payers: paidAmounts.map((p) =>
        payers && totalMinor > 0 ? { memberId: p.memberId, amountMinor: p.amountMinor } : { memberId: p.memberId },
      ),
      ...(totalMinor > 0 ? { exact: { ...exact.values } } : {}),
      percent: { ...percent.values },
    };
  }

  return {
    snapshot,
    splitType: raw.splitType,
    setSplitType: (splitType: SplitType) => setRaw((r) => ({ ...r, splitType })),
    included,
    includedIds,
    /**
     * Tick or untick people. Payers have to be in the split: anyone dropped
     * stops being a payer, and if that leaves nobody paying, you (when you're
     * in) or the first person in takes over.
     */
    setIncluded: (ids: string[]) =>
      setRaw((r) => {
        const next = new Set(ids);
        const stillPaying = r.payerIds.filter((id) => next.has(id));
        const fallback = next.has(meMemberId) ? meMemberId : order.find((id) => next.has(id));
        return {
          ...r,
          included: ids,
          payerIds: stillPaying.length ? stillPaying : fallback ? [fallback] : r.payerIds,
        };
      }),
    payerIds,
    /** Who paid — never nobody. */
    setPayerIds: (ids: string[]) => setRaw((r) => (ids.length ? { ...r, payerIds: ids } : r)),
    primary,
    paidAmounts,
    payers,
    movePayer: (id: string, units: number) =>
      setRaw((r) => (payers ? { ...r, payers: moveSlider(payers, id, units) } : r)),
    exact,
    moveExact: (id: string, units: number) => setRaw((r) => ({ ...r, exact: moveSlider(exact, id, units) })),
    percent,
    movePercent: (id: string, units: number) => setRaw((r) => ({ ...r, percent: moveSlider(percent, id, units) })),
    moneyStep: sliderStep(totalMinor, 200),
    percentStep: sliderStep(BASIS_POINTS_TOTAL),
    preview,
    input,
    reset,
  };
}

export type ExpenseEditor = ReturnType<typeof useExpenseEditor>;
