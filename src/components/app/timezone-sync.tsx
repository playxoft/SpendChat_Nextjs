"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { writeCookie } from "@/lib/cookies";
import { TZ_COOKIE } from "@/lib/timezone";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reports the browser's IANA timezone to the server via the `tz` cookie so that
 * server-rendered dates and times show in the viewer's region. Cloudflare
 * Workers runs in UTC and can't infer the zone, so the client must tell it.
 * When the detected zone differs from what the server used, we refresh once so
 * the server components re-render with the correct zone.
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === current) return;
    // One year; SameSite=Lax is enough — same-site requests send it next load.
    writeCookie(TZ_COOKIE, tz, ONE_YEAR_SECONDS);
    router.refresh();
  }, [current, router]);
  return null;
}
