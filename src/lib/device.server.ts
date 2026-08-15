import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort "is this a phone?" from the request, for seeding SSR-only
 * choices that `useIsMobile` corrects after hydration (its server snapshot has
 * no viewport). Chromium's `Sec-CH-UA-Mobile` client hint when present, else
 * the MDN-recommended "Mobi" UA sniff (iPads report a desktop UA and are
 * md-and-up width anyway). A wrong guess isn't broken — it just falls back to
 * the pre-hint behaviour of a visible correction on first paint.
 */
export async function isMobileUA(): Promise<boolean> {
  const h = await headers();
  const hint = h.get("sec-ch-ua-mobile");
  if (hint) return hint.includes("?1");
  return /Mobi/i.test(h.get("user-agent") ?? "");
}
