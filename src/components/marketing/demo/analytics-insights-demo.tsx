"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { demoAmount, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import {
  formatRounded,
  heatLevel,
  heatThresholds,
  pctChange,
  percentLabel,
  projectMonthEnd,
  projectionCurve,
  ratioLabel,
  savingsRate,
} from "@/lib/insights";
import { lowestPlanWith, PLAN_NAMES } from "@/lib/plans";
import { plansWith } from "@/lib/plan-copy";
import { cn } from "@/lib/utils";

/**
 * The "Insights & trends" half of the analytics demo — what the paid plans add.
 *
 * Seeded, made-up numbers (USD minor units, scaled into the visitor's currency
 * like every demo), but the judgements are the app's own: the month-end figure
 * comes from `projectMonthEnd` over three earlier months, the calendar's
 * shading from `heatThresholds`/`heatLevel`, and the percentages and "3×"
 * multiples from the helpers the app's sentences use (`lib/insights.ts`).
 * Everything is a module constant — no clock, no randomness — so the server
 * and the browser render the same thing.
 */

const DAY = 18;
const DAYS_IN_MONTH = 30;

/** One month's spending per day: rent on the 1st, weekly groceries, bills mid-month, a little most days. */
function monthDaily(len: number, dining: number): number[] {
  return Array.from({ length: len }, (_, i) => {
    const d = i + 1;
    let v = d % 6 === 0 ? 0 : 900;
    if (d === 1) v += 120_000;
    if (d % 7 === 6) v += 6_800;
    if (d % 7 === 5) v += dining;
    if (d === 15) v += 9_500;
    return v;
  });
}

const HISTORY = [monthDaily(31, 3_200), monthDaily(30, 2_900), monthDaily(31, 3_100)];
const THIS_MONTH = monthDaily(DAY, 4_300);
const SO_FAR = THIS_MONTH.reduce((a, b) => a + b, 0);
const USUAL_TOTAL = Math.round(HISTORY.reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0) / HISTORY.length);
const toDate = (h: number[]) => h.slice(0, DAY).reduce((a, b) => a + b, 0);
const PACE_INPUT = { soFar: SO_FAR, day: DAY, daysInMonth: DAYS_IN_MONTH, history: HISTORY };
const { projected: PROJECTED } = projectMonthEnd(PACE_INPUT);
const REST = projectionCurve(PACE_INPUT).rest;

const COMPARISONS = [
  { label: "Last month", value: toDate(HISTORY[2]!) },
  { label: "3-month average", value: Math.round(HISTORY.reduce((a, h) => a + toDate(h), 0) / HISTORY.length) },
  { label: "Same month last year", value: 151_900 },
];

/** Twelve months, oldest first, labelled by initial so nothing depends on today's date. */
const CASH_FLOW = [
  [235_000, 191_400], [218_000, 176_900], [235_000, 204_100], [200_000, 168_300],
  [212_000, 198_600], [235_000, 209_150], [218_000, 214_000], [235_000, 186_700],
  [200_000, 207_300], [235_000, 189_900], [218_000, 181_200], [235_000, 196_800],
].map(([income, expense]) => ({ income: income!, expense: expense! }));
const CASH_LABELS = ["O", "N", "D", "J", "F", "M", "A", "M", "J", "J", "A", "S"];
const INCOME_12 = CASH_FLOW.reduce((a, m) => a + m.income, 0);
const EXPENSE_12 = CASH_FLOW.reduce((a, m) => a + m.expense, 0);

const TRENDS = [
  { name: "Food & Dining", icon: "🍽️", series: [12_400, 11_600, 12_800, 12_100, 11_900, 8_600], usual: 6_130, soFar: 8_600 },
  { name: "Groceries", icon: "🛒", series: [27_200, 26_400, 27_200, 27_500, 27_200, 13_600], usual: 13_600, soFar: 13_600 },
  { name: "Transport", icon: "🚆", series: [7_400, 8_100, 7_900, 6_800, 7_600, 4_100], usual: 4_800, soFar: 4_100 },
];

const RECURRING = [
  { label: "Rent", icon: "🏠", typical: 120_000, next: "on the 1st" },
  { label: "Electricity", icon: "💡", typical: 9_500, next: "on the 15th" },
  { label: "Phone", icon: "📱", typical: 3_500, next: "on the 22nd" },
];
const UNUSUAL = { title: "Laptop repair", name: "Shopping", amount: 64_000, typical: 7_900 };

