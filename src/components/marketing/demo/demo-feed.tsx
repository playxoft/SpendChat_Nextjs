"use client";

import { Fragment } from "react";
import { DayDivider } from "@/components/app/day-divider";
import { TransactionBubble } from "@/components/app/transaction-bubble";
import { type DemoTxn } from "./demo-data";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney, signedMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The chat feed, built from the app's own `DayDivider` and `TransactionBubble`.
 *
 * Both are pure presentational components with no server dependencies, so the
 * marketing pages import them directly — which is the whole point. A visitor
 * who tries the demo and then signs up sees the same bubbles, the same
 * income-left / expense-right alignment, and the same emerald "+" on income.
 *
 * Rows are grouped into day sections in the order they appear, the way the real
 * feed groups by date. Grouping on *runs* rather than collecting all rows with
 * the same label matters: a transaction the visitor adds is appended to the
 * end, and it should open a new "Today" section rather than teleport up into an
 * earlier one.
 */
export function DemoFeed({
  txns,
  defaultDay = "Today",
  className,
}: {
  txns: DemoTxn[];
  /** Day label for rows that don't carry one. */
  defaultDay?: string;
  className?: string;
}) {
  const money = useDemoMoney();

  const groups: { day: string; rows: DemoTxn[] }[] = [];
  for (const txn of txns) {
    const day = txn.day ?? defaultDay;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(txn);
    else groups.push({ day, rows: [txn] });
  }

  return (
    <div className={cn("space-y-2", className)}>
      {groups.map((group, i) => (
        <Fragment key={`${group.day}-${i}`}>
          <DayDivider label={group.day} />
          {group.rows.map((t) => (
            <TransactionBubble
              key={t.id}
              type={t.type}
              amountLabel={formatMoney(
                signedMinor(t.type, demoAmount(t.amountMinor, money)),
                money.code,
                money.locale,
                { signed: true },
              )}
              title={t.title}
              description={t.description}
              categoryName={t.categoryName}
              categoryIcon={t.categoryIcon}
              timeLabel={t.timeLabel}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
