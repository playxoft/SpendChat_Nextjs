"use client";

import * as React from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { subDays, subMonths, subYears } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLabel, formatDateShort, parseISODate, toISODate } from "@/lib/dates";
import {
  matchMonth,
  matchQuarter,
  monthPeriod,
  quarterPeriod,
  startsAfter,
  type Period,
} from "@/lib/period-ranges";
import { cn } from "@/lib/utils";

/**
 * Named presets, each computed as "N units back from today … today". `occurredOn`
 * is date-only, so "Last 24 hours" resolves to yesterday→today at day granularity.
 */
const PRESETS: { label: string; from: (today: Date) => Date }[] = [
  { label: "Last 24 hours", from: (t) => subDays(t, 1) },
  { label: "Last 3 days", from: (t) => subDays(t, 3) },
  { label: "Last 7 days", from: (t) => subDays(t, 7) },
  { label: "Last 1 month", from: (t) => subMonths(t, 1) },
  { label: "Last 3 months", from: (t) => subMonths(t, 3) },
  { label: "Last 6 months", from: (t) => subMonths(t, 6) },
  { label: "Last 1 year", from: (t) => subYears(t, 1) },
];

const QUARTERS = [1, 2, 3, 4] as const;

/** The year the month grid opens on: the selected range's, or this one. A
 *  `from` that isn't a date (a hand-edited URL — the server ignores it) falls
 *  back to today, rather than a NaN year that disables every month. */
function gridYear(from: string, today: string): number {
  return Number((/^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today).slice(0, 4));
}

/** Shared look for every pickable item in the popover — month, quarter, preset. */
function itemClass(active: boolean) {
  return cn(
    "rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-35",
    active ? "bg-foreground font-medium text-background" : "hover:bg-muted",
  );
}

/**
 * A single control that replaces the old From/To date fields: a trigger button
 * whose popover lays out three ways to pick a range, left to right — whole
 * months and quarters of a year, a range calendar, and the "last N" presets.
 * Every one emits `from`/`to` as `YYYY-MM-DD` — the same params the page already
 * reads — so nothing downstream changes.
 *
 * The popover opens centred under its trigger, so the months on the left and
 * the presets on the right are each a short move of the pointer away, rather
 * than one side being a reach across the whole panel.
 */
export function DateRangeFilter({
  from,
  to,
  today,
  locale,
  onChange,
  className,
}: {
  from: string;
  to: string;
  today: string;
  locale?: string;
  onChange: (next: { from?: string; to?: string }) => void;
  /** The trigger's size and flex behaviour in its row (the analytics filters match heights). */
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const presetRange = React.useCallback(
    (p: (typeof PRESETS)[number]) => ({
      from: toISODate(p.from(parseISODate(today))),
      to: today,
    }),
    [today],
  );

  // A preset is "active" only when the range ends today and its start matches.
  const activePreset = React.useMemo(() => {
    if (!from || to !== today) return null;
    return PRESETS.find((p) => presetRange(p).from === from) ?? null;
  }, [from, to, today, presetRange]);

  const activeMonth = matchMonth(from, to);
  const activeQuarter = matchQuarter(from, to);

  // The year the month/quarter grid shows: the selected range's, or this one.
  const [year, setYear] = React.useState(() => gridYear(from, today));
  const thisYear = Number(today.slice(0, 4));
  const monthNames = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(Date.UTC(2000, m, 1))));
  }, [locale]);

  const label = React.useMemo(() => {
    if (activePreset) return activePreset.label;
    if (activeMonth) {
      return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(activeMonth.year, activeMonth.month, 1)),
      );
    }
    if (activeQuarter) return `Q${activeQuarter.quarter} ${activeQuarter.year}`;
    if (from && to) {
      const sameYear = from.slice(0, 4) === to.slice(0, 4);
      return sameYear
        ? `${formatDateShort(from, locale)} – ${formatDateShort(to, locale)}`
        : `${formatDateLabel(from, locale)} – ${formatDateLabel(to, locale)}`;
    }
    if (from) return `From ${formatDateShort(from, locale)}`;
    if (to) return `Until ${formatDateShort(to, locale)}`;
    return "All dates";
  }, [activePreset, activeMonth, activeQuarter, from, to, locale]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    onChange(presetRange(p));
    setOpen(false);
  }

  function applyPeriod(p: Period) {
    onChange(p);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from the selected range's year, not wherever the
        // grid was last stepped to.
        if (next) setYear(gridYear(from, today));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "min-w-[11rem] justify-start gap-2 font-normal",
            !from && !to && "text-muted-foreground",
            className,
          )}
          aria-label="Date range"
        >
          <CalendarRange className="size-4 opacity-60" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        closeOnOutsideClick
        className="max-h-[min(36rem,var(--radix-popover-content-available-height))] w-auto overflow-y-auto p-0"
      >
        <div className="flex flex-col md:flex-row">
          {/* Left: whole months and quarters of one year. */}
          <div className="flex flex-col gap-2 border-b p-3 md:w-52 md:border-r md:border-b-0">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous year"
                onClick={() => setYear((y) => y - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums">{year}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next year"
                disabled={year >= thisYear}
                onClick={() => setYear((y) => y + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Months of ${year}`}>
              {monthNames.map((name, m) => {
                const period = monthPeriod(year, m);
                return (
                  <button
                    key={name}
                    type="button"
                    // A month that hasn't started can't hold a transaction yet.
                    disabled={startsAfter(period, today)}
                    onClick={() => applyPeriod(period)}
                    aria-pressed={activeMonth?.year === year && activeMonth.month === m}
                    className={itemClass(activeMonth?.year === year && activeMonth.month === m)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-4 gap-1 border-t pt-2" role="group" aria-label={`Quarters of ${year}`}>
              {QUARTERS.map((q) => {
                const period = quarterPeriod(year, q);
                const active = activeQuarter?.year === year && activeQuarter.quarter === q;
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={startsAfter(period, today)}
                    onClick={() => applyPeriod(period)}
                    aria-pressed={active}
                    aria-label={`Quarter ${q} of ${year}`}
                    className={itemClass(active)}
                  >
                    Q{q}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Centre: any range, day by day. */}
          <div className="p-3">
            <Calendar
              selectionMode="range"
              startDate={from || null}
              endDate={to || null}
              onRangeSelect={(start, end) => {
                onChange({ from: start, to: end });
                setOpen(false);
              }}
            />
          </div>

          {/* Right: the "last N" presets, and the way back to everything. */}
          <div className="flex flex-col gap-0.5 border-t p-2 md:border-t-0 md:border-l">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn("text-left", itemClass(activePreset?.label === p.label), "px-3")}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange({ from: undefined, to: undefined });
                setOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted"
            >
              All dates
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
