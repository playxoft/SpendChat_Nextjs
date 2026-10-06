"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSplitExpense, updateSplitExpense } from "@/actions/split";
import { formatMoney, minorToInputString, toMinorUnits } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";
import {
  computeShares,
  fromBasisPoints,
  SplitMathError,
  toBasisPoints,
  type ShareSpec,
} from "@/lib/split-math";
import { SPLIT_EXPENSE_TITLE_MAX, type SplitExpenseInput } from "@/lib/validation";
import type { SplitExpenseView } from "@/services/split-ledger";

type SplitType = "equal" | "exact" | "percent";

export type ExpenseMember = { id: string; name: string };

/** Major units from a typed string in the viewer's number format, or null. */
function parse(value: string, locale: string): number | null {
  if (!value.trim()) return null;
  return parseAmountInput(value, locale);
}

/**
 * Add or edit an expense: what, how much, who paid, and how it's divided —
 * equally between ticked people, by exact amounts, or by percent. The preview
 * runs the same `computeShares` the server runs, so it shows exactly the
 * shares that will be saved (including who gets a leftover paisa).
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
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [paidBy, setPaidBy] = React.useState(meMemberId);
  const [type, setType] = React.useState<SplitType>("equal");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  const [exact, setExact] = React.useState<Record<string, string>>({});
  const [percent, setPercent] = React.useState<Record<string, string>>({});

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (expense) {
        setTitle(expense.title);
        setAmount(minorToInputString(expense.amountMinor, currency, locale));
        setDate(expense.occurredOn);
        setPaidBy(expense.paidBy.memberId);
        setType(expense.splitType);
        setTicked(new Set(expense.shares.map((s) => s.memberId)));
        setExact(
          Object.fromEntries(
            expense.shares.map((s) => [s.memberId, minorToInputString(s.amountMinor, currency, locale)]),
          ),
        );
        setPercent(
          Object.fromEntries(
            expense.shares.map((s) => [s.memberId, s.percentBp === null ? "" : String(fromBasisPoints(s.percentBp))]),
          ),
        );
      } else {
        setTitle("");
        setAmount("");
        setDate(today);
        setPaidBy(meMemberId);
        setType("equal");
        setTicked(new Set(members.map((m) => m.id)));
        setExact({});
        setPercent({});
      }
    }
  }

  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const total = parse(amount, locale);

  /** The inputs as the API takes them, or an error to show. */
  // Plain computations — the React Compiler memoizes them.
  const built = ((): { input?: SplitExpenseInput; spec?: ShareSpec; error?: string } => {
    if (total === null || total <= 0) return { error: "Enter the amount" };
    const base = { title: title.trim(), amount: total, paidBy, occurredOn: date };
    if (type === "equal") {
      const memberIds = members.filter((m) => ticked.has(m.id)).map((m) => m.id);
      return { input: { ...base, splitType: "equal", memberIds }, spec: { type: "equal", memberIds } };
    }
    if (type === "exact") {
      const shares: { memberId: string; amount: number }[] = [];
      for (const m of members) {
        const raw = exact[m.id] ?? "";
        if (!raw.trim()) continue;
        const v = parse(raw, locale);
        if (v === null || v < 0) return { error: `Check ${m.name}'s amount` };
        shares.push({ memberId: m.id, amount: v });
      }
      return {
        input: { ...base, splitType: "exact", shares },
        spec: {
          type: "exact",
          shares: shares.map((s) => ({ memberId: s.memberId, amountMinor: toMinorUnits(s.amount, currency) })),
        },
      };
    }
    const shares: { memberId: string; percent: number }[] = [];
    for (const m of members) {
      const raw = percent[m.id] ?? "";
      if (!raw.trim()) continue;
      const v = parse(raw, locale);
      if (v === null || v < 0 || v > 100) return { error: `Check ${m.name}'s percent` };
      shares.push({ memberId: m.id, percent: v });
    }
    return {
      input: { ...base, splitType: "percent", shares },
      spec: { type: "percent", shares: shares.map((s) => ({ memberId: s.memberId, bp: toBasisPoints(s.percent) })) },
    };
  })();

  const preview = ((): { shares?: Map<string, number>; error?: string } => {
    if (!built.spec || total === null) return { error: built.error };
    try {
      const shares = computeShares(toMinorUnits(total, currency), paidBy, built.spec, (m) =>
        formatMoney(m, currency, locale),
      );
      return { shares: new Map(shares.map((s) => [s.memberId, s.amountMinor])) };
    } catch (err) {
      return { error: err instanceof SplitMathError ? err.message : "Check the amounts" };
    }
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Add a title");
    if (!built.input || preview.error) return toast.error(preview.error ?? built.error ?? "Check the amounts");
    const input = built.input;
    setPending(true);
    void (async () => {
      const res = expense
        ? await updateSplitExpense(groupId, expense.id, input)
        : await createSplitExpense(groupId, input);
      setPending(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(expense ? "Expense updated" : "Expense added");
      onOpenChange(false);
      router.refresh();
    })();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Amounts are in {currency}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id === meMemberId ? `${m.name} (you)` : m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-expense-date">Date</Label>
              <DatePicker id="split-expense-date" value={date} onChange={setDate} locale={locale} className="w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <Tabs value={type} onValueChange={(v) => setType(v as SplitType)}>
              <TabsList className="w-full">
                <TabsTrigger value="equal">Equally</TabsTrigger>
                <TabsTrigger value="exact">Exact amounts</TabsTrigger>
                <TabsTrigger value="percent">Percent</TabsTrigger>
              </TabsList>
            </Tabs>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  {type === "equal" ? (
                    <Checkbox
                      id={`split-share-${m.id}`}
                      checked={ticked.has(m.id)}
                      onCheckedChange={(on) => {
                        const next = new Set(ticked);
                        if (on) next.add(m.id);
                        else next.delete(m.id);
                        setTicked(next);
                      }}
                    />
                  ) : null}
                  <label htmlFor={type === "equal" ? `split-share-${m.id}` : `split-input-${m.id}`} className="flex-1 truncate text-sm">
                    {m.id === meMemberId ? `${m.name} (you)` : m.name}
                  </label>
                  {type === "exact" && (
                    <Input
                      id={`split-input-${m.id}`}
                      value={exact[m.id] ?? ""}
                      onChange={(e) => setExact({ ...exact, [m.id]: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-28 text-right"
                    />
                  )}
                  {type === "percent" && (
                    <div className="flex items-center gap-1">
                      <Input
                        id={`split-input-${m.id}`}
                        value={percent[m.id] ?? ""}
                        onChange={(e) => setPercent({ ...percent, [m.id]: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-8 w-20 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                    {preview.shares?.has(m.id) ? fmt(preview.shares.get(m.id)!) : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {preview.error ?? "If it doesn't divide evenly, whoever paid takes the leftover."}
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
