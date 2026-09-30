"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndexedYear } from "@/lib/tools/inflation";

/** One country's line: its colour (a CSS value) and whether it's a grey context line. */
export type ChartSeries = { code: string; name: string; color: string; muted: boolean };

/**
 * Each picked country's prices through the years, rebased so the from-year is
 * 100 — one line per country. Only ever loaded through `LazyCpiChart`:
 * recharts is the heaviest thing a tool page could pull in, and the
 * year-by-year table under it carries the same numbers for crawlers, screen
 * readers and anyone without JS.
 *
 * When the lines spread over more than a tenfold range (1960 onwards, or a
 * high-inflation country next to Japan) the axis goes logarithmic, so the
 * low-inflation countries aren't flattened into the floor — and on a log
 * axis the same slope means the same inflation rate, which is the comparison
 * that matters.
 */
export function CpiChart({
  rows,
  series,
  fromYear,
  locale,
}: {
  rows: IndexedYear[];
  series: ChartSeries[];
  fromYear: number;
  locale: string;
}) {
  const values = rows.flatMap((r) => series.map((s) => r[s.code]).filter((v): v is number => typeof v === "number"));
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values, 100);
  const log = hi / lo > 10;
  const ticks = log ? logTicks(lo, hi) : undefined;
  const axis = axisNumber(locale);
  const one = (v: number) => fixed(v, locale, 1);
  // Grey context lines first, so the coloured ones draw over them.
  const drawOrder = [...series.filter((s) => s.muted), ...series.filter((s) => !s.muted)];

  return (
    <div className="h-72 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
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
            scale={log ? "log" : "linear"}
            domain={log ? [ticks![0]!, ticks![ticks!.length - 1]!] : ["auto", "auto"]}
            ticks={ticks}
            allowDataOverflow={log}
            tickFormatter={(v: number) => axis(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as IndexedYear | undefined;
              if (!active || !row) return null;
              const lines = series
                .filter((s) => typeof row[s.code] === "number")
                .sort((a, b) => row[b.code]! - row[a.code]!);
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">
                    {row.year} <span className="font-normal text-muted-foreground">· prices, {fromYear} = 100</span>
                  </p>
                  <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    {lines.map((s) => (
                      <div key={s.code} className="contents">
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                          {s.name}
                        </dt>
                        <dd className="text-right">{one(row[s.code]!)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            }}
          />
          {drawOrder.map((s) => (
            <Line
              key={s.code}
              type="monotone"
              dataKey={s.code}
              name={s.name}
              stroke={s.color}
              strokeOpacity={s.muted ? 0.45 : 1}
              strokeWidth={s.muted ? 1.25 : 2}
              dot={rows.length <= 2}
              activeDot={s.muted ? false : { r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Round ticks from just under `lo` to just over `hi`, for a log axis: 1-2-5
 * steps, thinned to 1-3 and then powers of ten when the range is wide.
 */
function logTicks(lo: number, hi: number): number[] {
  for (const steps of [[1, 2, 5], [1, 3], [1]]) {
    const all: number[] = [];
    for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
      for (const m of steps) all.push(m * 10 ** p);
    }
    let first = 0;
    while (first + 1 < all.length && all[first + 1]! <= lo) first++;
    let last = all.length - 1;
    while (last - 1 >= 0 && all[last - 1]! >= hi) last--;
    const ticks = all.slice(first, last + 1);
    if (ticks.length <= 8 || steps.length === 1) return ticks;
  }
  return [lo, hi];
}

/** Axis numbers: "250", "1,000", "12K" — short enough for a narrow phone axis. */
function axisNumber(locale: string) {
  let fmt: Intl.NumberFormat | null = null;
  try {
    fmt = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  } catch {
    // Unknown locale — plain digits below.
  }
  return (v: number) => (fmt ? fmt.format(v) : String(Math.round(v)));
}

function fixed(v: number, locale: string, decimals: number): string {
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  } catch {
    return v.toFixed(decimals);
  }
}
