"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField, NumberField, Segmented, SelectField, TextField } from "@/components/tools/fields";
import { keepOpenWhileTyping, SplitPeopleList, type SplitPerson } from "@/components/split/split-people-list";
import { formatMoney, minorToInputString, toMinorUnits } from "@/lib/money";
import { BASIS_POINTS_TOTAL, describeSplitError, percentToInputString, SplitMathError } from "@/lib/split-math";
import { moneyInput, percentInput } from "@/lib/split-slider-input";
import { moveSlider, sliderStep, slidersFrom, syncSliders, type SliderState } from "@/lib/split-sliders";
import { currencySymbol, parseNumber } from "@/lib/tools/format";
import {
  DRAFT_AMOUNT_MAX,
  DRAFT_TITLE_MAX,
  expenseShares,
  personLabel,
  type DraftExpense,
  type DraftPerson,
  type DraftSplit,
} from "@/lib/tools/split-bill";

/**
 * Add or edit one expense: what, how much, who paid, and how it's divided —
 * equally between ticked people, or by amounts or percents on sliders that
 * always add up (`lib/split-sliders.ts`, the same ones the app uses). The
 * preview runs the app's own `computeShares`, so the shares shown are the
 * ones the app would store (including who absorbs a leftover cent).
 */

type SplitType = DraftSplit["type"];

const SPLIT_OPTIONS = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Amounts" },
  { value: "percent", label: "Percent" },
] as const;

export type FormState = {
  title: string;
  amount: string;
  paidBy: string;
  on: string;
  type: SplitType;
  /** Who's in it, whatever the split type. */
  ticked: string[];
  /** Slider states as last moved; brought up to date with who's in and the amount on each render. */
  exact: SliderState | null;
  percent: SliderState | null;
  /** The saved amounts or percents didn't add up (an older draft), so they start even. */
  startedEven: boolean;
};

export function initialState(
  people: DraftPerson[],
  expense: DraftExpense | null,
  currency: string,
  locale: string,
  today: string,
): FormState {
  if (!expense) {
    return {
      title: "",
      amount: "",
      paidBy: people[0]?.id ?? "",
      on: today,
      type: "equal",
      ticked: people.map((p) => p.id),
      exact: null,
      percent: null,
      startedEven: false,
    };
  }
  const split = expense.split;
  // Saved values that add up are kept; ones that don't (a draft from before
  // the sliders, or edited by hand) start even — the leftover to the payer
  // first, then in the draft's order, as the split maths would.
  const saved = (shares: { id: string; value: number }[], total: number): SliderState => {
    const ids = shares.map((s) => s.id);
    const order = ids.includes(expense.paidBy) ? [expense.paidBy, ...ids.filter((id) => id !== expense.paidBy)] : ids;
    return slidersFrom(ids, total, Object.fromEntries(shares.map((s) => [s.id, s.value])), order);
  };
  const addsUp = (shares: { value: number }[], total: number) => shares.reduce((a, s) => a + s.value, 0) === total;
  return {
    title: expense.title,
    amount: minorToInputString(expense.amountMinor, currency, locale),
    paidBy: expense.paidBy,
    on: expense.on,
    type: split.type,
    ticked: split.type === "equal" ? split.ids : split.shares.map((s) => s.id),
    exact:
      split.type === "exact"
        ? saved(split.shares.map((s) => ({ id: s.id, value: s.minor })), expense.amountMinor)
        : null,
    percent:
      split.type === "percent" ? saved(split.shares.map((s) => ({ id: s.id, value: s.bp })), BASIS_POINTS_TOTAL) : null,
    startedEven:
      (split.type === "exact" && !addsUp(split.shares.map((s) => ({ value: s.minor })), expense.amountMinor)) ||
      (split.type === "percent" && !addsUp(split.shares.map((s) => ({ value: s.bp })), BASIS_POINTS_TOTAL)),
  };
}

