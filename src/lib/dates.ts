/**
 * Today's date as YYYY-MM-DD in the given IANA timezone (e.g. "Asia/Kolkata").
 * Cloudflare Workers runs in UTC, so the viewer's zone must be passed explicitly
 * to get their real local date; omit it to use the runtime's zone.
 */
export function todayISO(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Parse a YYYY-MM-DD string into a local-time Date (no timezone drift). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a Date back to YYYY-MM-DD in local time. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First and last day (YYYY-MM-DD) of the month containing `dateISO`. */
export function monthRange(dateISO: string): { start: string; end: string } {
  const [y, m] = dateISO.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * Human label for a YYYY-MM-DD date, e.g. "Jun 17, 2026". `occurredOn` is a
 * date-only value, so it's parsed and formatted in UTC to show exactly the
 * stored calendar date regardless of the runtime's zone.
 */
export function formatDateLabel(dateISO: string, locale = "en-US"): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Compact label without the year, e.g. "6 Jul" / "Jul 6" (locale order). */
export function formatDateShort(dateISO: string, locale = "en-US"): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Relative day divider label: Today / Yesterday / full date. */
export function dayDividerLabel(dateISO: string, today: string, locale = "en-US"): string {
  if (dateISO === today) return "Today";
  // Parse as UTC so the day-before arithmetic never drifts by the runtime offset.
  const t = new Date(`${today}T00:00:00Z`);
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

/** "YYYY-MM" month key for a YYYY-MM-DD (or longer) date string. */
export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/**
 * First day (YYYY-MM-DD) of the month `n` months before the one containing
 * `dateISO`. Used to bound the tracker's multi-month scroll window.
 */
export function monthStartBack(dateISO: string, n: number): string {
  const [y, m] = dateISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 - n, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

/**
 * Long month label for the feed's month dividers, e.g. "July 2026"; "This month"
 * for the current one (mirrors the day divider's "Today"/"Yesterday" style).
 */
export function monthDividerLabel(monthKeyValue: string, today: string, locale = "en-US"): string {
  if (monthKeyValue === today.slice(0, 7)) return "This month";
  const [y, m] = monthKeyValue.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
