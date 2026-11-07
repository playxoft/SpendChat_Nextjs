import "server-only";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  currencyForCountry,
  edgeCountry,
  parseAcceptLanguage,
  regionFromLocale,
  resolveSettingsDefaults,
  type SettingsDefaults,
} from "./geo";

/**
 * The country this request comes from, by Cloudflare's IP geolocation
 * (`cf-ipcountry`) only — never `Accept-Language`, which the client writes —
 * or null when it's unknown (`edgeCountry`) or there's no request. This is the
 * country the checkout currency rule (`checkoutCurrency`) is judged by, so
 * every page that shows a plan's price and the action that charges it read it
 * from here.
 */
export async function requestCountry(): Promise<string | null> {
  // The Workers runtime's own `request.cf.country` first: it can't be set by
  // the client and doesn't depend on the zone's IP-geolocation header setting.
  try {
    const country = (getCloudflareContext().cf as { country?: unknown } | undefined)?.country;
    if (typeof country === "string") return edgeCountry(country);
  } catch {
    // Not inside a Workers request (tests, scripts) — fall back to the header.
  }
  try {
    return edgeCountry((await headers()).get("cf-ipcountry"));
  } catch {
    return null;
  }
}

/**
 * Geo-detected default currency + locale for the current request. Reads
 * Cloudflare's `cf-ipcountry` (IP geolocation, set at the edge on every
 * production request) and falls back to the `Accept-Language` region.
 * Outside a request scope (build steps, scripts) it returns the global
 * defaults instead of throwing.
 */
export async function detectSettingsDefaults(): Promise<SettingsDefaults> {
  try {
    const h = await headers();
    return resolveSettingsDefaults({
      country: h.get("cf-ipcountry"),
      acceptLanguage: h.get("accept-language"),
    });
  } catch {
    return resolveSettingsDefaults({});
  }
}

/**
 * The country this request most likely comes from, for pre-selecting the
 * onboarding country: Cloudflare's IP country first, then the region of the
 * browser's languages (`en-IN` → IN). Null when neither says.
 */
export async function detectCountry(): Promise<string | null> {
  const edge = await requestCountry();
  if (edge && currencyForCountry(edge)) return edge;
  try {
    for (const tag of parseAcceptLanguage((await headers()).get("accept-language"))) {
      const region = regionFromLocale(tag);
      if (region && currencyForCountry(region)) return region;
    }
  } catch {
    // No request scope.
  }
  return null;
}
