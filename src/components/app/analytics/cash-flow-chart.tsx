"use client";

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
import { formatCompact, percentLabel, type CashFlowMonth } from "@/lib/insights";
import { formatMoney } from "@/lib/money";

/** "Oct" in the workspace's locale, from "YYYY-MM". */
function shortMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    timeZone: "UTC",
  });
}

function longMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Twelve months of income (emerald) and spending (neutral) side by side, with
 * what was kept — income minus spending — as a line over them. All three are
 * money on the one axis; the savings rate, a percentage, lives in the tooltip
 * and the table rather than on a second scale. The table under the chart (in
 * the card) is the accessible version.
 */
export function CashFlowChart({
  months,
  currency,
  locale,
}: {
  months: CashFlowMonth[];
  currency: string;
  locale: string;
}) {
  return (
    <div className="h-48 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={months}
          accessibilityLayer={false}
          barGap={2}
          barCategoryGap="22%"
          margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => shortMonth(m, locale)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={4}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v, currency, locale)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const m = payload?.[0]?.payload as CashFlowMonth | undefined;
              if (!active || !m) return null;
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                  <p className="mb-0.5 font-medium">{longMonth(m.month, locale)}</p>
                  {(
                    [
                      ["Income", m.income],
                      ["Spending", m.expense],
                      ["Kept", m.net],
                    ] as const
                  ).map(([label, v]) => (
                    <p key={label} className="flex justify-between gap-4 tabular-nums">
                      <span className="text-muted-foreground">{label}</span>
                      {formatMoney(v, currency, locale)}
                    </p>
                  ))}
                  {m.savingsRate !== null ? (
                    <p className="flex justify-between gap-4 tabular-nums">
                      <span className="text-muted-foreground">Savings rate</span>
                      {m.savingsRate < 0 ? "−" : ""}
                      {percentLabel(m.savingsRate)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={18} />
          <Bar
            dataKey="expense"
            fill="currentColor"
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
            maxBarSize={18}
          />
          <Line
            dataKey="net"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: "currentColor" }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-emerald-500" /> Income
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm bg-foreground/55" /> Spending
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-foreground" /> Kept
      </span>
    </div>
  );
}
