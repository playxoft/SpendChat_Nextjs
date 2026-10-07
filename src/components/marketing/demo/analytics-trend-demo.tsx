"use client";

import { Lock } from "lucide-react";
import { demoAmount, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { formatRounded, percentLabel, savingsRate } from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { lowestPlanWith, PLAN_NAMES } from "@/lib/plans";
import { BUCKET_LABEL, buildTrend, trendSpan, type Trend, type TrendBucket } from "@/lib/trend";

/**
 * The analytics demo's "Income vs. expenses" card — the app's trend
 * (`components/app/analytics/trend-card.tsx`) in miniature: income and
 * expenses side by side in a column per day, week, month or year, following
 * the range you pick, with what was kept and the savings rate on the plans
 * that have them.
 *
 * The columns come from the app's own `buildTrend` over a year of seeded,
 * made-up days (USD minor units, scaled into the visitor's currency at the
 * end like every demo). Dates are fixed — October 2025 to September 2026 — so
 * nothing depends on today and the server and browser draw the same chart.
 */

export type DemoRange = "month" | "quarter" | "year";

/** The app's own range labels (`AnalyticsFilters`). */
export const DEMO_RANGES: { id: DemoRange; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "3 months" },
  { id: "year", label: "12 months" },
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Twelve months, oldest first: income and spending per month (USD minor units). */
export const DEMO_MONTHS = [
  { month: "2025-10", income: 235_000, expense: 191_400 },
  { month: "2025-11", income: 218_000, expense: 176_900 },
  { month: "2025-12", income: 200_000, expense: 214_600 },
  { month: "2026-01", income: 235_000, expense: 204_100 },
  { month: "2026-02", income: 212_000, expense: 168_300 },
  { month: "2026-03", income: 200_000, expense: 198_600 },
  { month: "2026-04", income: 218_000, expense: 209_150 },
  { month: "2026-05", income: 235_000, expense: 186_700 },
  { month: "2026-06", income: 200_000, expense: 207_300 },
  { month: "2026-07", income: 218_000, expense: 189_900 },
  { month: "2026-08", income: 235_000, expense: 196_800 },
  { month: "2026-09", income: 235_000, expense: 209_150 },
];

/** The months each range covers. */
const RANGE_MONTHS: Record<DemoRange, number> = { month: 1, quarter: 3, year: 12 };

/** Income and spending over a range (USD minor units) — what the stat cards and breakdown add up to. */
export function demoRangeTotals(range: DemoRange): { income: number; expense: number } {
  return DEMO_MONTHS.slice(-RANGE_MONTHS[range]).reduce(
    (t, m) => ({ income: t.income + m.income, expense: t.expense + m.expense }),
    { income: 0, expense: 0 },
  );
}

const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};

/**
 * A month's total spread over its days the way a real month falls: rent on
 * the 1st, bills on the 15th, groceries weekly, a little most days — integer
 * shares, the leftover on the first days, so the days add up exactly.
 */
