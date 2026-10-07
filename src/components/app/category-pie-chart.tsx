"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, type PieSectorShapeProps } from "recharts";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

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

const INNER = 56;
const OUTER = 90;
/** How far the highlighted slice grows — the selection is the slice's own shape. */
const GROW = 6;

/**
 * The category donut, with the legend beside it.
 *
 * Hovering or clicking a slice — or hovering, focusing or pressing its legend
 * row — highlights it: that slice grows a few pixels and the rest fade, and
 * the hole in the middle names it with its amount and share. The selection
 * follows the slice's shape; nothing draws a box.
 *
 * That box used to come from recharts' keyboard layer: the chart's `<svg>`,
 * the pie's `<g>` and every slice's `<g>` are focusable, so a click focused one
 * and the browser drew its focus outline — a rectangle — around the slice or
 * the whole chart. The chart is now out of the tab order (`accessibilityLayer`
 * off, `rootTabIndex={-1}`) with focus outlines inside it suppressed, and the
 * keyboard path is the legend: each row is a toggle button with the category,
 * amount and share, which is everything the chart says.
 */
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
  // `hovered` follows the pointer or focus; `selected` sticks until toggled off.
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<number | null>(null);
  const toggle = (i: number) => setSelected((s) => (s === i ? null : i));

  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No expense data for this range yet.
      </p>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const active = hovered ?? selected;
  const focus = active !== null ? data[active] : null;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const shape = (props: PieSectorShapeProps) => {
    const on = props.index === active;
    return (
      <Sector
        {...props}
        outerRadius={(props.outerRadius ?? OUTER) + (on ? GROW : 0)}
        fillOpacity={active === null || on ? 1 : 0.35}
        className="cursor-pointer outline-none"
      />
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div
        className={cn(
          "relative h-56 w-56 shrink-0",
          // No focus box anywhere inside the chart (see above).
          "[&_*:focus]:outline-none [&_*:focus-visible]:outline-none",
        )}
        onMouseLeave={() => setHovered(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={INNER}
              outerRadius={OUTER}
              paddingAngle={2}
              strokeWidth={1}
              rootTabIndex={-1}
              isAnimationActive={animate}
              shape={shape}
              onMouseEnter={(_, i) => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={(_, i) => toggle(i)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* The hole: the highlighted category, or the total. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center"
        >
          <span className="max-w-full truncate text-xs text-muted-foreground">
            {focus ? `${focus.icon ? `${focus.icon} ` : ""}${focus.name}` : "Total"}
          </span>
          <span className="max-w-full truncate text-sm font-semibold tabular-nums">
            {formatMoney(focus ? focus.value : total, currency, locale)}
          </span>
          {focus ? (
            <span className="text-xs tabular-nums text-muted-foreground">{share(focus.value)}%</span>
          ) : null}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {data.map((d, i) => (
          <li key={d.name}>
            <button
              type="button"
              aria-pressed={selected === i}
              onClick={() => toggle(i)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                active === i ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
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
                {formatMoney(d.value, currency, locale)} · {share(d.value)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
