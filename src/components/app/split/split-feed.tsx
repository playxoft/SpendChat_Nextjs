"use client";

import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayDivider } from "@/components/app/day-divider";
import { dayDividerLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SplitExpenseView, SplitFeedItem, SplitSettlementView } from "@/services/split-ledger";
import { ExpenseBubble } from "./expense-bubble";

/** In the viewer's timezone (from the server), so server and browser render the same text. */
function timeLabel(value: Date | string, locale: string, timeZone: string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
}

/**
 * A recorded payment as a system line in the middle of the chat — "Asha paid
 * you ₹500" — the way a group chat shows events rather than messages. Whoever
 * may undo it gets a tap target.
 */
function PaymentLine({
  payment,
  meMemberId,
  currency,
  locale,
  timeZone,
  onUndo,
}: {
  payment: SplitSettlementView;
  meMemberId: string;
  currency: string;
  locale: string;
  timeZone: string;
  onUndo: () => void;
}) {
  const from = payment.from.memberId === meMemberId ? "You" : payment.from.name;
  const to = payment.to.memberId === meMemberId ? "you" : payment.to.name;
  const text = `${from} paid ${to} ${formatMoney(payment.amountMinor, currency, locale)}`;
  const toYou = payment.to.memberId === meMemberId;
  return (
    <div className="flex justify-center animate-rise">
      <span
        className={cn(
          "inline-flex max-w-[90%] items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs",
          toYou ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{text}</span>
        <span className="shrink-0 opacity-70">· {timeLabel(payment.createdAt, locale, timeZone)}</span>
        {payment.canDelete && (
          <button
            type="button"
            onClick={onUndo}
            className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
            aria-label={`Undo: ${text}`}
          >
            Undo
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The group as a chat: oldest at the top, newest at the bottom, a date pill
 * whenever the day changes — the tracker's feed, with expenses as bubbles and
 * payments as system lines. "Show earlier" pages back in time.
 */
export function SplitFeed({
  items,
  total,
  meMemberId,
  currency,
  locale,
  timeZone,
  today,
  loadingEarlier,
  onLoadEarlier,
  onOpenExpense,
  onEditExpense,
  onDeleteExpense,
  onUndoPayment,
}: {
  items: SplitFeedItem[];
  total: number;
  meMemberId: string;
  currency: string;
  locale: string;
  timeZone: string;
  today: string;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  onOpenExpense: (e: SplitExpenseView) => void;
  onEditExpense: (e: SplitExpenseView) => void;
  onDeleteExpense: (e: SplitExpenseView) => void;
  onUndoPayment: (p: SplitSettlementView) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Receipt className="size-6 text-muted-foreground" />
        </div>
        <h2 className="mt-4 font-medium">Nothing here yet</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Add the first expense below — type what it cost and what it was for, and everyone&apos;s
          share is worked out.
        </p>
      </div>
    );
  }

  const days: { date: string; items: SplitFeedItem[] }[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }

  return (
    <div className="space-y-1">
      {items.length < total && (
        <div className="flex justify-center pb-2">
          <Button variant="outline" size="sm" disabled={loadingEarlier} onClick={onLoadEarlier}>
            {loadingEarlier ? "Loading…" : "Show earlier"}
          </Button>
        </div>
      )}
      {days.map((d) => (
        <section key={d.date} aria-label={dayDividerLabel(d.date, today, locale)}>
          <DayDivider label={dayDividerLabel(d.date, today, locale)} />
          <div className="space-y-2">
            {d.items.map((item) =>
              item.kind === "expense" ? (
                <ExpenseBubble
                  key={item.id}
                  expense={item.expense}
                  meMemberId={meMemberId}
                  currency={currency}
                  locale={locale}
                  timeLabel={timeLabel(item.at, locale, timeZone)}
                  onOpen={() => onOpenExpense(item.expense)}
                  onEdit={() => onEditExpense(item.expense)}
                  onDelete={() => onDeleteExpense(item.expense)}
                />
              ) : (
                <PaymentLine
                  key={item.id}
                  payment={item.payment}
                  meMemberId={meMemberId}
                  currency={currency}
                  locale={locale}
                  timeZone={timeZone}
                  onUndo={() => onUndoPayment(item.payment)}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
