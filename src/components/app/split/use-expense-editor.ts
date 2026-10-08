"use client";

import * as React from "react";
import {
  editorFrom,
  viewEditor,
  withIncluded,
  withPayerIds,
  withSliderMoved,
  withSlidersReset,
  withSplitType,
  type EditorStart,
  type SplitType,
} from "@/lib/split-editor";

export type { EditorStart, SplitType } from "@/lib/split-editor";

/**
 * Everything the composer and the expense dialog share about an expense being
 * put together — who's in it, who paid (one or several, each in the split),
 * how it's divided, and sliders for amounts, percents and payers that keep
 * adding up as people and the amount change. The model is `lib/split-editor.ts`;
 * this holds it in state and binds its changes.
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
  const [state, setState] = React.useState(() => editorFrom(start, totalMinor));
  const order = members.map((m) => m.id);
  const view = viewEditor(state, { order, meMemberId, currency, totalMinor, format });
  return {
    ...view,
    /** Start again from somewhere else (a dialog opening on another expense). */
    reset: (next: EditorStart, total: number) => setState(editorFrom(next, total)),
    setSplitType: (splitType: SplitType) => setState((s) => withSplitType(s, splitType)),
    setIncluded: (ids: string[]) => setState((s) => withIncluded(s, ids, { order, meMemberId })),
    setPayerIds: (ids: string[]) => setState((s) => withPayerIds(s, ids)),
    movePayer: (id: string, units: number) => setState((s) => withSliderMoved(s, view, "payers", id, units)),
    moveExact: (id: string, units: number) => setState((s) => withSliderMoved(s, view, "exact", id, units)),
    movePercent: (id: string, units: number) => setState((s) => withSliderMoved(s, view, "percent", id, units)),
    /** After a send: sliders forget their adjustments; people and payers carry over. */
    resetSliders: () => setState((s) => withSlidersReset(s)),
  };
}

export type ExpenseEditor = ReturnType<typeof useExpenseEditor>;
