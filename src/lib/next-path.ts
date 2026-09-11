/**
 * The `?next=` round trip on the auth pages — where to send someone once they
 * have signed in or created an account. Today it carries the invite page
 * (`/invite/<token>`), so a person who clicks a join link, signs up, verifies
 * their email and signs in still lands on the invite they came for.
 *
 * Only a same-origin *path* is ever honoured. `//evil.example`, `https://…`,
 * a backslash-schemed variant, or anything with control characters is
 * rejected and the caller falls back to `/app` — an open redirect on the
 * sign-in page is a phishing primitive with our domain in the address bar.
 */

/** Longest `next` we'll carry; anything more is not a path someone typed. */
const MAX_NEXT_LENGTH = 512;

/** Whitespace and C0/DEL control characters — a URL never needs them raw. */
const UNSAFE_CHARS = /[\s\x00-\x1f\x7f]/;

/** A safe same-origin path from a raw query value, or null. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  // Exactly one leading slash: "/x" yes; "//host" and "/\host" (browsers treat
  // the backslash as a slash) no.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return null;
  if (UNSAFE_CHARS.test(raw)) return null;
  return raw;
}

/**
 * `path` with `next` (and any extra params) appended as a query string, so the
 * auth pages can hand the destination to one another without each rebuilding
 * the encoding. Params with empty values are dropped.
 */
export function withNext(
  path: string,
  next: string | null,
  extra: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
