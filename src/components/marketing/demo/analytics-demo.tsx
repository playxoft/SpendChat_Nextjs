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
import { DEMO_CURRENCY, DEMO_LOCALE } from "./demo-data";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Range = "month" | "quarter" | "year";
type Kind = "expense" | "income";

const RANGES: { id: Range; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "Last 3 months" },
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

const MAX_TREND = Math.max(...TREND.flatMap((t) => [t.income, t.expense]), 1);

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
          "mt-1 text-2xl font-semibold tabular-nums",
          positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * The analytics page: three totals, a category breakdown, and six months of
 * income against expenses.
 *
 * The stat cards and trend bars are the app's markup; the chart is the app's
 * `CategoryPieChart`, through the lazy wrapper the homepage uses. Changing the
 * range or flipping between expense and income swaps the real dataset, so the
 * chart, the totals and the breakdown all move together — the point being that
 * the answer is already there rather than something you assemble.
 */
export function AnalyticsDemo() {
  const [range, setRange] = useState<Range>("month");
  const [kind, setKind] = useState<Kind>("expense");

  const data = BREAKDOWN[range][kind];
  const totals = useMemo(() => {
    const income = BREAKDOWN[range].income.reduce((s, c) => s + c.value, 0);
    const expense = BREAKDOWN[range].expense.reduce((s, c) => s + c.value, 0);
    return { income, expense, net: income - expense };
  }, [range]);

  return (
    <DemoFrame
      label="Interactive analytics demo"
      active="/app/analytics"
      className="h-[42rem]"
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="inline-flex h-8 items-center rounded-full border bg-muted/50 p-0.5 text-sm">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                aria-pressed={range === r.id}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
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
            value={formatMoney(totals.income, DEMO_CURRENCY, DEMO_LOCALE)}
            positive
          />
          <StatCard
            label="Expenses"
            value={formatMoney(totals.expense, DEMO_CURRENCY, DEMO_LOCALE)}
          />
          <StatCard
            label="Net"
            value={formatMoney(totals.net, DEMO_CURRENCY, DEMO_LOCALE)}
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
            {/* Keyed on the dataset: recharts holds its computed geometry across
                prop changes, so swapping the slices out from under it leaves the
                old shape on screen. A fresh mount is cheap here and always right. */}
            <LazyCategoryChart
              key={`${range}-${kind}`}
              data={data}
              currency={DEMO_CURRENCY}
              locale={DEMO_LOCALE}
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
            <ul className="space-y-3">
              {TREND.map((t) => (
                <li key={t.month} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">
                    {t.month}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div
                      className="h-2.5 rounded-full bg-emerald-500/70"
                      style={{ width: `${(t.income / MAX_TREND) * 100}%` }}
                    />
                    <div
                      className="h-2.5 rounded-full bg-foreground/60"
                      style={{ width: `${(t.expense / MAX_TREND) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {formatMoney(t.income - t.expense, DEMO_CURRENCY, DEMO_LOCALE)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </DemoFrame>
  );
}
