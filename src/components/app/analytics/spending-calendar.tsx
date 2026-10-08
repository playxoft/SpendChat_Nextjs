"use client";

import * as React from "react";
import { formatDateLabel, monthLabel } from "@/lib/dates";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CALENDAR_WEEKS,
  formatRounded,
  type CalendarDay,
  type CalendarMonth,
  type HeatLevel,
  type WeekdayStat,
} from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One hue, light to dark: the neutral foreground at rising strength, so the
 * calendar reads as "more" without bringing in a colour. Levels are quartiles
 * of the window's own spending days (`heatThresholds`).
 */
const LEVEL_BG: Record<HeatLevel, string> = {
  0: "bg-muted",
  1: "bg-foreground/15",
  2: "bg-foreground/30",
  3: "bg-foreground/55",
  4: "bg-foreground/80",
};
const LEVEL_TEXT: Record<HeatLevel, string> = {
  0: "text-muted-foreground",
  1: "text-foreground",
  2: "text-foreground",
  3: "text-background",
  4: "text-background",
};

/** Narrow weekday names in the locale, starting on `firstDay`. */
function weekdayHeads(locale: string, firstDay: 0 | 1): string[] {
  // 2026-02-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 1, 1 + ((i + firstDay) % 7))).toLocaleDateString(locale, {
      weekday: "narrow",
      timeZone: "UTC",
    }),
  );
}

function shortWeekday(weekday: number, locale: string): string {
  return new Date(Date.UTC(2026, 1, 1 + weekday)).toLocaleDateString(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** The months' grid — the same for the calendar and its placeholder. */
function monthsGridClass(count: number): string {
  // Numbers fit while the months are few and the cells big.
  return cn(
    "grid gap-4",
    count <= 2
      ? "grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]"
      : "grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]",
  );
}

/**
 * Under the calendars: what's being pointed at (one line, never wrapping, so
 * pointing never moves anything) and the shade key on its own line.
 */
function CalendarFooter({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p aria-live="polite" className="h-4 truncate tabular-nums print:hidden">
        {text}
      </p>
      <span className="flex h-4 items-center gap-1" aria-hidden>
        Less
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={cn("size-2.5 rounded-[2px]", LEVEL_BG[l])} />
        ))}
        More
      </span>
    </div>
  );
}

const POINT_AT = "Point at a day to see what went out.";

/**
 * The spending calendar: a month grid per month of the window, each day shaded
 * by how much went out. Pointing at (or tapping) a day names it and its total
 * on the line under the calendars; the weekday averages beside it are the
 * readable summary, so the days themselves stay out of the tab order.
 */
export function SpendingCalendar({
  months,
  firstDay,
  currency,
  locale,
}: {
  months: CalendarMonth[];
  firstDay: 0 | 1;
  currency: string;
  locale: string;
}) {
  const [hover, setHover] = React.useState<CalendarDay | null>(null);
  const heads = weekdayHeads(locale, firstDay);
  const numbers = months.length <= 2;

  return (
    <div className="min-w-0 space-y-3">
      <div className={monthsGridClass(months.length)} onMouseLeave={() => setHover(null)}>
        {months.map((m) => (
          <figure key={m.month} className="min-w-0 max-w-72">
            <figcaption className="mb-1.5 h-4 text-xs leading-4 font-medium text-muted-foreground">
              {monthLabel(m.month, locale)}
            </figcaption>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1" role="presentation">
              {heads.map((h, i) => (
                <span key={i} aria-hidden className="h-4 text-center text-[10px] leading-4 text-muted-foreground">
                  {h}
                </span>
              ))}
              {m.weeks.flat().map((d, i) =>
                d ? (
                  <span
                    key={d.date}
                    title={`${formatDateLabel(d.date, locale)}: ${formatMoney(d.total, currency, locale)}`}
                    onMouseEnter={() => setHover(d)}
                    onClick={() => setHover(d)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-[3px] text-[10px] tabular-nums",
                      d.inWindow ? [LEVEL_BG[d.level], LEVEL_TEXT[d.level]] : "text-muted-foreground/40",
                      hover?.date === d.date && "ring-2 ring-ring/60",
                    )}
                  >
                    {numbers ? d.day : null}
                  </span>
                ) : (
                  // Padding keeps its square, so a short month's empty last row still has height.
                  <span key={`pad-${i}`} aria-hidden className="aspect-square" />
                ),
              )}
            </div>
          </figure>
        ))}
      </div>

      <CalendarFooter
        text={
          hover
            ? `${formatDateLabel(hover.date, locale)} · ${hover.inWindow ? formatMoney(hover.total, currency, locale) : "outside the range"}`
            : POINT_AT
        }
      />
    </div>
  );
}

/**
 * The calendar while it loads: the same grid, the same number of months, each
 * with its caption, weekday row and `CALENDAR_WEEKS` rows of squares, and the
 * same footer — so it is the calendar's exact size at every width.
 */
export function SpendingCalendarSkeleton({ months }: { months: number }) {
  return (
    <div className="min-w-0 space-y-3" aria-hidden>
      <div className={monthsGridClass(months)}>
        {Array.from({ length: months }, (_, m) => (
          <div key={m} className="min-w-0 max-w-72">
            <div className="mb-1.5 flex h-4 items-center">
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={`h-${i}`} className="h-4" />
              ))}
              {Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => (
                <Skeleton key={i} className="aspect-square rounded-[3px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <CalendarFooter text={POINT_AT} />
    </div>
  );
}

const WEEKDAY_ROW = "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 text-xs leading-4";

/** Average spending per weekday, the week starting on `firstDay`. */
export function WeekdayBars({
  weekdays,
  firstDay,
  currency,
  locale,
}: {
  weekdays: WeekdayStat[];
  firstDay: 0 | 1;
  currency: string;
  locale: string;
}) {
  const ordered = Array.from({ length: 7 }, (_, i) => weekdays[(i + firstDay) % 7]);
  const max = Math.max(...ordered.map((w) => w.average), 1);
  const top = Math.max(...ordered.map((w) => w.average));
  return (
    <ul className="space-y-1.5">
      {ordered.map((w) => (
        <li key={w.weekday} className={WEEKDAY_ROW}>
          <span className="text-muted-foreground">{shortWeekday(w.weekday, locale)}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", w.average === top && top > 0 ? "bg-foreground/80" : "bg-foreground/35")}
              style={{ width: `${(w.average / max) * 100}%` }}
            />
          </span>
          <span className="tabular-nums">{formatRounded(w.average, currency, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

/** `WeekdayBars` while it loads, row for row. */
export function WeekdayBarsSkeleton() {
  return (
    <ul className="space-y-1.5" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} className={WEEKDAY_ROW}>
          <span className="flex h-4 items-center">
            <Skeleton className="h-3 w-7" />
          </span>
          <span className="h-2 rounded-full bg-muted" />
          <span className="flex h-4 items-center">
            <Skeleton className="h-3 w-12" />
          </span>
        </li>
      ))}
    </ul>
  );
}
