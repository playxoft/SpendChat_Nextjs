"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { parseISODate, toISODate } from "@/lib/dates";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * A small, dependency-free month calendar. Values are passed and returned as
 * `YYYY-MM-DD` strings parsed in local time, so the selected day always matches
 * what the user clicked (the bug the native date input had).
 */
export function Calendar({
  selected,
  onSelect,
  min,
  max,
  className,
}: {
  selected?: string | null;
  onSelect: (iso: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const selectedDate = selected ? parseISODate(selected) : null;
  const [view, setView] = React.useState<Date>(() =>
    startOfMonth(selectedDate ?? new Date()),
  );
  // "days" shows the day grid; "months" shows a 12-month quick picker so you can
  // jump to any month (Jan…Dec) without stepping one month at a time.
  const [mode, setMode] = React.useState<"days" | "months">("days");

  // Jump the visible month to follow an externally-changed selection
  // (adjust-state-during-render pattern — no effect needed).
  const [syncedSelected, setSyncedSelected] = React.useState(selected ?? null);
  if ((selected ?? null) !== syncedSelected) {
    setSyncedSelected(selected ?? null);
    if (selected) setView(startOfMonth(parseISODate(selected)));
  }

  const minDate = min ? parseISODate(min) : null;
  const maxDate = max ? parseISODate(max) : null;
  const today = new Date();

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view)),
    end: endOfWeek(endOfMonth(view)),
  });

  function isDisabled(d: Date) {
    if (minDate && isBefore(d, minDate)) return true;
    if (maxDate && isAfter(d, maxDate)) return true;
    return false;
  }

  return (
    <div className={cn("w-64 select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={mode === "months" ? "Previous year" : "Previous month"}
          onClick={() => setView((v) => addMonths(v, mode === "months" ? -12 : -1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Choose a month"
          onClick={() => setMode((m) => (m === "days" ? "months" : "days"))}
          className="rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
        >
          {mode === "days" ? format(view, "MMMM yyyy") : format(view, "yyyy")}
        </button>
        <button
          type="button"
          aria-label={mode === "months" ? "Next year" : "Next month"}
          onClick={() => setView((v) => addMonths(v, mode === "months" ? 12 : 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {mode === "months" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, m) => {
            const d = new Date(view.getFullYear(), m, 1);
            const disabled = Boolean(
              (maxDate && isAfter(d, maxDate)) ||
                (minDate && isBefore(endOfMonth(d), minDate)),
            );
            const isCurrentMonth = view.getMonth() === m;
            const isSelMonth =
              !!selectedDate &&
              selectedDate.getFullYear() === d.getFullYear() &&
              selectedDate.getMonth() === m;
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setView(startOfMonth(d));
                  setMode("days");
                }}
                className={cn(
                  "rounded-md py-2 text-sm capitalize transition-colors",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  isSelMonth
                    ? "bg-foreground font-medium text-background"
                    : "hover:bg-muted",
                  !isSelMonth && isCurrentMonth && "ring-1 ring-foreground/30",
                )}
              >
                {format(d, "MMM")}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-[11px] font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = isSameMonth(d, view);
            const isSel = selectedDate ? isSameDay(d, selectedDate) : false;
            const isToday = isSameDay(d, today);
            const disabled = isDisabled(d);
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(toISODate(d))}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                  !inMonth && "text-muted-foreground/40",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  isSel
                    ? "bg-foreground font-medium text-background"
                    : "hover:bg-muted",
                  !isSel && isToday && "ring-1 ring-foreground/30",
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
