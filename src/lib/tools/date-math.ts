import { regionFromLocale } from "@/lib/geo";
import { formatNumber } from "@/lib/tools/format";

/**
 * Calendar-date maths for the date tools (`/tools/days-between-dates`,
 * `/tools/age-calculator`) and anything else that counts days — invoice due
 * dates, deposit maturity.
 *
 * Everything works on calendar dates, written `YYYY-MM-DD` — the value a
 * native `<input type="date">` produces — never on instants. Each date is
 * turned into a whole "day number" through `Date.UTC`, and all arithmetic is
 * done on those integers: UTC has no daylight-saving jumps and no local
 * offset, so a 23- or 25-hour day or the visitor's time zone can never move
 * a count by one. The Gregorian calendar is applied proleptically (as ISO 8601
 * and `Intl` do), for years 1 to 9999.
 *
 * Functions taking a date throw a `RangeError` on a malformed one — callers
 * validate input with `parseDate` first. Where a well-formed question has no
 * answer (a result past the year 9999, an age on a date before birth), they
 * return `null` instead, for the UI to explain.
 */

/** A calendar date's parts. `m` is 1–12. */
export type YMD = { y: number; m: number; d: number };

/** A span in calendar units: whole years, then whole months, then days. */
export type YearsMonthsDays = { years: number; months: number; days: number };

const DAY_MS = 86_400_000;
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Days in month `m` (1–12) of year `y`. */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/**
 * `YYYY-MM-DD` → its parts, or null unless it names a real day between the
 * years 1 and 9999 (`2023-02-29` and `2026-13-01` are rejected, not rolled).
 */
export function parseDate(value: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    return null;
  }
  return { y, m, d };
}