type Tab = "payees" | "tags" | "profiles";
const BREAKDOWN: Record<Tab, { label: string; total: number }[]> = {
  payees: [
    { label: "Landlord", total: 120_000 },
    { label: "Fresh Market", total: 27_200 },
    { label: "City Power", total: 9_500 },
    { label: "Corner Café", total: 6_100 },
  ],
  tags: [
    { label: "Home", total: 136_700 },
    { label: "Work", total: 11_400 },
    { label: "Weekend", total: 8_900 },
  ],
  profiles: [
    { label: "Household", total: 151_300 },
    { label: "Personal", total: 22_800 },
  ],
};

const HEAT = ["bg-muted", "bg-foreground/15", "bg-foreground/30", "bg-foreground/55", "bg-foreground/80"];

function Change({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted-foreground">—</span>;
  if (Math.round(change * 100) === 0) return <span className="tabular-nums text-muted-foreground">±0%</span>;
  const up = change > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", up ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
      {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
      <span className="sr-only">{up ? "up" : "down"}</span>
      {change >= 1 ? ratioLabel(1 + change) : percentLabel(change)}
    </span>
  );
}

function Panel({ title, description, children, className }: { title: string; description: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AnalyticsInsightsDemo({ money }: { money: DemoMoneyFormat }) {
  const [tab, setTab] = useState<Tab>("payees");
  const amt = (usd: number) => demoAmount(usd, money);
  const fmt = (usd: number) => formatRounded(amt(usd), money.code, money.locale);

  // The same wording rules as the app's sentence (`buildInsights`): within 5%
  // of usual reads "about the same".
  const paceChange = pctChange(PROJECTED ?? SO_FAR, USUAL_TOTAL) ?? 0;
  const paceTail =
    Math.abs(paceChange) < 0.05
      ? "about the same as usual"
      : `${percentLabel(paceChange)} ${paceChange > 0 ? "more" : "less"} than usual`;
  const kept = savingsRate(INCOME_12, EXPENSE_12) ?? 0;
  const dining = TRENDS[0]!;
  const notes = [
    {
      tone: Math.abs(paceChange) < 0.05 ? ("neutral" as const) : paceChange > 0 ? ("up" as const) : ("down" as const),
      text: `At this pace you'll spend about ${fmt(PROJECTED ?? SO_FAR)} this month — ${paceTail}.`,
    },
    {
      tone: "up" as const,
      text: `You've spent ${percentLabel(pctChange(dining.soFar, dining.usual) ?? 0)} more on ${dining.name} than usual by this point in the month.`,
    },
    {
      tone: "down" as const,
      text: `Over the last 12 months you kept ${percentLabel(kept)} of your income — ${fmt(INCOME_12 - EXPENSE_12)} in all.`,
    },
    {
      tone: "neutral" as const,
      text: `${RECURRING.length} payments come round every month — about ${fmt(RECURRING.reduce((a, r) => a + r.typical, 0))} a month together.`,
    },
  ];
  const TONE = { up: TrendingUp, down: TrendingDown, neutral: Lightbulb };

  // The pace chart: spent by each day (solid), the projection (dashed), last month (faint).
  const cum = (xs: number[]) => xs.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);
  const thisMonth = cum(THIS_MONTH);
  const lastMonth = cum(HISTORY[2]!).slice(0, DAYS_IN_MONTH);
  const projection = [SO_FAR, ...REST.map((r) => SO_FAR + r)];
  const top = Math.max(...lastMonth, ...projection, 1);
  const pt = (day: number, v: number) => `${((day - 1) / (DAYS_IN_MONTH - 1)) * 300},${100 - (v / top) * 92}`;

  const calendar = HISTORY[1]!;
  const thresholds = heatThresholds(calendar);
  const cashTop = Math.max(...CASH_FLOW.flatMap((m) => [m.income, m.expense]));
  const unusualRatio = UNUSUAL.amount / UNUSUAL.typical;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Insights &amp; trends</h3>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] leading-none text-secondary-foreground">
          {PLAN_NAMES[lowestPlanWith("advancedAnalytics")]}
        </span>
        <p className="w-full text-xs text-muted-foreground">
          On {plansWith("advancedAnalytics")}. On Free, this section shows sample numbers under a lock.
        </p>
      </div>

      <Panel title="Insights" description="What stands out this month so far">
        <ul className="grid gap-2 sm:grid-cols-2">
          {notes.map((n) => {
            const Icon = TONE[n.tone];
            return (
              <li key={n.text} className="flex gap-2.5 rounded-lg bg-muted/50 p-3 text-sm">
                <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", n.tone === "down" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
                <p>{n.text}</p>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="This month's pace" description="Spent so far, and where the month is heading">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Spent so far</p>
              <p className="text-lg font-semibold tabular-nums">{fmt(SO_FAR)}</p>
              <p className="text-xs text-muted-foreground">Day {DAY} of {DAYS_IN_MONTH}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">By month-end</p>
              <p className="text-lg font-semibold tabular-nums">{fmt(PROJECTED ?? SO_FAR)}</p>
              <p className="text-xs text-muted-foreground">So far, plus your usual rest of month</p>
            </div>
          </div>
          <svg viewBox="0 0 300 104" className="mt-3 h-24 w-full" aria-hidden>
            <polyline points={lastMonth.map((v, i) => pt(i + 1, v)).join(" ")} className="fill-none stroke-muted-foreground/45" strokeWidth={1.5} />
            <polyline points={projection.map((v, i) => pt(DAY + i, v)).join(" ")} className="fill-none stroke-foreground" strokeWidth={1.5} strokeDasharray="4 3" />
            <polyline points={thisMonth.map((v, i) => pt(i + 1, v)).join(" ")} className="fill-none stroke-foreground" strokeWidth={2} />
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">By day {DAY}, compared with</p>
          <dl className="mt-1 space-y-1 text-sm">
            {COMPARISONS.map((c) => (
              <div key={c.label} className="grid grid-cols-[1fr_auto_3.5rem] items-baseline gap-2">
                <dt className="truncate text-muted-foreground">{c.label}</dt>
                <dd className="tabular-nums">{fmt(c.value)}</dd>
                <dd className="text-right text-xs">
                  <Change change={pctChange(SO_FAR, c.value)} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Category trends" description="This month so far against your usual by this point">
          <ul className="space-y-3 text-sm">
            {TRENDS.map((t) => {
              const max = Math.max(...t.series);
              return (
                <li key={t.name} className="flex items-center gap-3">
                  <span aria-hidden>{t.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <svg viewBox="0 0 50 16" className="h-4 w-12 shrink-0" aria-hidden>
                    <polyline points={t.series.map((v, i) => `${i * 10},${15 - (v / max) * 14}`).join(" ")} className="fill-none stroke-foreground/60" strokeWidth={1.5} />
                  </svg>
                  <span className="w-20 text-right tabular-nums">{fmt(t.soFar)}</span>
                  <span className="w-14 text-right text-xs">
                    <Change change={pctChange(t.soFar, t.usual)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Cash flow" description="Income, spending and what you kept — last 12 months">
        <p className="text-sm">
          Kept <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{percentLabel(kept)}</span> of
          income — {fmt(INCOME_12 - EXPENSE_12)} over the year.
        </p>
        <div className="mt-3 flex h-24 items-end gap-1.5" aria-hidden>
          {CASH_FLOW.map((m, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1">
              <div className="flex flex-1 items-end gap-0.5">
                <span className="flex-1 rounded-t-sm bg-emerald-500" style={{ height: `${(m.income / cashTop) * 100}%` }} />
                <span className="flex-1 rounded-t-sm bg-foreground/55" style={{ height: `${(m.expense / cashTop) * 100}%` }} />
              </div>
              <span className="text-center text-[10px] text-muted-foreground">{CASH_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Spending calendar" description="Each day's spending in the range — darker costs more">
          <div className="grid grid-cols-7 gap-1" role="img" aria-label="A month of daily spending, shaded by amount">
            {calendar.map((v, i) => (
              <span key={i} className={cn("aspect-square rounded-sm", HEAT[heatLevel(v, thresholds)])} />
            ))}
          </div>
        </Panel>

        <Panel title="Recurring and unusual" description="What comes round monthly, and what stood out">
          <ul className="space-y-1.5 text-sm">
            {RECURRING.map((r) => (
              <li key={r.label} className="flex items-baseline gap-2">
                <span aria-hidden>{r.icon}</span>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="tabular-nums">{fmt(r.typical)}</span>
                <span className="w-20 text-right text-xs text-muted-foreground">{r.next}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-sm">
            “{UNUSUAL.title}” was {fmt(UNUSUAL.amount)} — about {ratioLabel(unusualRatio)} your usual for {UNUSUAL.name}.
          </p>
        </Panel>
      </div>

      <Panel title="Where it goes" description="Spending by payee, tag and profile in the range">
        <div className="inline-flex h-8 items-center rounded-full border bg-muted/50 p-0.5 text-xs" role="group" aria-label="Break down by">
          {(["payees", "tags", "profiles"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-full px-2.5 py-1 capitalize transition-colors", tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {BREAKDOWN[tab].map((r) => (
            <li key={r.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(r.total)}</span>
              </div>
              <span className="block h-1.5 rounded-full bg-foreground/55" style={{ width: `${(r.total / BREAKDOWN[tab][0]!.total) * 100}%` }} aria-hidden />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
