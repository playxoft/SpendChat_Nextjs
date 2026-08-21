/**
 * Reading and writing the browser's *own* cookies — the small, non-httpOnly
 * ones the UI sets for itself: the consent choice, the detected timezone, and
 * the landing page's "take me straight to the app" preference.
 *
 * One module because those three had drifted into three copies of the same
 * `document.cookie` string, and an attribute added to one of them would have
 * silently missed the other two.
 *
 * The session cookies are **not** written here: they're httpOnly and set by the
 * `/api/auth/session` route handler (see `session-cookie.ts`), which is the
 * whole point of them.
 */

/** One compiled pattern per cookie name — `readCookie` runs on every render of
 * the landing page's store, and a fresh `RegExp` there is pure waste. */
const patterns = new Map<string, RegExp>();

function patternFor(name: string): RegExp {
  const cached = patterns.get(name);
  if (cached) return cached;
  // Escape the name: it lands in a regex, and a future rename containing a
  // metacharacter would otherwise silently match the wrong thing.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The `(?:^|;\s*)` prefix is load-bearing: without it `sc_signed_in` also
  // matches some other product's `not_sc_signed_in`.
  const pattern = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`);
  patterns.set(name, pattern);
  return pattern;
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie.match(patternFor(name))?.[1] ?? null;
}

export function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secureAttribute()}`;
}

/** Same attributes as the write, minus the value: a cookie is only replaced by
 * one with a matching name and path. */
export function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax${secureAttribute()}`;
}

/**
 * `Secure` whenever the page itself is served over https, read from the
 * protocol rather than an env flag: a browser refuses to store a `Secure`
 * cookie from an insecure origin, and Safari counts plain-http `localhost` as
 * one — so deriving this from the environment would break local dev there while
 * looking fine in Chrome.
 */
function secureAttribute(): string {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
}
