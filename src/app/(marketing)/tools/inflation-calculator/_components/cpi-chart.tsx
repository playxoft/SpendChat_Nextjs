"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { scientificParts, superscript, type IndexedYear } from "@/lib/tools/inflation";

/**
 * One country's line: its colour (a CSS value), whether it's a grey context
 * line, and — when the line runs past the published data — the last real year,
 * after which it's drawn dashed as an estimate.
 */
export type ChartSeries = { code: string; name: string; color: string; muted: boolean; dataLastYear: number | null };

/** The key an estimated stretch of a country's line is drawn from. */
const est = (code: string) => `${code}~est`;

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
 *
 * Estimated years are a second, dashed line per country that picks up where
 * the published one stops, so the change is visible at a glance.
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
  // Split each estimated line in two at its last published year; both halves share that point so they join.
  const data = series.some((s) => s.dataLastYear !== null)
    ? rows.map((r) => {
        const out: Record<string, number> = { ...r };
        for (const s of series) {
          if (s.dataLastYear === null || r.year < s.dataLastYear || out[s.code] === undefined) continue;
          out[est(s.code)] = out[s.code]!;
          if (r.year > s.dataLastYear) delete out[s.code];
        }
        return out as IndexedYear;
      })
    : rows;
  const valueAt = (row: IndexedYear, s: ChartSeries) => row[s.code] ?? row[est(s.code)];
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values, 100);
  const log = hi / lo > 10;
  const ticks = log ? logTicks(lo, hi) : undefined;
  const axis = axisNumber(locale, hi >= 1e15);
  const one = (v: number) => {
    if (Math.abs(v) < 1e9) return fixed(v, locale, 1);
    const { mantissa, exponent } = scientificParts(v, 1);
    return `${fixed(mantissa, locale, 1)} × 10${superscript(exponent)}`;
  };
  // Grey context lines first, so the coloured ones draw over them.
  const drawOrder = [...series.filter((s) => s.muted), ...series.filter((s) => !s.muted)];

  return (
    <div className="h-72 w-full text-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
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
                .filter((s) => typeof valueAt(row, s) === "number")
                .sort((a, b) => valueAt(row, b)! - valueAt(row, a)!);
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
                        <dd className="text-right">
                          {one(valueAt(row, s)!)}
                          {s.dataLastYear !== null && row.year > s.dataLastYear && (
                            <span className="text-muted-foreground"> est.</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            }}
          />
          {drawOrder.flatMap((s) => {
            const line = (key: string, dashed: boolean) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={s.name}
                stroke={s.color}
                strokeOpacity={s.muted ? 0.45 : 1}
                strokeWidth={s.muted ? 1.25 : 2}
                strokeDasharray={dashed ? "5 4" : undefined}
                dot={rows.length <= 2}
                activeDot={s.muted ? false : { r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
            return s.dataLastYear === null ? [line(s.code, false)] : [line(s.code, false), line(est(s.code), true)];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Round ticks from just under `lo` to just over `hi`, for a log axis: 1-2-5
 * steps, thinned to 1-3 and then powers of ten when the range is wide — and
 * every few powers of ten when even that is too many (a centuries-long estimate).
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
    if (ticks.length <= 8) return ticks;
    if (steps.length === 1) {
      const every = Math.ceil((ticks.length - 1) / 7);
      const thinned = ticks.filter((_, i) => i % every === 0);
      // Keep the top tick so the domain still covers the highest line.
      return thinned.at(-1) === ticks.at(-1) ? thinned : [...thinned, ticks.at(-1)!];
    }
  }
  return [lo, hi];
}

/**
 * Axis numbers: "250", "1,000", "12K" — short enough for a narrow phone axis.
 * On an axis that climbs past compact notation (a centuries-long estimate),
 * everything from 1,000 up is a power of ten, so the ticks read as one scale.
 */
function axisNumber(locale: string, huge: boolean) {
  let fmt: Intl.NumberFormat | null = null;
  try {
    fmt = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  } catch {
    // Unknown locale — plain digits below.
  }
  return (v: number) => {
    // Compact notation stops at trillions; past that, powers of ten ("10¹⁸").
    if (Math.abs(v) >= (huge ? 1000 : 1e15)) {
      const { mantissa, exponent } = scientificParts(v, 0);
      return `${mantissa === 1 ? "" : `${mantissa}×`}10${superscript(exponent)}`;
    }
    return fmt ? fmt.format(v) : String(Math.round(v));
  };
}

function fixed(v: number, locale: string, decimals: number): string {
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  } catch {
    return v.toFixed(decimals);
  }
}
