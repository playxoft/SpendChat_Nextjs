"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/tools/format";
import type { MonthIndex } from "@/lib/tools/loan";
import { monthLabel, shortMonthLabel } from "./month-label";

/**
 * What's still owed, month by month — and, with prepayments, the same loan
 * without them as a dashed line, so the months cut off the end are visible.
 *
 * Only ever loaded through `LazyBalanceChart`: recharts is the heaviest thing
 * a tool page could pull in, and the schedule table beside it carries the same
 * numbers for crawlers, screen readers and anyone without JS.
 */

export type BalancePoint = {
  /** Payments made so far — 0 is the day the loan starts. */
  m: number;
  /** Null once this plan has been paid off, so its line ends there. */
  balance: number | null;
  baseline: number | null;
};

export function BalanceChart({
  points,
  start,
  withBaseline,
  currency,
  locale,
}: {
  points: BalancePoint[];
  /** Month of the first payment, for calendar labels; null for "years in". */
  start: MonthIndex | null;
  withBaseline: boolean;
  currency: string;
  locale: string;
}) {
  const last = points.at(-1)?.m ?? 0;
  const compact = compactCurrency(currency, locale);
  const { ticks, label } = axis(last, start, locale);
  const money = (v: number) => formatCurrency(v, currency, locale);

  return (
    // `currentColor` carries the theme's foreground into the SVG.
    <div className="h-64 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          // Hover-only and hidden from assistive tech: the table under it is
          // the accessible version, so the chart shouldn't take a tab stop.
          accessibilityLayer={false}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="m"
            type="number"
            domain={[0, last]}
            ticks={ticks}
            tickFormatter={label}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={8}
          />
          <YAxis
            tickFormatter={(v: number) => compact(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as BalancePoint | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">
                    {point.m === 0
                      ? "Start"
                      : start === null
                        ? `After payment ${point.m}`
                        : `After the ${monthLabel(start + point.m - 1, locale)} payment`}
                  </p>
                  <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="text-right">{money(point.balance ?? 0)}</dd>
                    {withBaseline && point.baseline !== null && (
                      <>
                        <dt className="text-muted-foreground">Without prepayments</dt>
                        <dd className="text-right">{money(point.baseline)}</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            }}
          />
          <Area
            type="linear"
            dataKey="balance"
            stroke="currentColor"
            strokeWidth={2}
            fill="currentColor"
            fillOpacity={0.07}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
          {withBaseline && (
            <Line
              type="linear"
              dataKey="baseline"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ticks for a loan of `last` months: every few months for a short loan,
 * every 1–10 years for a long one. Labelled with calendar dates when the
 * first payment's month is known, and with time elapsed when it isn't.
 */
function axis(last: number, start: MonthIndex | null, locale: string) {
  const step = last <= 12 ? 3 : last <= 24 ? 6 : 12 * (last <= 72 ? 1 : last <= 180 ? 2 : last <= 360 ? 5 : 10);
  const ticks: number[] = [];
  for (let m = 0; m <= last; m += step) ticks.push(m);
  const label = (m: number) => {
    if (step < 12) return start === null ? `${m}m` : shortMonthLabel(start + m - 1, locale);
    // The balance at tick m is after the m-th payment, i.e. in that payment's month.
    return start === null ? `${formatNumber(m / 12, locale, 1)}y` : String(Math.floor((start + m - 1) / 12));
  };
  return { ticks, label };
}

/** Axis money: `₹12L`, `$1.2M` — short enough for a narrow phone axis. */
function compactCurrency(currency: string, locale: string) {
  let fmt: Intl.NumberFormat | null = null;
  try {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
  } catch {
    // Unknown locale or currency — fall back to the full format below.
  }
  return (v: number) => (fmt ? fmt.format(v) : formatCurrency(v, currency, locale, { decimals: 0 }));
}
