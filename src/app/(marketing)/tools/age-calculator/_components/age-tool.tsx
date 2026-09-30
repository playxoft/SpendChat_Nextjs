"use client";

import { DateField } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
  type ResultRow,
} from "@/components/tools/result";
import { useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { EMPTY } from "@/lib/tools/format";
import {
  age,
  formatCount,
  formatDate,
  formatYMD,
  nextBirthday,
  resolveDateInput,
  weekdayName,
  type Age,
  type NextBirthday,
} from "@/lib/tools/date-math";


/**
 * Exact age from a date of birth, on today or any other date. "Age on"
 * defaults to `today`, resolved in the browser: the page is built ahead of
 * time, so the static HTML can't know what today is, and a shared link that
 * leaves it untouched keeps answering "how old today".
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  dob: "1990-03-14",
  on: "today",
};

const ROW_LABELS = ["Total months", "Total weeks", "Total days", "Born on a", "Next birthday", "Days to go"];

export function AgeTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const today = useToday();
  const locale = useToolLocale();

  const dob = resolveDateInput(s.dob, today);
  const on = resolveDateInput(s.on, today);
  const result = dob && on ? age(dob, on) : null;
  const birthday = dob && on && result ? nextBirthday(dob, on) : null;
  const pending = !result && (dob === undefined || on === undefined);
  const isToday = on !== null && on !== undefined && on === today;

  const copy =
    result && dob && on
      ? `Born ${formatDate(dob, locale, "plain")}: ${formatYMD(result, locale)} old on ${formatDate(on, locale, "plain")} (${formatCount(result.totalDays, "day", locale)}).`
      : null;

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <DateField
          label="Date of birth"
          value={dob ?? ""}
          min="0001-01-01"
          max="9999-12-31"
          onChange={(v) => set({ dob: v })}
        />
        <DateField
          label="Age on"
          value={on ?? ""}
          min="0001-01-01"
          max="9999-12-31"
          onChange={(v) => set({ on: v })}
          hint="Today by default — pick any past or future date to see the age then."
        />
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {result && dob && on ? (
          <>
            <ResultHero
              label={isToday ? "Your age today" : `Age on ${formatDate(on, locale, "plain")}`}
              value={formatYMD(result, locale)}
              sub={birthdayLine(birthday, result, isToday, locale)}
            />
            <ResultRows rows={rows(result, dob, birthday, locale)} />
            {dob.endsWith("-02-29") && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Born on 29 February: in years without one, the birthday here is 1
                March — the day the age ticks over. Some legal systems use 28 February.
              </p>
            )}
          </>
        ) : pending ? (
          <>
            <ResultHero label="Your age today" value={EMPTY} />
            <ResultRows rows={ROW_LABELS.map((label) => ({ label, value: EMPTY }))} />
          </>
        ) : (
          <ResultEmpty>
            {!dob
              ? "Enter a date of birth to see the exact age."
              : !on
                ? "Pick the date to work the age out on."
                : "The “Age on” date is before the date of birth — pick a later one."}
          </ResultEmpty>
        )}

        <ResultActions copy={copy} onReset={reset} withCurrency={false} />
      </ToolPanel>
    </ToolLayout>
  );
}

function birthdayLine(birthday: NextBirthday | null, result: Age, isToday: boolean, locale: string): string | null {
  if (result.totalDays === 0) return isToday ? "Born today — welcome to the world." : "The day of birth.";
  if (!birthday) return null;
  if (birthday.daysUntil === 0) {
    return isToday ? `Happy birthday! You turn ${birthday.turns} today.` : `A birthday — turning ${birthday.turns}.`;
  }
  const when = formatDate(birthday.date, locale, "medium");
  const wait = formatCount(birthday.daysUntil, "day", locale);
  return isToday
    ? `You turn ${birthday.turns} on ${when} — ${wait} to go.`
    : `Turns ${birthday.turns} on ${when}, ${wait} later.`;
}

/** Whole units with the leftover, skipping a zero remainder: "438 months, 14 days". */
function withRemainder(whole: number, unit: string, rest: number, locale: string): string {
  const main = formatCount(whole, unit, locale);
  return rest === 0 ? main : `${main}, ${formatCount(rest, "day", locale)}`;
}

function rows(result: Age, dob: string, birthday: NextBirthday | null, locale: string): ResultRow[] {
  return [
    { label: "Total months", value: withRemainder(result.totalMonths, "month", result.days, locale) },
    { label: "Total weeks", value: withRemainder(result.totalWeeks, "week", result.weekDays, locale) },
    { label: "Total days", value: formatCount(result.totalDays, "day", locale) },
    { label: "Born on a", value: weekdayName(dob) },
    { label: "Next birthday", value: birthday ? formatDate(birthday.date, locale, "medium") : EMPTY },
    {
      label: "Days to go",
      value: !birthday ? EMPTY : birthday.daysUntil === 0 ? "Today!" : formatCount(birthday.daysUntil, "day", locale),
    },
  ];
}
