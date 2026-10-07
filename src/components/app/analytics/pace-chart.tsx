"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, type PacePoint } from "@/lib/insights";
import { formatMoney } from "@/lib/money";

/**
 * Spending so far this month, day by day, with the projection to the month's
 * end dashed and last month in a lighter line behind it. One money axis.
 * Hover-only and out of the tab order — the numbers above it in the card are
 * the accessible version.
 */
export function PaceChart({
  points,
  day,
  currency,
  locale,
}: {
  points: PacePoint[];
  day: number;
  currency: string;
  locale: string;
}) {
  const last = points.length;
  const ticks = [1, 8, 15, 22, last].filter((t, i, a) => t <= last && a.indexOf(t) === i);

  return (
    <div className="h-40 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} accessibilityLayer={false} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="day"
            type="number"
            domain={[1, last]}
            ticks={ticks}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v, currency, locale)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <ReferenceLine x={day} stroke="var(--border)" />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as PacePoint | undefined;
              if (!active || !p) return null;
              const rows: [string, number | null][] = [
                ["This month", p.thisMonth],
                ["Projected", p.thisMonth === null ? p.projection : null],
                ["Last month", p.lastMonth],
              ];
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                  <p className="mb-0.5 font-medium">Day {p.day}</p>
                  {rows
                    .filter(([, v]) => v !== null)
                    .map(([label, v]) => (
                      <p key={label} className="flex justify-between gap-4 tabular-nums">
                        <span className="text-muted-foreground">{label}</span>
                        {formatMoney(v!, currency, locale)}
                      </p>
                    ))}
                </div>
              );
            }}
          />
          <Line
            dataKey="lastMonth"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="projection"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="thisMonth"
            stroke="currentColor"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The chart's key, in HTML above it. */
export function PaceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-foreground" /> This month
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-foreground/55" /> Projected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground/55" /> Last month
      </span>
    </div>
  );
}
