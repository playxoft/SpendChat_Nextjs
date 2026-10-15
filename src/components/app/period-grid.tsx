"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthPeriod, quarterPeriod, startsAfter } from "@/lib/period-ranges";
import { cn } from "@/lib/utils";

const QUARTERS = [1, 2, 3, 4] as const;
export type Quarter = (typeof QUARTERS)[number];

/** Shared look for every pickable item in a date popover — month, quarter, preset. */
export function periodItemClass(active: boolean) {
  return cn(
    "rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-35",
    active ? "bg-foreground font-medium text-background" : "hover:bg-muted",
  );
}

/**
 * Whole months and quarters of one year, with the year stepped by arrows —
 * the left panel of the transactions date filter and of the tracker's "Go to
 * a date". Months and quarters that haven't started are disabled: they can't
 * hold a transaction yet. `month` is 0-based throughout.
 */
export function PeriodGrid({
  year,
  onYearChange,
  today,
  locale,
  activeMonth,
  activeQuarter,
  onPickMonth,
  onPickQuarter,
}: {
  year: number;
  onYearChange: (year: number) => void;
  today: string;
  locale?: string;
  activeMonth: { year: number; month: number } | null;
  activeQuarter: { year: number; quarter: Quarter } | null;
  onPickMonth: (year: number, month: number) => void;
  onPickQuarter: (year: number, quarter: Quarter) => void;
}) {
  const thisYear = Number(today.slice(0, 4));
  const monthNames = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(Date.UTC(2000, m, 1))));
  }, [locale]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous year"
          onClick={() => onYearChange(year - 1)}
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
          onClick={() => onYearChange(year + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Months of ${year}`}>
        {monthNames.map((name, m) => {
          const active = activeMonth?.year === year && activeMonth.month === m;
          return (
            <button
              key={name}
              type="button"
              disabled={startsAfter(monthPeriod(year, m), today)}
              onClick={() => onPickMonth(year, m)}
              aria-pressed={active}
              className={periodItemClass(active)}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1 border-t pt-2" role="group" aria-label={`Quarters of ${year}`}>
        {QUARTERS.map((q) => {
          const active = activeQuarter?.year === year && activeQuarter.quarter === q;
          return (
            <button
              key={q}
              type="button"
              disabled={startsAfter(quarterPeriod(year, q), today)}
              onClick={() => onPickQuarter(year, q)}
              aria-pressed={active}
              aria-label={`Quarter ${q} of ${year}`}
              className={periodItemClass(active)}
            >
              Q{q}
            </button>
          );
        })}
      </div>
    </>
  );
}