/** The amount typed, in minor units — or why there isn't one. */
export function formAmount(state: FormState, currency: string, locale: string): { minor?: number; error?: string } {
  if (!state.amount.trim()) return { error: "Enter the amount" };
  const major = parseNumber(state.amount, locale);
  if (major === null || major <= 0) return { error: "Enter an amount above zero" };
  if (major > DRAFT_AMOUNT_MAX) return { error: "That amount is too large" };
  const minor = toMinorUnits(major, currency);
  if (minor <= 0) return { error: `That's too small for ${currency}` };
  return { minor };
}

/**
 * Who's ticked (in the draft's order) and the sliders as they stand for
 * `state`: brought up to date with the ticks and the amount, starting even
 * with the leftover to the payer first, as the split maths would.
 */
export function formSliders(state: FormState, order: readonly string[], currency: string, locale: string) {
  const ticked = order.filter((id) => state.ticked.includes(id));
  const leftoverOrder = ticked.includes(state.paidBy)
    ? [state.paidBy, ...ticked.filter((id) => id !== state.paidBy)]
    : ticked;
  return {
    ticked,
    exact: syncSliders(state.exact, ticked, formAmount(state, currency, locale).minor ?? 0, leftoverOrder),
    percent: syncSliders(state.percent, ticked, BASIS_POINTS_TOTAL, leftoverOrder),
  };
}

/**
 * Move one slider, worked out from `state` itself — call it inside a state
 * updater, so a typed figure committed on blur and a tap on another slider in
 * the same tick both land instead of the second undoing the first.
 */
export function withFormSliderMoved(
  state: FormState,
  which: "exact" | "percent",
  id: string,
  units: number,
  order: readonly string[],
  currency: string,
  locale: string,
): FormState {
  const current = formSliders(state, order, currency, locale)[which];
  return { ...state, [which]: moveSlider(current, id, units), startedEven: false };
}

