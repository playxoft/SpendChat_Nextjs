"use client";

import { LazyCategoryChart } from "@/components/marketing/lazy-category-chart";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";

/**
 * The homepage's spending breakdown — a ranked list beside the analytics chart.
 *
 * A client component purely so the amounts follow the visitor's currency like
 * every other demo on the page; leaving it server-rendered in dollars put `$`
 * figures directly beneath a tracker showing `₹`, which reads as a bug.
 *
 * The list is not decoration. It carries the same numbers as the chart in plain
 * text, which is what makes it safe for the chart itself to be lazy and
 * `ssr: false` — a crawler, and anyone whose chart hasn't arrived yet, still
 * gets the breakdown. Keep it that way if this is ever reworked.
 */
export function SpendBreakdown({
  data,
}: {
  /** Category totals in USD minor units; scaled to the visitor's currency here. */
  data: { name: string; icon: string; value: number }[];
}) {
  const money = useDemoMoney();
  const scaled = data.map((category) => ({
    ...category,
    value: demoAmount(category.value, money),
  }));
  const total = scaled.reduce((sum, c) => sum + c.value, 0);

  return (
    <>
      <dl className="mt-6 space-y-2">
        {scaled.map((category) => {
          const share = Math.round((category.value / total) * 100);
          return (
            <div key={category.name} className="flex items-center gap-3">
              <dt className="flex w-40 shrink-0 items-center gap-1.5 text-sm">
                <span aria-hidden>{category.icon}</span>
                {category.name}
              </dt>
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-foreground/70"
                  style={{ width: `${share}%` }}
                />
              </div>
              <dd className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {formatMoney(category.value, money.code, money.locale)}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}

/** The chart half, split out so the two columns can sit either side of the copy. */
export function SpendChart({
  data,
}: {
  data: { name: string; icon: string; value: number }[];
}) {
  const money = useDemoMoney();
  return (
    <LazyCategoryChart
      data={data.map((c) => ({ ...c, value: demoAmount(c.value, money) }))}
      currency={money.code}
      locale={money.locale}
    />
  );
}
