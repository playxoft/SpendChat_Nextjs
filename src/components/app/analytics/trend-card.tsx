"use client";

import { Lock } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlan } from "@/components/app/upgrade-dialog";
import { advancedAnalyticsLock } from "@/lib/add-limits";
import { formatDateLabel, formatDateShort } from "@/lib/dates";
import { formatCompact, formatRounded, percentLabel } from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { lowestPlanWith, PLAN_NAMES } from "@/lib/plans";
import { BUCKET_LABEL, type Trend, type TrendBucket, type TrendPoint } from "@/lib/trend";

/**
 * "Income vs. expenses" over the page's range: income (emerald) and expenses
 * (neutral) side by side in one column per day, week, month or year — side by
 * side rather than stacked, since one isn't a part of the other. On Plus and
 * Pro a line adds what was kept in each column and the footer the savings
 * rate (the cash-flow view); on Free the footer says where those live. The
 * chart is hover-only; the table under it is the accessible version.
 *
 * Every row of the body has a fixed height, so `TrendBodySkeleton` is the
 * body's exact size.
 */

const CHART_HEIGHT = "h-52";

function monthShort(month: string, locale: string, withYear: boolean): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  return withYear ? `${name} ’${String(y).slice(2)}` : name;
}

/** The axis label for a column: "7", "Oct 5", "Oct" / "Oct ’25", "2025". */
function tickLabel(key: string, bucket: TrendBucket, locale: string, multiYear: boolean): string {
  if (bucket === "day") return String(Number(key.slice(8, 10)));
  if (bucket === "week") return formatDateShort(key, locale);
  if (bucket === "month") return monthShort(key, locale, multiYear);
  return key;
}

/** The tooltip's and the table's name for a column. */
function columnName(p: TrendPoint, bucket: TrendBucket, locale: string): string {
  if (bucket === "day") return formatDateLabel(p.from, locale);
  if (bucket === "week") return `${formatDateShort(p.from, locale)} – ${formatDateShort(p.to, locale)}`;
  if (bucket === "month") {
    const [y, m] = p.key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return p.key;
}

export function TrendLegend({ kept }: { kept: boolean }) {
  return (
    <div className="flex h-4 items-center gap-x-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-emerald-500" /> Income
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-foreground/55" /> Expenses
      </span>
      {kept ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" /> Kept
        </span>
      ) : null}
    </div>
  );
}

function TrendChart({ trend, currency, locale }: { trend: Trend; currency: string; locale: string }) {
  const multiYear = trend.span.from.slice(0, 4) !== trend.span.to.slice(0, 4);
  const kept = trend.kept !== undefined;
  return (
    <div className={`${CHART_HEIGHT} w-full text-foreground`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={trend.points}
          accessibilityLayer={false}
          barGap={1}
          barCategoryGap="18%"
          margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => tickLabel(k, trend.bucket, locale, multiYear)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v, currency, locale)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          {kept ? <ReferenceLine y={0} stroke="var(--border)" /> : null}
          <Tooltip
            cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as TrendPoint | undefined;
              if (!active || !p) return null;
              const rows: [string, number][] = [
                ["Income", p.income],
                ["Expenses", p.expense],
                ...(p.net !== undefined ? ([["Kept", p.net]] as [string, number][]) : []),
              ];
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                  <p className="mb-0.5 font-medium">{columnName(p, trend.bucket, locale)}</p>
                  {rows.map(([label, v]) => (
                    <p key={label} className="flex justify-between gap-4 tabular-nums">
                      <span className="text-muted-foreground">{label}</span>
                      {formatMoney(v, currency, locale)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="income" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          <Bar
            dataKey="expense"
            fill="currentColor"
            fillOpacity={0.55}
            radius={[2, 2, 0, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
          {kept ? (
            <Line
              dataKey="net"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Plus and Pro: what was kept; Free: where to get it. One fixed-height line. */
function TrendFooter({ trend, currency, locale }: { trend: Trend; currency: string; locale: string }) {
  const { plan, showUpgrade } = usePlan();
  const rate = trend.kept?.savingsRate;
  return (
    <div className="flex h-5 items-center justify-between gap-3 text-xs text-muted-foreground">
      {trend.kept ? (
        <p className="min-w-0 truncate tabular-nums">
          Kept <span className="font-medium text-foreground">{formatRounded(trend.kept.net, currency, locale)}</span>
          {rate !== null && rate !== undefined
            ? ` · ${rate < 0 ? "−" : ""}${percentLabel(rate)} of income`
            : ""}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => showUpgrade(advancedAnalyticsLock(plan).info)}
          className="inline-flex min-w-0 items-center gap-1 rounded underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Lock aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            What you kept and your savings rate — on {PLAN_NAMES[lowestPlanWith("advancedAnalytics")]}
          </span>
        </button>
      )}
      <span className="shrink-0">{BUCKET_LABEL[trend.bucket]}</span>
    </div>
  );
}

export function TrendBody({ trend, currency, locale }: { trend: Trend; currency: string; locale: string }) {
  const kept = trend.kept !== undefined;
  return (
    <>
      <div className="space-y-3">
        <TrendLegend kept={kept} />
        <TrendChart trend={trend} currency={currency} locale={locale} />
        <TrendFooter trend={trend} currency={currency} locale={locale} />
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
          {trend.points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{columnName(p, trend.bucket, locale)}</th>
              <td>{formatMoney(p.income, currency, locale)}</td>
              <td>{formatMoney(p.expense, currency, locale)}</td>
              {p.net !== undefined ? <td>{formatMoney(p.net, currency, locale)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** `TrendBody` while it loads — the real legend, and the chart and footer at their heights. */
export function TrendBodySkeleton({ kept }: { kept: boolean }) {
  return (
    <div className="space-y-3" aria-hidden>
      <TrendLegend kept={kept} />
      <Skeleton className={`${CHART_HEIGHT} w-full rounded-lg`} />
      <div className="flex h-5 items-center justify-between gap-3">
        <Skeleton className="h-3 w-40 max-w-[60%]" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}
