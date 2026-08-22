"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/money";

// A distinct but muted palette for slices.
const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#a3a3a3",
];

export function CategoryPieChart({
  data,
  currency,
  locale,
  animate = true,
}: {
  data: { name: string; value: number; icon?: string | null }[];
  currency: string;
  locale: string;
  /**
   * Play the slice-in animation on mount. On by default, which is what the
   * analytics page wants.
   *
   * Turn it off where the chart mounts into a container whose size isn't
   * settled yet — a lazily-loaded chunk arriving mid-layout, most obviously.
   * Recharts' `ResponsiveContainer` starts at a width of -1 until its
   * ResizeObserver fires, and if the entry animation resolves against that it
   * finishes at degenerate geometry: the sector groups are in the DOM with no
   * `<path>` inside them, and a later resize doesn't re-run it. Without the
   * animation the geometry is derived from whatever size the current render
   * has, so the correct measurement simply draws the pie.
   */
  animate?: boolean;
}) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No expense data for this range yet.
      </p>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={90}
              paddingAngle={2}
              strokeWidth={1}
              isAnimationActive={animate}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatMoney(Number(value), currency, locale)}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full flex-1 space-y-2">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 truncate">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">
                {d.icon ? `${d.icon} ` : ""}
                {d.name}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatMoney(d.value, currency, locale)} ·{" "}
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
