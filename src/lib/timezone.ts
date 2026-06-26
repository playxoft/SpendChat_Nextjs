/** Cookie the browser sets with the viewer's IANA timezone (see TimezoneSync). */
export const TZ_COOKIE = "tz";

/** Fallback until the client reports its zone (first paint, or JS disabled). */
export const DEFAULT_TIME_ZONE = "UTC";

/** True for a valid IANA zone like "Asia/Kolkata"; guards attacker-set cookies. */
export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
