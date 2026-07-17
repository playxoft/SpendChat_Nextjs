"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { subDays, subMonths, subYears } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLabel, formatDateShort, parseISODate, toISODate } from "@/lib/dates";
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

/**
 * A single control that replaces the old From/To date fields: a trigger button
 * whose popover offers the quick presets on one side and a range calendar on the
 * other. Selecting either emits `from`/`to` as `YYYY-MM-DD` — the same params the
 * page already reads — so nothing downstream changes.
 */
export function DateRangeFilter({
  from,
  to,
  today,
  locale,
  onChange,
}: {
  from: string;
  to: string;
  today: string;
  locale?: string;
  onChange: (next: { from?: string; to?: string }) => void;
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

  const label = React.useMemo(() => {
    if (activePreset) return activePreset.label;
    if (from && to) {
      const sameYear = from.slice(0, 4) === to.slice(0, 4);
      return sameYear
        ? `${formatDateShort(from, locale)} – ${formatDateShort(to, locale)}`
        : `${formatDateLabel(from, locale)} – ${formatDateLabel(to, locale)}`;
    }
    if (from) return `From ${formatDateShort(from, locale)}`;
    if (to) return `Until ${formatDateShort(to, locale)}`;
    return "All dates";
  }, [activePreset, from, to, locale]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    onChange(presetRange(p));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("min-w-[11rem] justify-start gap-2 font-normal", !from && !to && "text-muted-foreground")}
          aria-label="Date range"
        >
          <CalendarRange className="size-4 opacity-60" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" closeOnOutsideClick className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-0.5 border-b p-2 sm:border-r sm:border-b-0">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
                  activePreset?.label === p.label
                    ? "bg-foreground font-medium text-background"
                    : "hover:bg-muted",
                )}
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
