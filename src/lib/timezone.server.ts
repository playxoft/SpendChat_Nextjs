import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_TIME_ZONE, TZ_COOKIE, isValidTimeZone } from "./timezone";

/**
 * The viewer's IANA timezone, read from the cookie set by <TimezoneSync/>.
 * Falls back to UTC on the first request (before the cookie exists) and when
 * the cookie is missing or invalid. Reading a cookie keeps the route dynamic —
 * the (app) routes already are (`force-dynamic`).
 */
export async function getTimeZone(): Promise<string> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}
