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
import { AnalyticsInsightsDemo } from "./analytics-insights-demo";
import { DEMO_RANGES, DemoTrendCard, demoRangeTotals, type DemoRange } from "./analytics-trend-demo";
import { demoAmount, useDemoMoney, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Range = DemoRange;
type View = "overview" | "insights";
type Kind = "expense" | "income";

/**
 * Each range's categories, as shares of its spending. The amounts are worked
 * out from the range's totals (`demoRangeTotals`) so the breakdown, the cards
 * and the trend add up to the same figures.
 */
const EXPENSE_WEIGHTS: Record<Range, { name: string; icon: string; weight: number }[]> = {
  month: [
    { name: "Housing", icon: "🏠", weight: 120000 },
    { name: "Groceries", icon: "🛒", weight: 51350 },
    { name: "Food & Dining", icon: "🍽️", weight: 18400 },
    { name: "Transport", icon: "🚆", weight: 12600 },
    { name: "Utilities", icon: "💡", weight: 6800 },
  ],
  quarter: [
    { name: "Housing", icon: "🏠", weight: 360000 },
    { name: "Groceries", icon: "🛒", weight: 148900 },
    { name: "Food & Dining", icon: "🍽️", weight: 61200 },
    { name: "Transport", icon: "🚆", weight: 39800 },
    { name: "Utilities", icon: "💡", weight: 21400 },
    { name: "Health", icon: "⚕️", weight: 14600 },
  ],
  year: [
    { name: "Housing", icon: "🏠", weight: 1440000 },
    { name: "Groceries", icon: "🛒", weight: 402700 },
    { name: "Food & Dining", icon: "🍽️", weight: 168900 },
    { name: "Transport", icon: "🚆", weight: 104300 },
    { name: "Utilities", icon: "💡", weight: 58200 },
    { name: "Health", icon: "⚕️", weight: 41100 },
    { name: "Entertainment", icon: "🎬", weight: 33800 },
  ],
};

/** `total` split by `weights` in whole minor units, the leftover to the largest shares. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts.length, left--) parts[i]! += 1;
  return parts;
}

/** Minor units throughout, exactly like the app's aggregates. */
const BREAKDOWN = Object.fromEntries(
  DEMO_RANGES.map(({ id }) => {
    const totals = demoRangeTotals(id);
    const months = DEMO_RANGES.findIndex((r) => r.id === id);
    const salary = 200000 * [1, 3, 12][months]!;
    const amounts = apportion(totals.expense, EXPENSE_WEIGHTS[id].map((c) => c.weight));
    return [
      id,
      {
        expense: EXPENSE_WEIGHTS[id].map((c, i) => ({ name: c.name, icon: c.icon, value: amounts[i]! })),
        income: [
          { name: "Salary", icon: "💼", value: salary },
          { name: "Freelance", icon: "🧾", value: totals.income - salary },
        ],
      },
    ];
  }),
) as Record<Range, Record<Kind, { name: string; icon: string; value: number }[]>>;

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
 * The analytics page: three totals, a category breakdown, and income against
 * expenses over the range you pick, in columns by day, week or month
 * (`analytics-trend-demo.tsx`) — and, behind the "Insights & trends" tab, what
 * the paid plans add (`analytics-insights-demo.tsx`).
 *
 * The stat cards are the app's markup and the trend is its `buildTrend`; the chart is the app's
 * `CategoryPieChart`, through the lazy wrapper the homepage uses. Changing the
 * range or flipping between expense and income swaps the real dataset, so the
 * chart, the totals and the breakdown all move together — the point being that
 * the answer is already there rather than something you assemble.
 */
export function AnalyticsDemo() {
  const [view, setView] = useState<View>("overview");
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

  return (
    <DemoFrame
      label="Interactive analytics demo"
      active="/app/analytics"
      className="h-[42rem]"
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <div
            role="group"
            aria-label="Analytics view"
            className="no-scrollbar flex h-8 min-w-0 max-w-full shrink items-center overflow-x-auto rounded-full border bg-muted/50 p-0.5 text-xs"
          >
            {(
              [
                ["overview", "Overview"],
                ["insights", "Insights & trends"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 transition-colors",
                  view === id
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
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
          <div
            className={cn(
              "no-scrollbar flex h-8 min-w-0 max-w-full shrink items-center overflow-x-auto rounded-full border bg-muted/50 p-0.5 text-xs",
              view !== "overview" && "hidden",
            )}
          >
            {DEMO_RANGES.map((r) => (
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
      <div
        tabIndex={0}
        role="group"
        aria-label={view === "overview" ? "Analytics breakdown" : "Insights and trends"}
        className="h-full space-y-4 overflow-y-auto px-4 py-4"
      >
        {view === "insights" ? (
          <AnalyticsInsightsDemo money={money} />
        ) : (
          <>
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

            <DemoTrendCard
              range={range}
              money={money}
              kept={false}
              description="Over the range you pick — one column per day, week or month"
            />
          </>
        )}
      </div>
    </DemoFrame>
  );
}
