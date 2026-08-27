"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LazyCategoryChart } from "@/components/marketing/lazy-category-chart";
import { DemoFrame } from "./demo-frame";
import { demoAmount, useDemoMoney, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Range = "month" | "quarter" | "year";
type Kind = "expense" | "income";

/**
 * Short labels, matching the app's own range toggle (`AnalyticsFilters`).
 * "Last 3 months" is two words longer than the control has room for on a phone,
 * and the segment it sits in is a fixed-height pill — the label doesn't get to
 * wrap, it gets clipped.
 */
const RANGES: { id: Range; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "3 months" },
  { id: "year", label: "This year" },
];

/** Minor units throughout, exactly like the app's aggregates. */
const BREAKDOWN: Record<Range, Record<Kind, { name: string; icon: string; value: number }[]>> = {
  month: {
    expense: [
      { name: "Housing", icon: "🏠", value: 120000 },
      { name: "Groceries", icon: "🛒", value: 51350 },
      { name: "Food & Dining", icon: "🍽️", value: 18400 },
      { name: "Transport", icon: "🚆", value: 12600 },
      { name: "Utilities", icon: "💡", value: 6800 },
    ],
    income: [
      { name: "Salary", icon: "💼", value: 200000 },
      { name: "Freelance", icon: "🧾", value: 35000 },
    ],
  },
  quarter: {
    expense: [
      { name: "Housing", icon: "🏠", value: 360000 },
      { name: "Groceries", icon: "🛒", value: 148900 },
      { name: "Food & Dining", icon: "🍽️", value: 61200 },
      { name: "Transport", icon: "🚆", value: 39800 },
      { name: "Utilities", icon: "💡", value: 21400 },
      { name: "Health", icon: "⚕️", value: 14600 },
    ],
    income: [
      { name: "Salary", icon: "💼", value: 600000 },
      { name: "Freelance", icon: "🧾", value: 92500 },
    ],
  },
  year: {
    expense: [
      { name: "Housing", icon: "🏠", value: 960000 },
      { name: "Groceries", icon: "🛒", value: 402700 },
      { name: "Food & Dining", icon: "🍽️", value: 168900 },
      { name: "Transport", icon: "🚆", value: 104300 },
      { name: "Utilities", icon: "💡", value: 58200 },
      { name: "Health", icon: "⚕️", value: 41100 },
      { name: "Entertainment", icon: "🎬", value: 33800 },
    ],
    income: [
      { name: "Salary", icon: "💼", value: 1600000 },
      { name: "Freelance", icon: "🧾", value: 248000 },
    ],
  },
};

const TREND = [
  { month: "Mar", income: 218000, expense: 191400 },
  { month: "Apr", income: 200000, expense: 176900 },
  { month: "May", income: 235000, expense: 204100 },
  { month: "Jun", income: 200000, expense: 168300 },
  { month: "Jul", income: 212000, expense: 198600 },
  { month: "Aug", income: 235000, expense: 209150 },
];

function StatCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          // `overflow-wrap: anywhere` because the number is the widest thing in
          // the card and some currencies make it much wider: a year of IDR
          // expenses is "Rp 144.000.000,00", and the space in it is a
          // non-breaking one, so there is no natural break for the browser to
          // take. Without this the value runs past the card and — the body
          // being `overflow-y-auto`, which computes `overflow-x` to `auto` —
          // puts a horizontal scrollbar inside the panel.
          "mt-1 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]",
          positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * The category breakdown in plain text — the same amounts and percentages the
 * chart's own legend carries.
 *
 * This is the card's server-rendered content, and it is not decoration. The
 * ring comes from `CategoryPieChart` inside a lazily-loaded, `lazy()`-gated
 * chunk, and the chart's ranked list is *inside that component* — so without
 * this, the whole breakdown would exist only after JS ran, on a page whose own
 * copy promises "a chart and a ranked list, not a chart alone". A crawler would
 * read a grey box.
 *
 * It goes in as `LazyCategoryChart`'s `fallback` rather than beside the chart
 * because the chart brings an identical list with it; side by side they'd be
 * the same five rows printed twice in one card. Handed over as the fallback,
 * the list is what's there until the ring arrives and what the ring's own list
 * then continues.
 */
