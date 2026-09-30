"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatPercent } from "@/lib/tools/format";
import type { PathPoint } from "@/lib/tools/inflation";

/**
 * The amount's path through the years — what the from-year amount is worth in
 * each year's money. Only ever loaded through `LazyCpiChart`: recharts is the
 * heaviest thing a tool page could pull in, and the year-by-year table under
 * it carries the same numbers for crawlers, screen readers and anyone
 * without JS.
 */
export function CpiChart({
  path,
  currency,
  locale,
}: {
  path: PathPoint[];
  currency: string;
  locale: string;
}) {
  const compact = compactCurrency(currency, locale);
  const money = (v: number) => formatCurrency(v, currency, locale);

  return (
    // `currentColor` carries the theme's foreground into the SVG.
    <div className="h-64 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={path}
          // Hover-only and hidden from assistive tech: the table under it is
          // the accessible version, so the chart shouldn't take a tab stop.
          accessibilityLayer={false}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(v: number) => compact(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as PathPoint | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">{point.year}</p>
                  <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    <dt className="text-muted-foreground">Worth</dt>
                    <dd className="text-right">{money(point.value)}</dd>
                    {point.yearlyPercent !== null && (
                      <>
                        <dt className="text-muted-foreground">Inflation that year</dt>
                        <dd className="text-right">{formatPercent(point.yearlyPercent, locale, 1)}</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            dot={path.length <= 2}
            activeDot={{ r: 4, fill: "currentColor", stroke: "var(--card)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Axis money: `₹1.2K`, `$1.2M` — short enough for a narrow phone axis. */
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
