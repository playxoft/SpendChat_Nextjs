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
  /** Null when the expense was added on a different day than it's dated (the divider shows its date). */
  timeLabel: string | null;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mine = expense.paidBy.memberId === meMemberId;
  const part = myPart(expense, meMemberId);
  const fmt = (m: number) => formatMoney(m, currency, locale);
  const payer = mine ? "You" : expense.paidBy.name;
  const people = expense.shares.length;
  const partText =
    part.kind === "lent"
      ? `You lent ${fmt(part.amountMinor)}`
      : part.kind === "owe"
        ? `You owe ${fmt(part.amountMinor)}`
        : part.kind === "own"
          ? "Just you"
          : "Not involved";
  const workspaceNote = expense.myShare?.added
    ? expense.myShare.changedSinceAdded
      ? "Changed since you added it to your workspace"
      : "In your workspace"
    : null;

  return (
    <div
      className={cn(
        "group flex w-full max-w-[85%] items-end gap-1.5 animate-rise sm:max-w-sm sm:gap-2",
        mine && "ml-auto flex-row-reverse",
      )}
    >
      <MemberAvatar id={expense.paidBy.memberId} name={expense.paidBy.name} />
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          // Only the bubble's own keys — never one bubbling up from inside it.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`${expense.title}, ${fmt(expense.amountMinor)}, ${payer} paid. ${partText}.${workspaceNote ? ` ${workspaceNote}.` : ""}`}
        className={cn(
          "min-w-0 flex-1 cursor-pointer rounded-2xl border bg-card px-3 py-2 shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-3.5 sm:py-2.5",
          mine ? "rounded-br-sm" : "rounded-bl-sm",
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
            {partText}
          </span>
          {workspaceNote && (
            <span aria-hidden className="inline-flex items-center text-muted-foreground" title={workspaceNote}>
              {expense.myShare?.changedSinceAdded ? <RefreshCw className="size-3" /> : <Check className="size-3" />}
            </span>
          )}
          {timeLabel && <span className="ml-auto shrink-0 text-muted-foreground">{timeLabel}</span>}
        </div>
      </div>
      {/* Outside the bubble, so it isn't a control nested in a control — and
          its keys never reach the bubble's. Faint until the row is hovered or
          it's focused; always shown on touch screens. */}
      {expense.canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Options for ${expense.title}`}
              className="shrink-0 self-center opacity-50 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={mine ? "start" : "end"}>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
