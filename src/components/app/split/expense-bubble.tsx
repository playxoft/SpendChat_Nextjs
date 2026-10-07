"use client";

import { Check, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/money";
import { myPart } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import type { SplitExpenseView } from "@/services/split-ledger";
import { MemberAvatar } from "./member-avatar";

const SPLIT_LABEL: Record<SplitExpenseView["splitType"], string> = {
  equal: "split equally",
  exact: "split by amounts",
  percent: "split by percent",
};

/**
 * An expense as a chat message — the tracker's bubble shape (rounded card,
 * the corner nearest the avatar squared off, `animate-rise`), with what a split
 * needs: title and amount, who paid and how it's split, and where the viewer
 * stands on it ("You lent ₹X", "You owe ₹Y", "Not involved"). What the viewer
 * paid sits on the right, like a sent message; everyone else's on the left.
 * Tapping it opens the details; editing and deleting are in its menu.
 */
export function ExpenseBubble({
  expense,
  meMemberId,
  currency,
  locale,
  timeLabel,
  onOpen,
  onEdit,
  onDelete,
}: {
  expense: SplitExpenseView;
  meMemberId: string;
  currency: string;
  locale: string;
  timeLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mine = expense.paidBy.memberId === meMemberId;
  const part = myPart(expense, meMemberId);
  const fmt = (m: number) => formatMoney(m, currency, locale);
  const payer = mine ? "You" : expense.paidBy.name;
  const people = expense.shares.length;

  return (
    <div
      className={cn(
        "group flex w-full max-w-[85%] items-end gap-2 animate-rise sm:max-w-sm sm:gap-2.5",
        mine && "ml-auto flex-row-reverse",
      )}
    >
      <MemberAvatar id={expense.paidBy.memberId} name={expense.paidBy.name} />
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`${expense.title}, ${fmt(expense.amountMinor)}, paid by ${payer}`}
        className={cn(
          "min-w-0 flex-1 cursor-pointer rounded-2xl border px-3 py-2 shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-3.5 sm:py-2.5",
          mine ? "rounded-br-sm bg-card" : "rounded-bl-sm bg-card",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-sm font-medium break-words">{expense.title}</span>
          <span className="shrink-0 text-base font-semibold tabular-nums">{fmt(expense.amountMinor)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {payer} paid · {SPLIT_LABEL[expense.splitType]}
          {people > 1 ? ` · ${people} people` : ""}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span
            className={cn(
              "font-medium",
              part.kind === "lent" && "text-emerald-600 dark:text-emerald-400",
              part.kind === "owe" && "text-foreground",
              (part.kind === "none" || part.kind === "own") && "text-muted-foreground",
            )}
          >
            {part.kind === "lent"
              ? `You lent ${fmt(part.amountMinor)}`
              : part.kind === "owe"
                ? `You owe ${fmt(part.amountMinor)}`
                : part.kind === "own"
                  ? "Just you"
                  : "Not involved"}
          </span>
          {expense.myShare?.added &&
            (expense.myShare.changedSinceAdded ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground" title="Changed since you added it to your workspace">
                <RefreshCw className="size-3" aria-hidden />
                <span className="sr-only">Changed since you added it to your workspace</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground" title="In your workspace">
                <Check className="size-3" aria-hidden />
                <span className="sr-only">In your workspace</span>
              </span>
            ))}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-muted-foreground">
            {timeLabel}
            {expense.canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Options for ${expense.title}`}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
