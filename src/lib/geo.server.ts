import "server-only";
import { headers } from "next/headers";
import { resolveSettingsDefaults, type SettingsDefaults } from "./geo";

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
