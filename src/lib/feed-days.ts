/**
 * "Go to a date" on the tracker: which day the feed lands on, and what to tell
 * the person when it isn't the one they asked for. Pure and client-safe; the
 * server answers the same question in SQL (`listFeedAround` in `queries.ts`)
 * and reports its answer through `landingFor`, so both sides say it the same
 * way.
 *
 * Days are `occurred_on` values ("YYYY-MM-DD") — exactly what the feed groups
 * its day separators by — so there is no timezone arithmetic anywhere here.
 */

import { formatDateLabel, monthRange } from "./dates";

/** Where a jump landed, relative to the date asked for. */
export type FeedLanding = {
  day: string;
  /**
   * `on` the day asked for; on the nearest earlier day with transactions
   * (`before`); or — when there's nothing that early at all — on the first day
   * after it (`after`).
   */
  side: "on" | "before" | "after";
};

/** A day, or a whole month ("YYYY-MM"), chosen in the tracker's date picker. */
export type FeedJumpTarget = { kind: "day"; date: string } | { kind: "month"; month: string };

export function landingFor(day: string, asked: string): FeedLanding {
  return { day, side: day === asked ? "on" : day < asked ? "before" : "after" };
}

/**
 * The date a target asks the feed for. A month asks for its last day, so it
 * lands on the month's latest day with transactions — and, when the month has
 * none, on the nearest earlier day, exactly as a day with none would.
 */
export function jumpDate(target: FeedJumpTarget): string {
  return target.kind === "day" ? target.date : monthRange(`${target.month}-01`).end;
}

/**
 * The day to land on for `date` among `days` (ascending, no repeats): that
 * day; else the nearest earlier one; else the first one after. Null when
 * there are no days at all.
 */
export function pickFeedDay(days: readonly string[], date: string): FeedLanding | null {
  if (days.length === 0) return null;
  let earlier: string | null = null;
  for (const day of days) {
    if (day > date) break;
    earlier = day;
  }
  return landingFor(earlier ?? days[0], date);
}

/**
 * The same answer from the rows already on screen — or null when they can't
 * give it, and the server has to be asked.
 *
 * The loaded rows are one unbroken stretch of the feed, so they can answer for
 * any date inside it. Past either end they can only answer when that end is the
 * real end (`olderComplete` / `newerComplete`): otherwise an unloaded day may
 * sit closer. And landing on the oldest loaded day is only safe when nothing
 * older is left to load, since more of that same day could still be above it —
 * the jump has to open at the start of the day.
 */
export function pickLoadedFeedDay(
  days: readonly string[],
  date: string,
  { olderComplete, newerComplete }: { olderComplete: boolean; newerComplete: boolean },
): FeedLanding | null {
  if (days.length === 0) return null;
  const first = days[0];
  const last = days[days.length - 1];
  if (date > last && !newerComplete) return null;
  if (date < first && !olderComplete) return null;
  const landing = pickFeedDay(days, date);
  if (!landing || (landing.day === first && !olderComplete)) return null;
  return landing;
}

/** The feed's day keys in order, from its rows (oldest first). */
export function feedDaysOf(rows: readonly { occurredOn: string }[]): string[] {
  const days: string[] = [];
  for (const r of rows) if (days[days.length - 1] !== r.occurredOn) days.push(r.occurredOn);
  return days;
}

function longMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * What to say when a jump didn't land where it was asked to — null when it
 * did. A month counts as hit when the landing day is in it.
 */
export function jumpNotice(target: FeedJumpTarget, landing: FeedLanding, locale = "en-US"): string | null {
  const shown = formatDateLabel(landing.day, locale);
  if (target.kind === "month") {
    if (landing.day.startsWith(`${target.month}-`)) return null;
    const month = longMonth(target.month, locale);
    return landing.side === "after"
      ? `No transactions in or before ${month} — showing the first, ${shown}.`
      : `No transactions in ${month} — showing ${shown}.`;
  }
  if (landing.side === "on") return null;
  const asked = formatDateLabel(target.date, locale);
  return landing.side === "after"
    ? `No transactions on or before ${asked} — showing the first, ${shown}.`
    : `No transactions on ${asked} — showing ${shown}.`;
}