/** Parts → `YYYY-MM-DD`. */
export function toISODate({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Days since 1970-01-01 (negative before). */
function dayNumber({ y, m, d }: YMD): number {
  // `Date.UTC` maps years 0–99 to 1900–1999; `setUTCFullYear` doesn't.
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(y, m - 1, d);
  return Math.round(date.getTime() / DAY_MS);
}

function fromDayNumber(n: number): YMD {
  const date = new Date(n * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

const MIN_DAY = dayNumber({ y: MIN_YEAR, m: 1, d: 1 });
const MAX_DAY = dayNumber({ y: MAX_YEAR, m: 12, d: 31 });

/** Day number → `YYYY-MM-DD`, or null outside the supported years. */
function isoFromDay(n: number): string | null {
  return n < MIN_DAY || n > MAX_DAY ? null : toISODate(fromDayNumber(n));
}

function parts(value: string): YMD {
  const p = parseDate(value);
  if (!p) throw new RangeError(`Not a valid date: "${value}"`);
  return p;
}

function day(value: string): number {
  return dayNumber(parts(value));
}

/** 0 = Sunday … 6 = Saturday, as `Date#getDay`. */
function weekdayOfDay(n: number): number {
  // 1970-01-01 was a Thursday.
  return (((n + 4) % 7) + 7) % 7;
}

/** Day of the week: 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return weekdayOfDay(day(date));
}

export function isWeekend(date: string): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

/**
 * Days from `a` to `b`: positive when `b` is later, negative when earlier.
 *
 * The plain count excludes one end — 1 → 2 March is 1 day, as a hotel counts
 * nights. `includeEnd` counts both the first and the last day (1 → 2 March is
 * 2 days, as a leave form counts days off), which adds one day in whichever
 * direction the span runs.
 */
export function daysBetween(a: string, b: string, opts: { includeEnd?: boolean } = {}): number {
  const diff = day(b) - day(a);
  if (!opts.includeEnd) return diff;
  return diff >= 0 ? diff + 1 : diff - 1;
}

/** `date` moved by `n` calendar days (negative goes back), or null past the years 1–9999. */
export function addDays(date: string, n: number): string | null {
  if (!Number.isInteger(n)) throw new RangeError(`Days must be a whole number: ${n}`);
  return isoFromDay(day(date) + n);
}

/**
 * The anniversary `months` whole months after `from`. When the target month
 * is too short for the day — the 31st in a 30-day month, 29 February in a
 * common year — the anniversary falls on the 1st of the month after, never on
 * the last day of the short month. See `diffYMD` for why.
 */
function monthAnniversary(from: YMD, months: number): number {
  const index = from.y * 12 + (from.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  if (from.d <= daysInMonth(y, m)) return dayNumber({ y, m, d: from.d });
  // December has 31 days, so rolling over never crosses into a new year.
  return dayNumber({ y, m: m + 1, d: 1 });
}

/**
 * The span between two dates in whole years, then whole months, then days —
 * the way age is counted. Order doesn't matter: it's measured from the
 * earlier date to the later one.
 *
 * A month is complete when the calendar reaches the same day of the month
 * again; a year, when it reaches the same day and month. When that day doesn't
 * exist (31 January → February, 29 February → a common year), it completes on
 * the 1st of the following month. So 31 Jan → 28 Feb 2023 is 28 days, 31 Jan →
 * 1 Mar is exactly 1 month, and someone born on 29 February turns a year older
 * on 1 March in a common year — the same rule `nextBirthday` uses, so the day
 * the calculator says "happy birthday" is always the day the age ticks over.
 * (Clamping to the last day instead, as some libraries do, makes 31 Jan → 28
 * Feb and 28 Jan → 28 Feb both "1 month".)
 */
export function diffYMD(a: string, b: string): YearsMonthsDays {
  const from = parts(a);
  const to = parts(b);
  return dayNumber(to) < dayNumber(from) ? spanYMD(to, from) : spanYMD(from, to);
}

/** `diffYMD` on parts, `from` ≤ `to`. Not range-checked, so a span may end on 1 Jan 10000. */
function spanYMD(from: YMD, to: YMD): YearsMonthsDays {
  // Months whose anniversary has been reached: every month up to `to`'s own,
  // less that one if its day hasn't come round yet.
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;

  const days = dayNumber(to) - monthAnniversary(from, months);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** Mon–Fri days from `first` to `last`, both counted. 0 if `last` is before `first`. */
function weekdaysBetweenDays(first: number, last: number): number {
  const span = last - first + 1;
  if (span <= 0) return 0;
  // Any 7 consecutive days hold exactly 5 weekdays; walk the (< 7) remainder.
  const weeks = Math.floor(span / 7);
  let count = weeks * 5;
  for (let n = first + weeks * 7; n <= last; n++) {
    const w = weekdayOfDay(n);
    if (w !== 0 && w !== 6) count++;
  }
  return count;
}

/** Working days (Mon–Fri) from `first` to `last`, both included, in either order. */
export function countWeekdays(first: string, last: string): number {
  const a = day(first);
  const b = day(last);
  return weekdaysBetweenDays(Math.min(a, b), Math.max(a, b));
}

/**
 * Working days (Mon–Fri) in the same span `daysBetween` counts: from the
 * earlier date up to, but not including, the later one — or including it with
 * `includeEnd`. Public holidays aren't known here; they differ by country and
 * region. Order doesn't matter.
 *
 * With `includeEnd` this matches a spreadsheet's `NETWORKDAYS`, which counts
 * both ends.
 */
export function businessDaysBetween(
  a: string,
  b: string,
  opts: { includeEnd?: boolean } = {},
): number {
  const lo = Math.min(day(a), day(b));
  const hi = Math.max(day(a), day(b));
  return weekdaysBetweenDays(lo, opts.includeEnd ? hi : hi - 1);
}

/**
 * The date `n` working days (Mon–Fri) after `date` — before it when `n` is
 * negative — or null past the years 1–9999. The start day itself is never
 * counted, so 1 working day after a Friday or a Saturday is the Monday (a
 * spreadsheet's `WORKDAY`). `n = 0` returns `date` unchanged, even on a weekend.
 */
export function addBusinessDays(date: string, n: number): string | null {
  if (!Number.isInteger(n)) throw new RangeError(`Days must be a whole number: ${n}`);
  let current = day(date);
  if (n === 0) return isoFromDay(current);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  // Whole weeks first — 7 days always cover exactly 5 working days — leaving
  // 1 to 5 to walk, so a 40-year span doesn't mean 10,000 loop turns.
  const weeks = Math.floor((remaining - 1) / 5);
  current += step * weeks * 7;
  remaining -= weeks * 5;
  while (remaining > 0) {
    current += step;
    const w = weekdayOfDay(current);
    if (w !== 0 && w !== 6) remaining--;
  }
  return isoFromDay(current);
}

/** The anniversary of `from` `years` years on (29 February → 1 March in a common year). */
function yearAnniversary(from: YMD, years: number): number {
  return monthAnniversary(from, years * 12);
}

export type NextBirthday = {
  /** `YYYY-MM-DD` of the birthday — `today` itself when it's the birthday. */
  date: string;
  /** The age being turned. */
  turns: number;
  /** 0 on the birthday itself. */
  daysUntil: number;
};

/**
 * The first birthday on or after `today`. Someone born on 29 February
 * celebrates on 1 March in a common year — the day `diffYMD` (and so `age`)
 * says they're a year older; some legal systems use 28 February instead.
 *
 * Returns null when `today` is before `dob`, or the birthday falls past 9999.
 */
export function nextBirthday(dob: string, today: string): NextBirthday | null {
  const birth = parts(dob);
  const now = day(today);
  if (now < dayNumber(birth)) return null;

  // Born today → the first birthday is a year away, not "today".
  let turns = Math.max(parts(today).y - birth.y, 1);
  if (yearAnniversary(birth, turns) < now) turns += 1;
  const next = yearAnniversary(birth, turns);
  const date = isoFromDay(next);
  return date === null ? null : { date, turns, daysUntil: next - now };
}

export type Age = YearsMonthsDays & {
  /** Completed months since birth (years × 12 + months). */
  totalMonths: number;
  /** Completed weeks since birth; `weekDays` is the remainder. */
  totalWeeks: number;
  weekDays: number;
  /** Days since birth — 0 on the day you're born. */
  totalDays: number;
};

/** Exact age on `on` for someone born on `dob`, or null when `on` is before `dob`. */
export function age(dob: string, on: string): Age | null {
  const totalDays = day(on) - day(dob);
  if (totalDays < 0) return null;
  const ymd = diffYMD(dob, on);
  return {
    ...ymd,
    totalMonths: ymd.years * 12 + ymd.months,
    totalWeeks: Math.floor(totalDays / 7),
    weekDays: totalDays % 7,
    totalDays,
  };
}

export type DateSpan = {
  /** Signed day count, as `daysBetween` — negative when the end is before the start. */
  days: number;
  /** The same, without the sign. */
  totalDays: number;
  /** `totalDays` as whole weeks plus leftover days. */
  weeks: number;
  weekDays: number;
  /** Years/months/days, counted like age (see `diffYMD`). */
  ymd: YearsMonthsDays;
  /** `ymd` without the years: whole months plus leftover days. */
  totalMonths: number;
  /** Mon–Fri days in the span. */
  workingDays: number;
};

/**
 * Everything the "between two dates" calculator shows, from one call. With
 * `includeEnd` every figure counts the last day too, so 1–31 January reads as
 * 31 days and exactly 1 month rather than 30 days.
 */
export function dateSpan(a: string, b: string, opts: { includeEnd?: boolean } = {}): DateSpan {
  const start = day(a);
  const end = day(b);
  const days = daysBetween(a, b, opts);
  const totalDays = Math.abs(days);
  const lo = Math.min(start, end);
  // Inclusive counting is the exclusive count up to the day after the end.
  const hi = Math.max(start, end) + (opts.includeEnd ? 1 : 0);
  const ymd = spanYMD(fromDayNumber(lo), fromDayNumber(hi));
  return {
    days,
    totalDays,
    weeks: Math.floor(totalDays / 7),
    weekDays: totalDays % 7,
    ymd,
    totalMonths: ymd.years * 12 + ymd.months,
    workingDays: weekdaysBetweenDays(lo, hi - 1),
  };
}

/**
 * A date field's stored value → a calendar date. Besides `YYYY-MM-DD` it
 * accepts `today`, `today+N` and `today-N`, which is how a calculator's
 * defaults stay relative to the day it's opened rather than the day the page
 * was built.
 *
 * Returns `undefined` while `today` is still unknown (the server render),
 * and `null` when the value is empty, malformed, or out of range.
 */
export function resolveDateInput(raw: string, today: string | null): string | null | undefined {
  const value = raw.trim();
  const relative = /^today(?:([+\- ])(\d{1,7}))?$/i.exec(value);
  if (relative) {
    if (today === null) return undefined;
    if (!parseDate(today)) return null;
    const offset = relative[2] ? Number(relative[2]) * (relative[1] === "-" ? -1 : 1) : 0;
    return addDays(today, offset);
  }
  return parseDate(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * The visitor's date conventions, in English: the pages are written in
 * English, so a German browser gets "Monday, 28 Sept 2026" — its day-month
 * order — rather than "Montag" in the middle of an English sentence.
 */
function englishLocale(locale: string): string {
  if (/^en(?:-|$)/i.test(locale)) return locale;
  const region = regionFromLocale(locale);
  return region ? `en-${region}` : "en-US";
}

const DATE_STYLES = {
  /** Mon, Sep 28, 2026 */
  short: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  /** Monday, Sep 28, 2026 */
  medium: { weekday: "long", day: "numeric", month: "short", year: "numeric" },
  /** Monday, September 28, 2026 */
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  /** September 28, 2026 */
  plain: { day: "numeric", month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** A calendar date for display. Formatted in UTC, the zone the day number lives in. */
export function formatDate(date: string, locale = "en-US", style: DateStyle = "medium"): string {
  const instant = new Date(day(date) * DAY_MS);
  try {
    return new Intl.DateTimeFormat(englishLocale(locale), { ...DATE_STYLES[style], timeZone: "UTC" }).format(
      instant,
    );
  } catch {
    return date;
  }
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday". */
export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[weekday(date)]!;
}

/** "1 day", "1,234 days" — `unit` is the singular; English plurals by adding "s". */
export function formatCount(n: number, unit: string, locale = "en-US"): string {
  return `${formatNumber(n, locale, 0)} ${unit}${n === 1 ? "" : "s"}`;
}

/** "34 years, 4 months, 11 days". */
export function formatYMD({ years, months, days }: YearsMonthsDays, locale = "en-US"): string {
  return [
    formatCount(years, "year", locale),
    formatCount(months, "month", locale),
    formatCount(days, "day", locale),
  ].join(", ");
}
