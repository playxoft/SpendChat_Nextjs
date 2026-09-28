"use client";

import { useId } from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateField, NumberField, Segmented } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolCta,
  ToolLayout,
  ToolPanel,
  type ResultRow,
} from "@/components/tools/result";
import { useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { EMPTY, formatNumber, parseNumber } from "@/lib/tools/format";
import {
  addBusinessDays,
  addDays,
  countWeekdays,
  dateSpan,
  daysBetween,
  formatCount,
  formatDate,
  resolveDateInput,
} from "@/lib/tools/date-math";

const SLUG = "days-between-dates";

/**
 * Two date questions behind one switch: "how long between these dates?" and
 * "what date is N days from this one?". The dates default to values relative
 * to today (`today`, `today+30`), resolved in the browser — the page is built
 * ahead of time, so the static HTML can't know what today is. It also means a
 * shared link that leaves a date untouched follows the calendar: send "days
 * from today until 25 December" and it counts down for whoever opens it.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  m: "diff", // mode: diff | add
  a: "today", // start date
  b: "today+30", // end date
  inc: "0", // include the end date
  d: "today", // add mode: the date to count from
  n: "30", // add mode: number of days
  op: "add", // add | sub
  wd: "0", // add mode: working days only
};

export function DaysBetweenTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const today = useToday();
  const locale = useToolLocale();
  const mode = s.m === "add" ? "add" : "diff";
  const long = (date: string) => formatDate(date, locale, "medium");

  // --- Between two dates
  const start = resolveDateInput(s.a, today);
  const end = resolveDateInput(s.b, today);
  const includeEnd = s.inc === "1";
  const span = start && end ? dateSpan(start, end, { includeEnd }) : null;
  const diffPending = !span && (start === undefined || end === undefined);

  // --- Add / subtract
  const from = resolveDateInput(s.d, today);
  const workingOnly = s.wd === "1";
  const nParsed = parseNumber(s.n, locale);
  const nError =
    s.n.trim() === ""
      ? null
      : nParsed === null
        ? "Enter a number of days, like 30."
        : !Number.isInteger(nParsed)
          ? "Use a whole number of days."
          : null;
  const count = nParsed !== null && Number.isInteger(nParsed) ? nParsed : null;
  const signed = count === null ? null : s.op === "sub" ? -count : count;
  const landed =
    from && signed !== null
      ? workingOnly
        ? addBusinessDays(from, signed)
        : addDays(from, signed)
      : null;
  const addPending = from === undefined;

  const unit = workingOnly ? "working day" : "day";
  const direction = signed !== null && signed < 0 ? "before" : "after";

  const copy =
    mode === "diff"
      ? span && start && end
        ? `${formatCount(span.totalDays, "day", locale)} from ${long(start)} to ${long(end)} (${includeEnd ? "end date included" : "end date not included"}).`
        : null
      : landed && from && signed !== null
        ? `${formatCount(Math.abs(signed), unit, locale)} ${direction} ${long(from)} is ${long(landed)}.`
        : null;

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <Segmented
          label="What do you want to work out?"
          hideLabel
          value={mode}
          onChange={(v) => set({ m: v })}
          options={[
            { value: "diff", label: "Between two dates" },
            { value: "add", label: "Add / subtract days" },
          ]}
        />

        {mode === "diff" ? (
          <>
            <div className="space-y-3">
              <DateField label="Start date" value={start ?? ""} onChange={(v) => set({ a: v })} />
              <DateField label="End date" value={end ?? ""} onChange={(v) => set({ b: v })} />
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-xl px-2 text-muted-foreground"
                onClick={() => set({ a: end ?? s.b, b: start ?? s.a })}
              >
                <ArrowUpDown /> Swap dates
              </Button>
            </div>
            <CheckField
              label="Include the end date"
              hint="Counts the first and the last day, as a leave form does. Adds 1 to the total."
              checked={includeEnd}
              onChange={(v) => set({ inc: v ? "1" : "0" })}
            />
          </>
        ) : (
          <>
            <DateField label="Date" value={from ?? ""} onChange={(v) => set({ d: v })} />
            <Segmented
              label="Add or subtract"
              hideLabel
              value={s.op === "sub" ? "sub" : "add"}
              onChange={(v) => set({ op: v })}
              options={[
                { value: "add", label: "Add" },
                { value: "sub", label: "Subtract" },
              ]}
            />
            <NumberField
              label="Number of days"
              integer
              suffix={workingOnly ? "working days" : "days"}
              value={s.n}
              error={nError}
              onChange={(v) => set({ n: v })}
            />
            <CheckField
              label="Count working days only"
              hint="Skips Saturdays and Sundays. Public holidays aren't taken out."
              checked={workingOnly}
              onChange={(v) => set({ wd: v ? "1" : "0" })}
            />
          </>
        )}
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {mode === "diff" ? (
          span && start && end ? (
            <>
              <ResultHero
                label={includeEnd ? "Days, counting the end date" : "Days between the dates"}
                value={formatCount(span.totalDays, "day", locale)}
                sub={
                  span.days < 0
                    ? "The end date is before the start date, so this counts backwards."
                    : span.totalDays === 0
                      ? "Both dates are the same day."
                      : includeEnd
                        ? "Both the start and the end date are counted."
                        : "The start date is counted, the end date isn't."
                }
              />
              <ResultRows rows={diffRows(span, start, end, locale)} />
            </>
          ) : diffPending ? (
            <PendingResult label="Days between the dates" rows={DIFF_ROW_LABELS} />
          ) : (
            <ResultEmpty>Pick a start date and an end date to count the days between them.</ResultEmpty>
          )
        ) : landed && from && signed !== null ? (
          <>
            <ResultHero
              label="Resulting date"
              value={formatDate(landed, locale, "short")}
              sub={`${formatCount(Math.abs(signed), unit, locale)} ${direction} ${long(from)}.`}
            />
            <ResultRows rows={addRows(from, landed, locale)} />
          </>
        ) : addPending ? (
          <PendingResult label="Resulting date" rows={ADD_ROW_LABELS} />
        ) : (
          <ResultEmpty>
            {!from
              ? "Pick a date to count from."
              : count === null
                ? "Enter how many days to add or subtract."
                : "That lands outside the years 1 to 9999 — try fewer days."}
          </ResultEmpty>
        )}

        <ResultActions copy={copy} onReset={reset} withCurrency={false} />
        <ToolCta slug={SLUG} message="Counting the days to payday?" />
      </ToolPanel>
    </ToolLayout>
  );
}

const DIFF_ROW_LABELS = ["In weeks", "In months", "Working days (Mon–Fri)", "Start date", "End date"];
const ADD_ROW_LABELS = ["From", "Calendar days", "Working days (Mon–Fri)"];

/** Whole units with the leftover, skipping zero parts: "4 weeks, 2 days", "1 month". */
function joinCounts(parts: [number, string][], locale: string): string {
  const shown = parts.filter(([n]) => n !== 0);
  return (shown.length ? shown : parts.slice(-1)).map(([n, unit]) => formatCount(n, unit, locale)).join(", ");
}

function diffRows(span: ReturnType<typeof dateSpan>, start: string, end: string, locale: string): ResultRow[] {
  const { ymd } = span;
  const rows: ResultRow[] = [
    {
      label: "In weeks",
      value: joinCounts([[span.weeks, "week"], [span.weekDays, "day"]], locale),
    },
    {
      label: "In months",
      value: joinCounts([[span.totalMonths, "month"], [ymd.days, "day"]], locale),
    },
  ];
  // Under a year, "in years" would just repeat "in months".
  if (ymd.years > 0) {
    rows.push({
      label: "In years",
      value: joinCounts([[ymd.years, "year"], [ymd.months, "month"], [ymd.days, "day"]], locale),
    });
  }
  rows.push(
    { label: "Working days (Mon–Fri)", value: formatNumber(span.workingDays, locale, 0) },
    { label: "Start date", value: formatDate(start, locale, "medium") },
    { label: "End date", value: formatDate(end, locale, "medium") },
  );
  return rows;
}

function addRows(from: string, landed: string, locale: string): ResultRow[] {
  const calendar = daysBetween(from, landed);
  // The days stepped over: after the start date, up to and including the result.
  const stepped = calendar === 0 ? 0 : countWeekdays(addDays(from, Math.sign(calendar))!, landed);
  const weeks = Math.floor(Math.abs(calendar) / 7);
  return [
    { label: "From", value: formatDate(from, locale, "medium") },
    {
      label: "Calendar days",
      value:
        Math.abs(calendar) < 7
          ? formatNumber(Math.abs(calendar), locale, 0)
          : `${formatNumber(Math.abs(calendar), locale, 0)} (${joinCounts([[weeks, "week"], [Math.abs(calendar) % 7, "day"]], locale)})`,
    },
    { label: "Working days (Mon–Fri)", value: formatNumber(stepped, locale, 0) },
  ];
}

/**
 * The result's shape with blanks, while "today" is still unknown — the server
 * render and the moment before hydration. Same layout as the answer, so
 * nothing jumps when it arrives.
 */
function PendingResult({ label, rows }: { label: string; rows: string[] }) {
  return (
    <>
      <ResultHero label={label} value={EMPTY} />
      <ResultRows rows={rows.map((l) => ({ label: l, value: EMPTY }))} />
    </>
  );
}

/** A checkbox whose label row is the tap target, with an optional hint under it. */
function CheckField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <label id={`${id}-label`} htmlFor={id} className="flex-1 cursor-pointer py-3 text-sm font-medium">
          {label}
        </label>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 pl-7 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
