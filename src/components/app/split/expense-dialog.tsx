"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SplitPeopleList, type SplitPerson } from "@/components/split/split-people-list";
import { createSplitExpense, updateSplitExpense } from "@/actions/split";
import { formatMoney, minorToInputString, toMinorUnits } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";
import { acceptAmountInput } from "@/lib/split-display";
import { percentToInputString } from "@/lib/split-math";
import { SPLIT_EXPENSE_TITLE_MAX } from "@/lib/validation";
import type { SplitExpenseView } from "@/services/split-ledger";
import { MemberAvatar } from "./member-avatar";
import { PaidByPicker } from "./paid-by-picker";
import { PayerSliders } from "./payer-sliders";
import { useExpenseEditor, type EditorStart, type SplitType } from "./use-expense-editor";

export type { SplitType } from "./use-expense-editor";

/** Someone who can be on an expense. `email` only when the viewer may see it (the creator). */
export type ExpenseMember = { id: string; name: string; email?: string | null };

/** What the chat composer had put together, carried into the full editor. */
export type ExpenseDraft = EditorStart & {
  title: string;
  /** As typed, in the viewer's number format. */
  amount: string;
  date: string;
};

/** Minor units from a typed amount, or 0 while it isn't a valid one. */
export function typedMinor(amount: string, currency: string, locale: string): number {
  const value = amount.trim() ? parseAmountInput(amount, locale) : null;
  if (value === null || value <= 0) return 0;
  return Math.max(toMinorUnits(value, currency), 0);
}

function startOf(
  expense: SplitExpenseView | null | undefined,
  draft: ExpenseDraft | null | undefined,
  members: ExpenseMember[],
  meMemberId: string,
): EditorStart {
  if (expense) {
    return {
      splitType: expense.splitType,
      included: expense.shares.map((s) => s.memberId),
      payers: expense.payers.map((p) => ({ memberId: p.memberId, amountMinor: p.amountMinor })),
      exact: Object.fromEntries(expense.shares.map((s) => [s.memberId, s.amountMinor])),
      percent: Object.fromEntries(
        expense.shares.filter((s) => s.percentBp !== null).map((s) => [s.memberId, s.percentBp!]),
      ),
    };
  }
  if (draft) return draft;
  return { splitType: "equal", included: members.map((m) => m.id), payers: [{ memberId: meMemberId }] };
}

const HINT: Record<SplitType, string> = {
  equal: "If it doesn't divide evenly, whoever paid the most takes the leftover first.",
  exact: "Slide to set each person's amount — the others rebalance, so it always adds up.",
  percent: "Slide to set each person's percent — the others rebalance to 100%.",
};

/**
 * Add or edit an expense: what, how much, who paid (one or several), and how
 * it's divided — equally between ticked people, or by amounts or percents on
 * sliders that always add up. The shares shown run the same `computeShares`
 * the server runs, so they're exactly what gets saved.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  groupId,
  currency,
  locale,
  today,
  members,
  meMemberId,
  expense,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  currency: string;
  locale: string;
  today: string;
  /** Who can be on it: the group's people (plus anyone already on this expense). */
  members: ExpenseMember[];
  meMemberId: string;
  /** Present when editing. */
  expense?: SplitExpenseView | null;
  /** A new expense started in the composer: its fields so far. */
  draft?: ExpenseDraft | null;
  /** After a successful save (the composer clears itself). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);
  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const totalMinor = typedMinor(amount, currency, locale);
  const editor = useExpenseEditor({
    members,
    meMemberId,
    currency,
    totalMinor,
    start: startOf(expense, draft, members, meMemberId),
    format: fmt,
  });

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const nextAmount = expense ? minorToInputString(expense.amountMinor, currency, locale) : (draft?.amount ?? "");
      setTitle(expense?.title ?? draft?.title ?? "");
      setAmount(nextAmount);
      setDate(expense?.occurredOn ?? draft?.date ?? today);
      editor.reset(startOf(expense, draft, members, meMemberId), typedMinor(nextAmount, currency, locale));
    }
  }

  const people: SplitPerson[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email ?? null,
    isYou: m.id === meMemberId,
  }));
  const type = editor.splitType;
  const shares = editor.preview.shares;
  const percentText = (bp: number) => `${percentToInputString(bp, locale)}%`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Add a title");
    const value = amount.trim() ? parseAmountInput(amount, locale) : null;
    if (value === null || value <= 0) return toast.error("Enter the amount");
    if (totalMinor <= 0) return toast.error(`Amount is too small for ${currency}`);
    if (editor.preview.error || !shares) return toast.error(editor.preview.error ?? "Check the split");
    const input = editor.input({ title: title.trim(), amount: value, occurredOn: date });
    setPending(true);
    void (async () => {
      const res = await (expense
        ? updateSplitExpense(groupId, expense.id, input)
        : createSplitExpense(groupId, input)
      ).finally(() => setPending(false));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(expense ? "Expense updated" : "Expense added");
      onSaved?.();
      onOpenChange(false);
      router.refresh();
    })();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Amounts are in {currency}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="split-expense-title">What for</Label>
              <Input
                id="split-expense-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={SPLIT_EXPENSE_TITLE_MAX}
                placeholder="Dinner"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-expense-amount">Amount</Label>
              <Input
                id="split-expense-amount"
                value={amount}
                onChange={(e) => {
                  const typed = e.target.value;
                  setAmount((prev) => acceptAmountInput(prev, typed, locale));
                }}
                inputMode="decimal"
                placeholder="0"
                className="tabular-nums"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="split-expense-paid-by">Paid by</Label>
              <PaidByPicker
                id="split-expense-paid-by"
                members={members}
                meMemberId={meMemberId}
                payerIds={editor.payerIds}
                included={editor.included}
                onChange={editor.setPayerIds}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-expense-date">Date</Label>
              <DatePicker id="split-expense-date" value={date} onChange={setDate} locale={locale} className="w-full" />
            </div>
          </div>

          <PayerSliders editor={editor} people={people} totalMinor={totalMinor} format={fmt} className="rounded-xl border" />

          <div className="space-y-2">
            <Tabs value={type} onValueChange={(v) => editor.setSplitType(v as SplitType)}>
              <TabsList className="w-full">
                <TabsTrigger value="equal">Equally</TabsTrigger>
                <TabsTrigger value="exact">Amounts</TabsTrigger>
                <TabsTrigger value="percent">Percent</TabsTrigger>
              </TabsList>
            </Tabs>
            <SplitPeopleList
              people={people}
              included={editor.included}
              onIncludedChange={editor.setIncluded}
              avatar={(p) => <MemberAvatar id={p.id} name={p.name} size="sm" />}
              shareText={(id) => (shares?.has(id) ? fmt(shares.get(id)!) : null)}
              sliders={
                type === "exact" && totalMinor > 0
                  ? { state: editor.exact, step: editor.moneyStep, format: fmt, onMove: editor.moveExact }
                  : type === "percent"
                    ? { state: editor.percent, step: editor.percentStep, format: percentText, onMove: editor.movePercent }
                    : null
              }
              sliderAside={type === "percent" ? (id) => percentText(editor.percent.values[id] ?? 0) : undefined}
            />
            <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {editor.preview.error ??
                (type === "exact" && totalMinor === 0 ? "Enter the amount to set each person's part." : HINT[type])}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : expense ? "Save" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