function CategoryRanking({
  data,
  money,
}: {
  data: { name: string; icon: string; value: number }[];
  money: DemoMoneyFormat;
}) {
  // Guarded so an empty dataset can't divide by zero; every seeded range has
  // rows, but the component shouldn't depend on that.
  const total = data.reduce((sum, c) => sum + c.value, 0) || 1;

  return (
    <ol className="space-y-2 py-1">
      {data.map((category) => (
        <li
          key={category.name}
          className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span aria-hidden className="shrink-0">
              {category.icon}
            </span>
            <span className="truncate">{category.name}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatMoney(category.value, money.code, money.locale)} ·{" "}
            {Math.round((category.value / total) * 100)}%
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The analytics page: three totals, a category breakdown, and six months of
 * income against expenses.
 *
 * The stat cards and trend rows are the app's markup; the chart is the app's
 * `CategoryPieChart`, through the lazy wrapper the homepage uses. Changing the
 * range or flipping between expense and income swaps the real dataset, so the
 * chart, the totals and the breakdown all move together — the point being that
 * the answer is already there rather than something you assemble.
 */
export function AnalyticsDemo() {
  const [range, setRange] = useState<Range>("month");
  const [kind, setKind] = useState<Kind>("expense");
  const money = useDemoMoney();

  // Every figure is scaled into the visitor's currency at the same point, so
  // the cards, the chart and the trend can't drift apart by a rounding step.
  const data = useMemo(
    () =>
      BREAKDOWN[range][kind].map((slice) => ({
        ...slice,
        value: demoAmount(slice.value, money),
      })),
    [range, kind, money],
  );

  const totals = useMemo(() => {
    const income = BREAKDOWN[range].income.reduce(
      (sum, c) => sum + demoAmount(c.value, money),
      0,
    );
    const expense = BREAKDOWN[range].expense.reduce(
      (sum, c) => sum + demoAmount(c.value, money),
      0,
    );
    return { income, expense, net: income - expense };
  }, [range, money]);

  const trend = useMemo(
    () =>
      TREND.map((t) => ({
        month: t.month,
        income: demoAmount(t.income, money),
        expense: demoAmount(t.expense, money),
      })),
    [money],
  );
  const maxTrend = Math.max(...trend.flatMap((t) => [t.income, t.expense]), 1);

  return (
    <DemoFrame
      label="Interactive analytics demo"
      active="/app/analytics"
      className="h-[42rem]"
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          {/* The app's segmented range toggle, and the app's answer to a narrow
              screen with it: `min-w-0` + `shrink` let the pill give way instead
              of pushing the frame wider, and `overflow-x-auto` with `shrink-0`
              segments turns the overflow into a sideways scroll rather than
              labels wrapping inside a fixed-height capsule.

              `no-scrollbar`, not `scrollbar-slim`, per the split in
              `globals.css`: this is a row of controls, where a 6px bar is a
              sixth of the row's height and nothing is reachable only by
              dragging it. `scrollbar-slim` is for tables and grids, where the
              bar is the only thing saying there's more to the right. */}
          <div className="no-scrollbar flex h-8 min-w-0 max-w-full shrink items-center overflow-x-auto rounded-full border bg-muted/50 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                aria-pressed={range === r.id}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 transition-colors",
                  range === r.id
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      }
      bodyClassName="overflow-hidden"
    >
      <div className="h-full space-y-4 overflow-y-auto px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Income"
            value={formatMoney(totals.income, money.code, money.locale)}
            positive
          />
          <StatCard
            label="Expenses"
            value={formatMoney(totals.expense, money.code, money.locale)}
          />
          <StatCard
            label="Net"
            value={formatMoney(totals.net, money.code, money.locale)}
            positive={totals.net >= 0}
          />
        </div>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle>
                {kind === "income" ? "Income by category" : "Spending by category"}
              </CardTitle>
              <CardDescription>
                {kind === "income" ? "Income" : "Expenses"} for the selected range
              </CardDescription>
            </div>
            <div className="inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "rounded-full px-2.5 py-1 capitalize transition-colors",
                    kind === k
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* The ranked list is the fallback, so these numbers are in the
                server-rendered HTML whether or not the chart's chunk ever
                arrives; `chartKey` rebuilds the ring on a dataset change
                without resetting the gate that decides when it loads. Both are
                explained on `LazyCategoryChart`. */}
            <LazyCategoryChart
              chartKey={`${range}-${kind}`}
              data={data}
              currency={money.code}
              locale={money.locale}
              fallback={<CategoryRanking data={data} money={money} />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 6 months</CardTitle>
            <CardDescription>Income vs. expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" /> Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-foreground/60" /> Expense
              </span>
            </div>
            {/* Each month reads out in words before it's drawn.
                The two bars used to be the only place the month's income and
                expense existed: two empty `<div>`s whose widths were the data,
                told apart by colour alone. Nothing could read them out, and
                nobody who can't compare an emerald bar to a grey one could tell
                which was which — WCAG 1.1.1 and 1.4.1 in one row. So the
                amounts are labelled text now and the bars are `aria-hidden`
                decoration for the shape, which is all they were ever good for.
                The line wraps rather than truncating, because a high-multiplier
                currency makes three amounts much wider than this card. */}
            <ul className="space-y-3">
              {trend.map((t) => (
                <li key={t.month} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-medium">{t.month}</span>
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatMoney(t.income, money.code, money.locale)} in
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(t.expense, money.code, money.locale)} out
                    </span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      net{" "}
                      {formatMoney(t.income - t.expense, money.code, money.locale, {
                        signed: true,
                      })}
                    </span>
                  </div>
                  <div className="space-y-1" aria-hidden>
                    <div
                      className="h-2.5 rounded-full bg-emerald-500/70"
                      style={{ width: `${(t.income / maxTrend) * 100}%` }}
                    />
                    <div
                      className="h-2.5 rounded-full bg-foreground/60"
                      style={{ width: `${(t.expense / maxTrend) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </DemoFrame>
  );
}
