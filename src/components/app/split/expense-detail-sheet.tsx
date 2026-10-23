"use client";

import type * as React from "react";
import { CalendarDays, Check, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authorColorClass } from "@/lib/author-color";
import { formatDateLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { expenseDebts, fromBasisPoints } from "@/lib/split-math";
import { myPart, payersLabel } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import type { SplitExpenseView } from "@/services/split-ledger";
import { PartLine } from "./expense-bubble";
import { MemberAvatar } from "./member-avatar";

const SPLIT_LABEL: Record<SplitExpenseView["splitType"], string> = {
  equal: "Split equally",
  exact: "Split by exact amounts",
  percent: "Split by percent",
};

/** A small labelled fact under the amount: the date, how it's split. */
function Fact({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

/**
 * One expense, opened from its bubble: the amount up top with when and how it
 * was split, who paid it, everyone's share with whom they owe it to (the same
 * matching as the settle-up plan, `expenseDebts`), and where you stand —
 * then what you can do: put your share in your workspace (or bring that entry
 * up to date, or take it out), and edit or delete it if it's yours to change.
 */
export function ExpenseDetailSheet({
  expense,
  onOpenChange,
  meMemberId,
  currency,
  locale,
  busy,
  onAddToWorkspace,
  onUpdateEntry,
  onRemoveEntry,
  onEdit,
  onDelete,
}: {
  expense: SplitExpenseView | null;
  onOpenChange: (open: boolean) => void;
  meMemberId: string;
  currency: string;
  locale: string;
  busy: boolean;
  onAddToWorkspace: (e: SplitExpenseView) => void;
  onUpdateEntry: (e: SplitExpenseView) => void;
  onRemoveEntry: (e: SplitExpenseView) => void;
  onEdit: (e: SplitExpenseView) => void;
  onDelete: (e: SplitExpenseView) => void;
}) {
  const fmt = (m: number) => formatMoney(m, currency, locale);
  const part = expense ? myPart(expense, meMemberId) : null;
  const share = expense?.myShare ?? null;
  const nameOf = (id: string) =>
    expense?.shares.find((s) => s.memberId === id)?.name ||
    expense?.payers.find((p) => p.memberId === id)?.name ||
    "Someone";
  const debts = expense ? expenseDebts(expense.payers, expense.shares) : [];
  const label = (id: string, name: string) => (id === meMemberId ? `${name || "You"} (you)` : name || "Someone");
  /** What this expense means for one person: whom they owe, or what they get back. */
  const standing = (id: string): string => {
    const owes = debts.filter((d) => d.fromMemberId === id);
    if (owes.length > 0) {
      return owes.map((d) => `owes ${d.toMemberId === meMemberId ? "you" : nameOf(d.toMemberId)} ${fmt(d.amountMinor)}`).join(", ");
    }
    const back = debts.filter((d) => d.toMemberId === id).reduce((acc, d) => acc + d.amountMinor, 0);
    return back > 0 ? `gets back ${fmt(back)}` : "paid their share";
  };
  return (
    <Sheet open={expense !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeOnOutsideClick
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {expense && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 text-lg">{expense.title}</SheetTitle>
              <SheetDescription className="sr-only">
                {fmt(expense.amountMinor)}, {formatDateLabel(expense.occurredOn, locale)},{" "}
                {payersLabel(expense.payers.map((p) => ({ name: p.name, isYou: p.memberId === meMemberId })))} paid
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 overflow-y-auto px-4 pb-6">
              <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{fmt(expense.amountMinor)}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Fact icon={CalendarDays}>{formatDateLabel(expense.occurredOn, locale)}</Fact>
                  <Fact icon={Users}>
                    {SPLIT_LABEL[expense.splitType]}
                    {expense.shares.length > 1 ? ` · ${expense.shares.length} people` : ""}
                  </Fact>
                </div>
                <section aria-labelledby="split-detail-payers" className="space-y-2 border-t pt-3">
                  <h3 id="split-detail-payers" className="text-xs font-medium text-muted-foreground">
                    Paid by
                  </h3>
                  <ul className="space-y-2">
                    {expense.payers.map((p) => (
                      <li key={p.memberId} className="flex items-center gap-2.5 text-sm">
                        <MemberAvatar id={p.memberId} name={p.name} size="sm" />
                        <span className={cn("min-w-0 flex-1 truncate font-semibold", authorColorClass(p.memberId))}>
                          {label(p.memberId, p.name)}
                        </span>
                        <span className="font-medium tabular-nums">{fmt(p.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <section aria-labelledby="split-detail-shares" className="space-y-2">
                <h3 id="split-detail-shares" className="text-sm font-medium">
                  Everyone&apos;s share
                </h3>
                <ul className="divide-y rounded-lg border">
                  {expense.shares.map((s) => (
                    <li key={s.memberId} className="flex items-center gap-2.5 px-3 py-2">
                      <MemberAvatar id={s.memberId} name={s.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{label(s.memberId, s.name)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{standing(s.memberId)}</span>
                      </span>
                      {s.percentBp !== null && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                          {fromBasisPoints(s.percentBp)}%
                        </span>
                      )}
                      <span className="shrink-0 text-sm font-medium tabular-nums">{fmt(s.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                aria-labelledby="split-detail-you"
                className={cn(
                  "space-y-3 rounded-xl border p-4",
                  part?.kind === "lent" ? "border-emerald-500/30 bg-emerald-500/5" : "bg-card",
                )}
              >
                <h3 id="split-detail-you" className="text-xs font-medium text-muted-foreground">
                  Your part
                </h3>
                <p
                  className={cn(
                    "text-base",
                    part?.kind === "lent" && "text-emerald-700 dark:text-emerald-400",
                    (part?.kind === "none" || part?.kind === "own" || part?.kind === "even") && "text-muted-foreground",
                  )}
                >
                  {part?.kind === "own" ? (
                    "You paid this just for yourself"
                  ) : part?.kind === "none" ? (
                    "You're not part of this expense"
                  ) : part ? (
                    <PartLine part={part} format={fmt} nameOf={nameOf} />
                  ) : null}
                </p>
                {share && share.amountMinor === 0 && share.added ? (
                  <div className="space-y-2 rounded-lg border p-3 text-sm">
                    <p className="text-muted-foreground">
                      You&apos;re no longer in this expense, but your share is still in your workspace.
                    </p>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onRemoveEntry(expense)}>
                      Remove from my workspace
                    </Button>
                  </div>
                ) : share && share.added && share.changedSinceAdded ? (
                  <div className="space-y-2 rounded-lg border p-3 text-sm">
                    <p className="text-muted-foreground">
                      This changed since you added your share ({fmt(share.amountMinor)} now) to your workspace.
                    </p>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onUpdateEntry(expense)}>
                      Update my entry
                    </Button>
                  </div>
                ) : share && share.added ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="size-4" /> Your share is in your workspace.
                  </p>
                ) : share && share.amountMinor > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => onAddToWorkspace(expense)}>
                    Add my share to my workspace
                  </Button>
                ) : null}
              </section>

              {expense.canEdit && (
                <div className="flex gap-2 border-t pt-4">
                  <Button variant="outline" size="sm" onClick={() => onEdit(expense)}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(expense)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
