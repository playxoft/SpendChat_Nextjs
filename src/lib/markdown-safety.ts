/**
 * What an Ask answer's Markdown may link to. The answer is model output built
 * from the user's own notes — and a teammate's, in a shared workspace — so it
 * is untrusted: a note can carry instructions, and a link is how instructions
 * become a phishing click. Only absolute `http:`, `https:` and `mailto:` URLs
 * survive; everything else (`javascript:`, `data:`, `vbscript:`, relative or
 * protocol-relative paths, anything unparseable) becomes `null`, and the
 * renderer shows that link's text without a link.
 *
 * Images are not decided here: the renderer drops them outright, because an
 * image loads on sight and its URL can carry data out (`![](https://x/?q=…)`)
 * without anyone clicking anything.
 *
 * Pure and client-safe; unit-tested in `tests/unit/markdown-safety.test.ts`.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The URL if it's safe to link to, else null. */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Browsers ignore control characters and whitespace inside a scheme
  // ("java\tscript:"), so a check on the raw text could be talked past; parse
  // the trimmed string the way a browser would and judge what it resolves to.
  const value = raw.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    // No base: a relative or protocol-relative URL throws and is refused.
    url = new URL(value);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (url.protocol !== "mailto:" && !url.hostname) return null;
  return url.href;
}

/** The `rel` every answer link carries: no opener, no referrer, no endorsement. */
export const ANSWER_LINK_REL = "noopener noreferrer nofollow";
