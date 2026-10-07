"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { fromBasisPoints } from "@/lib/split-math";
import { myPart, payersLabel } from "@/lib/split-display";
import type { SplitExpenseView } from "@/services/split-ledger";
import { MemberAvatar } from "./member-avatar";

const SPLIT_LABEL: Record<SplitExpenseView["splitType"], string> = {
  equal: "Split equally",
  exact: "Split by exact amounts",
  percent: "Split by percent",
};

/**
 * One expense, opened from its bubble: everyone's share, where you stand, and
 * what you can do — put your share in your workspace (or bring that entry up
 * to date, or take it out), and edit or delete it if it's yours to change.
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
              <SheetTitle className="pr-8">{expense.title}</SheetTitle>
              <SheetDescription>
                {fmt(expense.amountMinor)} · {formatDateLabel(expense.occurredOn, locale)} ·{" "}
                {payersLabel(expense.payers.map((p) => ({ name: p.name, isYou: p.memberId === meMemberId })))} paid
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 overflow-y-auto px-4 pb-6">
              {expense.payers.length > 1 && (
                <section aria-labelledby="split-detail-payers" className="space-y-2">
                  <h3 id="split-detail-payers" className="text-sm font-medium">
                    Paid by
                  </h3>
                  <ul className="space-y-2">
                    {expense.payers.map((p) => (
                      <li key={p.memberId} className="flex items-center gap-2.5 text-sm">
                        <MemberAvatar id={p.memberId} name={p.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate">
                          {p.memberId === meMemberId ? `${p.name} (you)` : p.name}
                        </span>
                        <span className="tabular-nums">{fmt(p.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section aria-labelledby="split-detail-shares" className="space-y-2">
                <h3 id="split-detail-shares" className="text-sm font-medium">
                  {SPLIT_LABEL[expense.splitType]}
                </h3>
                <ul className="space-y-2">
                  {expense.shares.map((s) => (
                    <li key={s.memberId} className="flex items-center gap-2.5 text-sm">
                      <MemberAvatar id={s.memberId} name={s.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {s.memberId === meMemberId ? `${s.name} (you)` : s.name}
                      </span>
                      {s.percentBp !== null && (
                        <span className="text-xs text-muted-foreground">{fromBasisPoints(s.percentBp)}%</span>
                      )}
                      <span className="tabular-nums">{fmt(s.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="split-detail-you" className="space-y-2">
                <h3 id="split-detail-you" className="text-sm font-medium">
                  You
                </h3>
                <p className="text-sm">
                  {part?.kind === "lent"
                    ? `You lent ${fmt(part.amountMinor)}`
                    : part?.kind === "owe"
                      ? `You owe ${fmt(part.amountMinor)}`
                      : part?.kind === "own"
                        ? "You paid this just for yourself"
                        : part?.kind === "even"
                          ? "You paid your share"
                          : "You're not part of this expense"}
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
