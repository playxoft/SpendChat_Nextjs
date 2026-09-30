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

/** How far the arrows move in each view: a month, a year, or a page of 12 years. */
const MONTHS_PER_STEP = { days: 1, months: 12, years: 144 } as const;

/** First year of the 12-year page the year picker shows for `view`. */
function decadeStart(view: Date): number {
  return Math.floor(view.getFullYear() / 12) * 12;
}

/**
 * A small, dependency-free month calendar. Values are passed and returned as
 * `YYYY-MM-DD` strings parsed in local time, so the selected day always matches
 * what the user clicked (the bug the native date input had).
 *
 * Two selection modes:
 * - `"single"` (default): one day; `onSelect(iso)` fires per click.
 * - `"range"`: pick a start then an end (either click order works); the span is
 *   previewed on hover and `onRangeSelect(start, end)` fires on the second click.
 */
export function Calendar({
  selected,
  onSelect,
  selectionMode = "single",
  startDate,
  endDate,
  onRangeSelect,
  min,
  max,
  className,
}: {
  selected?: string | null;
  onSelect?: (iso: string) => void;
  selectionMode?: "single" | "range";
  startDate?: string | null;
  endDate?: string | null;
  onRangeSelect?: (start: string, end: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const isRange = selectionMode === "range";
  // The value that anchors the initially-visible month for either mode.
  const anchorISO = (isRange ? startDate : selected) ?? null;
  const selectedDate = selected ? parseISODate(selected) : null;
  const [view, setView] = React.useState<Date>(() =>
    startOfMonth(anchorISO ? parseISODate(anchorISO) : new Date()),
  );
  // "days" shows the day grid; "months" shows a 12-month quick picker so you can
  // jump to any month (Jan…Dec) without stepping one month at a time.
  const [mode, setMode] = React.useState<"days" | "months" | "years">("days");

  // In range mode: the first-clicked endpoint, held until the second click
  // completes the span; and the day under the cursor, for the hover preview.
  const [pendingStart, setPendingStart] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);

  // Jump the visible month to follow an externally-changed anchor
  // (adjust-state-during-render pattern — no effect needed).
  const [syncedAnchor, setSyncedAnchor] = React.useState(anchorISO);
  if (anchorISO !== syncedAnchor) {
    setSyncedAnchor(anchorISO);
    if (anchorISO) setView(startOfMonth(parseISODate(anchorISO)));
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

  function handleRangeClick(iso: string) {
    if (pendingStart == null) {
      setPendingStart(iso);
      return;
    }
    // Second click completes the span; order the two endpoints chronologically
    // (YYYY-MM-DD compares correctly as plain strings).
    const [s, e] = iso < pendingStart ? [iso, pendingStart] : [pendingStart, iso];
    setPendingStart(null);
    setHovered(null);
    onRangeSelect?.(s, e);
  }

  // The span to highlight: the live preview while picking, else the committed range.
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  if (isRange) {
    if (pendingStart != null) {
      const other = hovered ?? pendingStart;
      [rangeStart, rangeEnd] =
        pendingStart <= other ? [pendingStart, other] : [other, pendingStart];
    } else {
      rangeStart = startDate ?? null;
      rangeEnd = endDate ?? null;
    }
  }

  return (
    <div className={cn("w-64 select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={
            mode === "years" ? "Previous years" : mode === "months" ? "Previous year" : "Previous month"
          }
          onClick={() => setView((v) => addMonths(v, -MONTHS_PER_STEP[mode]))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          // The spoken name starts with what's shown, then says what a click does.
          aria-label={`${
            mode === "days"
              ? format(view, "MMMM yyyy")
              : mode === "months"
                ? format(view, "yyyy")
                : `${decadeStart(view)} – ${decadeStart(view) + 11}`
          }, ${mode === "months" ? "choose a year" : mode === "years" ? "back to days" : "choose a month"}`}
          // days → months → years → back to days. Jumping to a year is what
          // makes a date decades away (a birthday) a few clicks, not dozens.
          onClick={() => setMode((m) => (m === "days" ? "months" : m === "months" ? "years" : "days"))}
          className="rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
        >
          {mode === "days"
            ? format(view, "MMMM yyyy")
            : mode === "months"
              ? format(view, "yyyy")
              : `${decadeStart(view)} – ${decadeStart(view) + 11}`}
        </button>
        <button
          type="button"
          aria-label={mode === "years" ? "Next years" : mode === "months" ? "Next year" : "Next month"}
          onClick={() => setView((v) => addMonths(v, MONTHS_PER_STEP[mode]))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {mode === "years" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const year = decadeStart(view) + i;
            const disabled = Boolean(
              (maxDate && year > maxDate.getFullYear()) ||
                (minDate && year < minDate.getFullYear()),
            );
            const isSelYear = !!selectedDate && selectedDate.getFullYear() === year;
            const isViewYear = view.getFullYear() === year;
            return (
              <button
                key={year}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setView(new Date(year, view.getMonth(), 1));
                  setMode("months");
                }}
                className={cn(
                  "rounded-md py-2 text-sm tabular-nums transition-colors",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  isSelYear ? "bg-foreground font-medium text-background" : "hover:bg-muted",
                  !isSelYear && isViewYear && "ring-1 ring-foreground/30",
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : mode === "months" ? (
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
        <div
          className="grid grid-cols-7 gap-0.5"
          onMouseLeave={() => isRange && setHovered(null)}
        >
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-sm font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d) => {
            const iso = toISODate(d);
            const inMonth = isSameMonth(d, view);
            const isSel = selectedDate ? isSameDay(d, selectedDate) : false;
            const isToday = isSameDay(d, today);
            const disabled = isDisabled(d);
            const isEndpoint =
              isRange && ((!!rangeStart && iso === rangeStart) || (!!rangeEnd && iso === rangeEnd));
            const inRange =
              isRange && !!rangeStart && !!rangeEnd && iso > rangeStart && iso < rangeEnd;
            const highlighted = isSel || isEndpoint;
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => (isRange ? handleRangeClick(iso) : onSelect?.(iso))}
                onMouseEnter={() => isRange && !disabled && setHovered(iso)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                  !inMonth && "text-muted-foreground/40",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  highlighted && "bg-foreground font-medium text-background",
                  inRange && "bg-muted",
                  !highlighted && !inRange && "hover:bg-muted",
                  !highlighted && isToday && "ring-1 ring-foreground/30",
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
