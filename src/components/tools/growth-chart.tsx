"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/tools/format";
import type { YearRow } from "@/lib/tools/growth";

/**
 * Stacked bars — what went in (grey) under what it earned (emerald) — one per
 * year, for the compound interest and SIP calculators.
 *
 * Only ever loaded through `LazyGrowthChart`: recharts is the heaviest thing a
 * tool page could pull in, and the year-by-year table beside it carries the
 * same numbers for crawlers, screen readers and anyone without JS.
 */

export type GrowthChartLabels = { contributed: string; interest: string };

export function GrowthChart({
  rows,
  currency,
  locale,
  labels,
}: {
  rows: YearRow[];
  currency: string;
  locale: string;
  labels: GrowthChartLabels;
}) {
  const compact = compactCurrency(currency, locale);
  // Thin bars can't spare pixels for the gap between segments or a rounded top.
  const roomy = rows.length <= 40;

  return (
    // `currentColor` carries the emerald into the SVG, so light and dark mode
    // come from the same Tailwind classes as every other gain on the site.
    <div className="h-64 w-full text-emerald-600 dark:text-emerald-500">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          stackOffset="sign"
          // Hover-only and hidden from assistive tech: the table beside it is
          // the accessible version, so the chart shouldn't take a tab stop.
          accessibilityLayer={false}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap={roomy ? "20%" : "8%"}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="months"
            tickFormatter={(m: number) => formatNumber(m / 12, locale, 2)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={(v: number) => compact(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as YearRow | undefined;
              if (!active || !row) return null;
              const money = (v: number) => formatCurrency(v, currency, locale, { decimals: 0 });
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">Year {formatNumber(row.months / 12, locale, 2)}</p>
                  <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    <dt className="text-muted-foreground">{labels.contributed}</dt>
                    <dd className="text-right">{money(row.contributed)}</dd>
                    <dt className="text-muted-foreground">{labels.interest}</dt>
                    <dd className="text-right">{money(row.interest)}</dd>
                    <dt className="font-medium">Total</dt>
                    <dd className="text-right font-medium">{money(row.balance)}</dd>
                  </dl>
                </div>
              );
            }}
          />
          <Bar
            dataKey="contributed"
            name={labels.contributed}
            stackId="growth"
            fill="var(--muted-foreground)"
            fillOpacity={0.45}
            stroke={roomy ? "var(--card)" : "none"}
            isAnimationActive={false}
          />
          <Bar
            dataKey="interest"
            name={labels.interest}
            stackId="growth"
            fill="currentColor"
            stroke={roomy ? "var(--card)" : "none"}
            radius={roomy ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
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
