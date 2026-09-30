"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/tools/format";

/**
 * The path to FIRE: stacked bars per year — what you put in (grey) under what
 * it grew by (emerald) — against a dashed line at each FIRE number.
 *
 * Only ever loaded through `LazyFireChart`; the table beside it carries the
 * same numbers for crawlers, screen readers and anyone without JS.
 */

export type FireChartRow = { age: number; contributed: number; growth: number; balance: number };
export type FireTarget = { label: string; value: number };

export function FireChart({
  rows,
  targets,
  currency,
  locale,
}: {
  rows: FireChartRow[];
  targets: FireTarget[];
  currency: string;
  locale: string;
}) {
  const compact = compactCurrency(currency, locale);
  const roomy = rows.length <= 40;
  const money = (v: number) => formatCurrency(v, currency, locale, { decimals: 0 });

  return (
    <div className="h-64 w-full text-emerald-600 dark:text-emerald-500">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          stackOffset="sign"
          accessibilityLayer={false}
          margin={{ top: 16, right: 4, bottom: 0, left: 0 }}
          barCategoryGap={roomy ? "20%" : "8%"}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="age"
            tickFormatter={(a: number) => formatNumber(a, locale, 1)}
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
              const row = payload?.[0]?.payload as FireChartRow | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">Age {formatNumber(row.age, locale, 1)}</p>
                  <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    <dt className="text-muted-foreground">Paid in</dt>
                    <dd className="text-right">{money(row.contributed)}</dd>
                    <dt className="text-muted-foreground">Growth</dt>
                    <dd className="text-right">{money(row.growth)}</dd>
                    <dt className="font-medium">Invested</dt>
                    <dd className="text-right font-medium">{money(row.balance)}</dd>
                  </dl>
                </div>
              );
            }}
          />
          <Bar
            dataKey="contributed"
            stackId="path"
            fill="var(--muted-foreground)"
            fillOpacity={0.45}
            stroke={roomy ? "var(--card)" : "none"}
            isAnimationActive={false}
          />
          <Bar
            dataKey="growth"
            stackId="path"
            fill="currentColor"
            stroke={roomy ? "var(--card)" : "none"}
            radius={roomy ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          />
          {targets.map((t) => (
            <ReferenceLine
              key={t.label}
              y={t.value}
              ifOverflow="extendDomain"
              stroke="var(--foreground)"
              strokeOpacity={0.7}
              strokeDasharray="4 4"
              label={{
                value: t.label,
                position: "insideTopLeft",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          ))}
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
