/**
 * What an Ask answer's Markdown may link to. The answer is model output built
 * from the user's own notes — and a teammate's, in a shared workspace — so it
 * is untrusted: a note can carry instructions, and a link is how instructions
 * become a phishing click. Only absolute `http:`, `https:` and `mailto:` URLs
 * survive — and a `mailto:` only as a bare address, since `?subject=`/`body=`
 * would let a note pre-write the email it opens. Everything else
 * (`javascript:`, `data:`, `vbscript:`, relative or protocol-relative paths,
 * anything unparseable) becomes `null`, and the renderer shows that link's text
 * without a link.
 *
 * A link that survives still shows where it goes (`linkDestination`): a note
 * or a category name can carry a link into a teammate's answer, and link text
 * is free to say "your bank" while pointing anywhere.
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
  if (url.protocol === "mailto:") {
    // One plain address, nothing after it: no headers, no body, no second recipient.
    return !url.search && !url.hash && MAILTO_ADDRESS.test(url.pathname) ? url.href : null;
  }
  if (!url.hostname) return null;
  return url.href;
}

const MAILTO_ADDRESS = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Where a safe link goes, in the words shown beside it: the host without
 * `www.` ("x.io"), or a mailto's address. Hosts come back from `URL` in their
 * ASCII (punycode) form, so a look-alike domain shows as the `xn--…` it is.
 */
export function linkDestination(safeUrl: string): string {
  const url = new URL(safeUrl);
  if (url.protocol === "mailto:") return url.pathname;
  return url.hostname.replace(/^www\./, "");
}

/** A URL or address reduced to what a reader compares: no scheme, `www.`, trailing slash or case. */
function bare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/|mailto:)/, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * Whether a link's visible text already *is* its destination — a bare URL or
 * address, or the host itself — so showing the host again would only repeat
 * it. Anything else ("View details", a different URL) gets the host beside it.
 */
export function linkTextShowsDestination(text: string, safeUrl: string): boolean {
  const shown = bare(text);
  return shown === bare(safeUrl) || shown === bare(linkDestination(safeUrl));
}

/** The `rel` every answer link carries: no opener, no referrer, no endorsement. */
export const ANSWER_LINK_REL = "noopener noreferrer nofollow";