function spread(month: string, expense: number, income: number) {
  const n = daysIn(month);
  const rent = Math.min(120_000, expense);
  const weights = Array.from({ length: n }, (_, i): number => {
    const d = i + 1;
    if (d === 15) return 8;
    if (d % 7 === 6) return 6;
    if (d % 7 === 5) return 3;
    return d % 6 === 0 ? 0 : 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const rest = expense - rent;
  const parts = weights.map((w) => Math.floor((rest * w) / sum));
  let left = rest - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % n) {
    if (weights[i]) {
      parts[i]! += 1;
      left -= 1;
    }
  }
  const salary = Math.min(200_000, income);
  return parts.map((p, i) => ({
    date: `${month}-${String(i + 1).padStart(2, "0")}`,
    expense: p + (i === 0 ? rent : 0),
    income: i === 0 ? salary : i === 14 ? income - salary : 0,
  }));
}

const DAILY = DEMO_MONTHS.flatMap((m) => spread(m.month, m.expense, m.income));
const MONTHLY = DEMO_MONTHS.map((m) => ({ month: m.month, income: m.income, expense: m.expense }));
const LAST_DAY = DAILY.at(-1)!.date;

/** Each range's trend, worked out once (with `kept`; the free card just doesn't show it). */
const TRENDS: Record<DemoRange, Trend> = {
  month: trendFor("month"),
  quarter: trendFor("quarter"),
  year: trendFor("year"),
};

function trendFor(range: DemoRange): Trend {
  const first = DEMO_MONTHS.at(-RANGE_MONTHS[range])!.month;
  const span = trendSpan(`${first}-01`, LAST_DAY);
  // Weeks start on Monday, as for most of the world.
  return buildTrend({ span, firstDay: 1, daily: DAILY, monthly: MONTHLY, kept: true });
}

/** The axis label under a column: "8", "Jul 7", "Oct" — at most about seven of them. */
function tick(key: string, bucket: TrendBucket): string {
  if (bucket === "day") return String(Number(key.slice(8, 10)));
  if (bucket === "week") return `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
  if (bucket === "month") return MONTH_SHORT[Number(key.slice(5, 7)) - 1]!;
  return key;
}

/** The column's name for the screen-reader table. */
function columnName(p: { key: string; from: string; to: string }, bucket: TrendBucket): string {
  if (bucket === "day") return tick(p.from, "week");
  if (bucket === "week") return `${tick(p.from, "week")} – ${tick(p.to, "week")}`;
  if (bucket === "month") return `${MONTH_SHORT[Number(p.key.slice(5, 7)) - 1]} ${p.key.slice(0, 4)}`;
  return p.key;
}

export function DemoTrendCard({
  range,
  money,
  kept,
  title = "Income vs. expenses",
  description,
}: {
  range: DemoRange;
  money: DemoMoneyFormat;
  /** Plus and Pro: a line for what was kept in each column, and the savings rate. */
  kept: boolean;
  title?: string;
  description: string;
}) {
  const trend = TRENDS[range];
  const amt = (usd: number) => demoAmount(usd, money);
  const points = trend.points.map((p) => {
    const income = amt(p.income);
    const expense = amt(p.expense);
    return { ...p, income, expense, net: income - expense };
  });
  const income = points.reduce((a, p) => a + p.income, 0);
  const expense = points.reduce((a, p) => a + p.expense, 0);
  const rate = savingsRate(income, expense);

  // One scale for bars and the kept line; room under zero only when a column ran short.
  const top = Math.max(...points.flatMap((p) => [p.income, p.expense]), 1);
  const bottom = kept ? Math.min(0, ...points.map((p) => p.net)) : 0;
  const H = 120;
  const W = 300;
  const y = (v: number) => ((top - v) / (top - bottom)) * H;
  const slot = W / points.length;
  const bar = Math.min(slot * 0.38, 9);
  const every = Math.ceil(points.length / 7);
  const plan = PLAN_NAMES[lowestPlanWith("advancedAnalytics")];

  return (
    <section className="rounded-xl border bg-card p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>

      <div className="mt-3 flex h-4 items-center gap-x-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-emerald-500" /> Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-foreground/55" /> Expenses
        </span>
        {kept && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" /> Kept
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-32 w-full" aria-hidden>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => {
          const x = i * slot + slot / 2;
          return (
            <g key={p.key}>
              <rect x={x - bar - 0.5} y={y(p.income)} width={bar} height={y(0) - y(p.income)} className="fill-emerald-500" rx={1} />
              <rect x={x + 0.5} y={y(p.expense)} width={bar} height={y(0) - y(p.expense)} className="fill-foreground/55" rx={1} />
            </g>
          );
        })}
        {kept && (
          <polyline
            points={points.map((p, i) => `${i * slot + slot / 2},${y(p.net)}`).join(" ")}
            className="fill-none stroke-foreground"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-1 flex text-[10px] text-muted-foreground" aria-hidden>
        {points.map((p, i) => (
          <span key={p.key} className="flex-1 text-center tabular-nums">
            {i % every === 0 ? tick(p.key, trend.bucket) : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        {kept ? (
          <p className="min-w-0 truncate tabular-nums">
            Kept{" "}
            <span className="font-medium text-foreground">{formatRounded(income - expense, money.code, money.locale)}</span>
            {rate !== null ? ` · ${rate < 0 ? "−" : ""}${percentLabel(rate)} of income` : ""}
          </p>
        ) : (
          <p className="inline-flex min-w-0 items-center gap-1">
            <Lock aria-hidden className="size-3 shrink-0" />
            <span className="truncate">What you kept and your savings rate — on {plan}</span>
          </p>
        )}
        <span className="shrink-0">{BUCKET_LABEL[trend.bucket]}</span>
      </div>

      <table className="sr-only">
        <caption>Income and expenses, {BUCKET_LABEL[trend.bucket].toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Income</th>
            <th scope="col">Expenses</th>
            {kept ? <th scope="col">Kept</th> : null}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{columnName(p, trend.bucket)}</th>
              <td>{formatMoney(p.income, money.code, money.locale)}</td>
              <td>{formatMoney(p.expense, money.code, money.locale)}</td>
              {kept ? <td>{formatMoney(p.net, money.code, money.locale)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
