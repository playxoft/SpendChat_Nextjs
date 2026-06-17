/** Today's date as YYYY-MM-DD in local time. */
export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** First and last day (YYYY-MM-DD) of the month containing `dateISO`. */
export function monthRange(dateISO: string): { start: string; end: string } {
  const [y, m] = dateISO.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Human label for a YYYY-MM-DD date, e.g. "Jun 17, 2026". */
export function formatDateLabel(dateISO: string, locale = "en-US"): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Relative day divider label: Today / Yesterday / full date. */
export function dayDividerLabel(dateISO: string, today: string, locale = "en-US"): string {
  if (dateISO === today) return "Today";
  const t = new Date(`${today}T00:00:00`);
  const yesterday = new Date(t.getTime() - 86400000).toISOString().slice(0, 10);
  if (dateISO === yesterday) return "Yesterday";
  return formatDateLabel(dateISO, locale);
}

/** "Jun 2026" style month label from a YYYY-MM-DD or YYYY-MM string. */
export function monthLabel(value: string, locale = "en-US"): string {
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