export function ExpenseDialog({
  open,
  onOpenChange,
  people,
  expense,
  currency,
  locale,
  today,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: DraftPerson[];
  /** Present when editing. */
  expense: DraftExpense | null;
  currency: string;
  locale: string;
  today: string;
  onSave: (expense: Omit<DraftExpense, "id">) => void;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" onEscapeKeyDown={keepOpenWhileTyping}>
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add an expense"}</DialogTitle>
          <DialogDescription>Who paid, and who it was for.</DialogDescription>
        </DialogHeader>
        {/* Keyed, so each opening starts from the expense (or a blank one) afresh. */}
        {open && (
          <ExpenseForm
            key={expense?.id ?? "new"}
            people={people}
            expense={expense}
            currency={currency}
            locale={locale}
            today={today}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  people,
  expense,
  currency,
  locale,
  today,
  onCancel,
  onSave,
  onDelete,
}: {
  people: DraftPerson[];
  expense: DraftExpense | null;
  currency: string;
  locale: string;
  today: string;
  onCancel: () => void;
  onSave: (expense: Omit<DraftExpense, "id">) => void;
  onDelete?: () => void;
}) {
  const [state, setState] = useState(() => initialState(people, expense, currency, locale, today));
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));
  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const order = people.map((p) => p.id);
  const label = (id: string) => personLabel(people, id);

  // Plain computations — the React Compiler memoizes them.
  const amount = formAmount(state, currency, locale);
  const { ticked, exact, percent } = formSliders(state, order, currency, locale);
  const move = (which: "exact" | "percent") => (id: string, units: number) =>
    setState((s) => withFormSliderMoved(s, which, id, units, order, currency, locale));

  const built = ((): { split?: DraftSplit; error?: string } => {
    if (ticked.length === 0) return { error: "Tick who it's split between" };
    if (state.type === "equal") return { split: { type: "equal", ids: ticked } };
    if (state.type === "exact") {
      if (amount.minor === undefined) return { error: amount.error };
      const shares = ticked.map((id) => ({ id, minor: exact.values[id] ?? 0 })).filter((s) => s.minor > 0);
      return { split: { type: "exact", shares } };
    }
    const shares = ticked.map((id) => ({ id, bp: percent.values[id] ?? 0 })).filter((s) => s.bp > 0);
    return { split: { type: "percent", shares } };
  })();

  const preview = ((): { shares?: Map<string, number>; error?: string } => {
    if (amount.minor === undefined || !built.split) return { error: amount.error ?? built.error };
    const result = expenseShares({ amountMinor: amount.minor, paidBy: state.paidBy, split: built.split }, order);
    if (result instanceof SplitMathError) return { error: describeSplitError(result, fmt) };
    return { shares: new Map(result.map((s) => [s.memberId, s.amountMinor])) };
  })();

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (amount.minor === undefined || !built.split || !preview.shares) return;
    onSave({
      title: state.title.trim(),
      amountMinor: amount.minor,
      paidBy: state.paidBy,
      on: state.on || today,
      split: built.split,
    });
  }

  const error = preview.error ?? null;
  const symbol = currencySymbol(currency, locale);
  const percentText = (bp: number) => `${percentToInputString(bp, locale)}%`;
  const rows: SplitPerson[] = people.map((p) => ({ id: p.id, name: label(p.id), email: p.email?.trim() || null }));

  return (
    <form onSubmit={submit} className="min-w-0 space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="What for"
          value={state.title}
          onChange={(title) => set({ title })}
          placeholder="Dinner"
          maxLength={DRAFT_TITLE_MAX}
          className="sm:col-span-2"
        />
        <NumberField
          label="Amount"
          value={state.amount}
          onChange={(value) => set({ amount: value })}
          prefix={symbol}
          placeholder="0"
          error={submitted ? (amount.error ?? null) : null}
        />
        <SelectField
          label="Paid by"
          value={state.paidBy}
          onChange={(paidBy) => set({ paidBy })}
          options={people.map((p) => ({ value: p.id, label: label(p.id) }))}
        />
        <DateField label="Date" value={state.on} onChange={(on) => set({ on })} className="sm:col-span-2" />
      </div>

      <Segmented
        label="Split"
        value={state.type}
        onChange={(type) => set({ type: type as SplitType })}
        options={SPLIT_OPTIONS}
      />

      <SplitPeopleList
        people={rows}
        included={new Set(ticked)}
        onIncludedChange={(ids) => set({ ticked: ids })}
        shareText={(id) => (preview.shares?.has(id) ? fmt(preview.shares.get(id)!) : null)}
        sliders={
          state.type === "exact" && amount.minor !== undefined
            ? {
                state: exact,
                step: sliderStep(exact.total, 200),
                format: fmt,
                input: moneyInput(currency, locale, symbol),
                onMove: move("exact"),
              }
            : state.type === "percent"
              ? {
                  state: percent,
                  step: sliderStep(BASIS_POINTS_TOTAL),
                  format: percentText,
                  input: percentInput(locale),
                  onMove: move("percent"),
                }
              : null
        }
        // A percent row says what its percent comes to; an amount row's box already says it.
        sliderAside={
          state.type === "percent"
            ? (id) => (preview.shares?.has(id) ? fmt(preview.shares.get(id)!) : "—")
            : undefined
        }
      />

      <div aria-live="polite" className="min-h-5 text-sm">
        {error && (submitted || amount.minor !== undefined) ? (
          <p className="text-destructive">{error}</p>
        ) : state.type !== "equal" ? (
          <p className="text-muted-foreground">
            {state.type === "exact" && amount.minor === undefined
              ? "Enter the amount to set each person's part."
              : state.startedEven
                ? "Its parts didn't add up, so they start evenly — slide to set them, then save."
                : "Slide to set each part — the others rebalance, so it always adds up."}
          </p>
        ) : null}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {onDelete ? (
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{expense ? "Save changes" : "Add expense"}</Button>
        </div>
      </DialogFooter>
    </form>
  );
}
