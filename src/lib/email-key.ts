/**
 * An email address reduced to the inbox it delivers to, for counting and
 * de-duplicating people — never for sending, and never for deciding who may
 * join (that stays bound to the exact address).
 *
 * - Lowercased and trimmed.
 * - A `+tag` is dropped from the local part (`zoe+trip@x.com` → `zoe@x.com`):
 *   Gmail, Outlook, iCloud, Fastmail and most others deliver tagged addresses
 *   to the same inbox, so a tag is a free way to look like a new person.
 * - Gmail ignores dots in the local part, and `googlemail.com` is the same
 *   service: `z.o.e@googlemail.com` → `zoe@gmail.com`.
 *
 * Over-merging is the safe direction here — the key only ever makes caps
 * stricter and duplicates easier to spot.
 *
 * **Known gaps, accepted:** dots are collapsed only for `gmail.com` /
 * `googlemail.com`. Google Workspace custom domains (which also ignore dots),
 * Proton's dot/hyphen folding and Fastmail's `user@user.example.com`
 * subdomain addressing are not normalised, so those spellings count as
 * separate people. Every cap that uses this key is also bounded per sender
 * (`SPLIT_ADDS_PER_DAY`, `SPLIT_INVITE_EMAILS_PER_DAY`), so the gap can't be
 * used to send more than those allow. Don't extend this list piecemeal.
 */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

export function emailKey(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0) return address;
  let local = address.slice(0, at);
  let domain = address.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/**
 * A one-way token for an inbox, for logs that count per recipient without
 * keeping the address: hex SHA-256 of `emailKey(email)`. Web Crypto, so it
 * runs the same in Node and on Workers.
 */
export async function recipientHash(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(emailKey(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
