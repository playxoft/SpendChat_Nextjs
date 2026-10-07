"use client";

import { useId, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DateField,
  NumberField,
  Segmented,
  SelectField,
  TextField,
  sanitizeKeepingCaret,
} from "@/components/tools/fields";
import { formatMoney, minorToInputString, toMinorUnits } from "@/lib/money";
import {
  describeSplitError,
  percentToInputString,
  SplitMathError,
  toBasisPoints,
} from "@/lib/split-math";
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
import { cn } from "@/lib/utils";

/**
 * Add or edit one expense: what, how much, who paid, and how it's divided —
 * equally between ticked people, by exact amounts, or by percent. The preview
 * runs the app's own `computeShares`, so the shares shown are the ones the
 * app would store (including who absorbs a leftover cent).
 */

type SplitType = DraftSplit["type"];

const SPLIT_OPTIONS = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Exact amounts" },
  { value: "percent", label: "Percent" },
] as const;

type FormState = {
  title: string;
  amount: string;
  paidBy: string;
  on: string;
  type: SplitType;
  ticked: string[];
  exact: Record<string, string>;
  percent: Record<string, string>;
};

function initialState(
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
      exact: {},
      percent: {},
    };
  }
  const split = expense.split;
  return {
    title: expense.title,
    amount: minorToInputString(expense.amountMinor, currency, locale),
    paidBy: expense.paidBy,
    on: expense.on,
    type: split.type,
    ticked: split.type === "equal" ? split.ids : people.map((p) => p.id),
    exact:
      split.type === "exact"
        ? Object.fromEntries(split.shares.map((s) => [s.id, minorToInputString(s.minor, currency, locale)]))
        : {},
    percent:
      split.type === "percent"
        ? Object.fromEntries(split.shares.map((s) => [s.id, percentToInputString(s.bp, locale)]))
        : {},
  };
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
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
  const amountMajor = parseNumber(state.amount, locale);
  const amount = ((): { minor?: number; error?: string } => {
    if (!state.amount.trim()) return { error: "Enter the amount" };
    if (amountMajor === null || amountMajor <= 0) return { error: "Enter an amount above zero" };
    if (amountMajor > DRAFT_AMOUNT_MAX) return { error: "That amount is too large" };
    const minor = toMinorUnits(amountMajor, currency);
    if (minor <= 0) return { error: `That's too small for ${currency}` };
    return { minor };
  })();

  const built = ((): { split?: DraftSplit; error?: string } => {
    if (state.type === "equal") {
      const ids = order.filter((id) => state.ticked.includes(id));
      return ids.length ? { split: { type: "equal", ids } } : { error: "Tick who it's split between" };
    }
    if (state.type === "exact") {
      const shares: { id: string; minor: number }[] = [];
      for (const id of order) {
        const raw = state.exact[id] ?? "";
        if (!raw.trim()) continue;
        const v = parseNumber(raw, locale);
        if (v === null || v < 0 || v > DRAFT_AMOUNT_MAX) return { error: `Check ${label(id)}'s amount` };
        const minor = toMinorUnits(v, currency);
        if (minor > 0) shares.push({ id, minor });
      }
      return shares.length ? { split: { type: "exact", shares } } : { error: "Enter what each person's share is" };
    }
    const shares: { id: string; bp: number }[] = [];
    for (const id of order) {
      const raw = state.percent[id] ?? "";
      if (!raw.trim()) continue;
      const v = parseNumber(raw, locale);
      if (v === null || v < 0 || v > 100) return { error: `Check ${label(id)}'s percent` };
      if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return { error: "Use at most two decimals in a percent" };
      const bp = toBasisPoints(v);
      if (bp > 0) shares.push({ id, bp });
    }
    return shares.length ? { split: { type: "percent", shares } } : { error: "Enter each person's percent" };
  })();

  const preview = ((): { shares?: Map<string, number>; error?: string } => {
    if (amount.minor === undefined || !built.split) return { error: amount.error ?? built.error };
    const result = expenseShares({ amountMinor: amount.minor, paidBy: state.paidBy, split: built.split }, order);
    if (result instanceof SplitMathError) return { error: describeSplitError(result, fmt) };
    return { shares: new Map(result.map((s) => [s.memberId, s.amountMinor])) };
  })();

  // What's left to hand out in an exact or percent split, as a nudge under the rows.
  const remaining = ((): string | null => {
    if (state.type === "exact" && amount.minor !== undefined && built.split?.type === "exact") {
      const left = amount.minor - built.split.shares.reduce((a, s) => a + s.minor, 0);
      if (left === 0) return null;
      return left > 0 ? `${fmt(left)} left to assign` : `${fmt(-left)} more than the total`;
    }
    if (state.type === "percent" && built.split?.type === "percent") {
      const left = 10_000 - built.split.shares.reduce((a, s) => a + s.bp, 0);
      if (left === 0) return null;
      return left > 0 ? `${percentToInputString(left, locale)}% left` : `${percentToInputString(-left, locale)}% over`;
    }
    return null;
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

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
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

      <SplitRows
        type={state.type}
        people={people}
        state={state}
        set={set}
        symbol={symbol}
        shares={preview.shares}
        fmt={fmt}
      />

      <div aria-live="polite" className="min-h-5 text-sm">
        {error && (submitted || amount.minor !== undefined) ? (
          <p className="text-destructive">{error}</p>
        ) : remaining ? (
          <p className="text-muted-foreground">{remaining}</p>
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

/** One row per person: a tick (equal), an amount (exact) or a percent, with their share beside it. */
function SplitRows({
  type,
  people,
  state,
  set,
  symbol,
  shares,
  fmt,
}: {
  type: SplitType;
  people: DraftPerson[];
  state: FormState;
  set: (patch: Partial<FormState>) => void;
  symbol: string;
  shares?: Map<string, number>;
  fmt: (minor: number) => string;
}) {
  const base = useId();
  return (
    <ul className="divide-y rounded-xl border">
      {people.map((p, i) => {
        const id = `${base}-${i}`;
        const name = personLabel(people, p.id);
        const share = shares?.get(p.id);
        return (
          <li key={p.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
            {type === "equal" ? (
              <>
                <Checkbox
                  id={id}
                  checked={state.ticked.includes(p.id)}
                  onCheckedChange={(on) =>
                    set({ ticked: on ? [...state.ticked, p.id] : state.ticked.filter((t) => t !== p.id) })
                  }
                />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
                  {name}
                </label>
              </>
            ) : (
              <>
                <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
                  {name}
                </label>
                <div className="flex h-9 w-32 shrink-0 items-center rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30">
                  {type === "exact" && (
                    <span aria-hidden className="pl-2.5 text-sm text-muted-foreground select-none">
                      {symbol}
                    </span>
                  )}
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0"
                    value={(type === "exact" ? state.exact : state.percent)[p.id] ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const value = sanitizeKeepingCaret(e.currentTarget);
                      if (type === "exact") set({ exact: { ...state.exact, [p.id]: value } });
                      else set({ percent: { ...state.percent, [p.id]: value } });
                    }}
                    className="h-full w-full min-w-0 bg-transparent px-2 text-right text-base tabular-nums outline-none placeholder:text-muted-foreground/70 sm:text-sm"
                  />
                  {type === "percent" && (
                    <span aria-hidden className="pr-2.5 text-sm text-muted-foreground select-none">
                      %
                    </span>
                  )}
                </div>
              </>
            )}
            <span
              className={cn(
                "w-24 shrink-0 text-right text-sm tabular-nums",
                share ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {share ? fmt(share) : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
