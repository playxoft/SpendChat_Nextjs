/**
 * The legal documents a person agrees to when they create an account, and the
 * version of that bundle. Pure and dependency-free: the sign-up page, the
 * session route and the app's terms gate all read it.
 *
 * `LEGAL_VERSION` names the Terms of Service + Privacy Policy as they stand.
 * Each account records the version it last accepted (`users.terms_version`);
 * the app layout re-asks anyone whose version differs, once. So **move it only
 * for a material change** — new processing, a new kind of recipient, a change
 * to what people agree to — together with each changed page's "Last updated"
 * (`LEGAL_UPDATED`). A wording fix moves neither; moving it for one makes every
 * signed-in person click through the dialog again for nothing.
 */
export const LEGAL_VERSION = "2026-11-05";

/** The date the current version took effect, as the pages print it. */
export const LEGAL_UPDATED = "November 5, 2026";

/**
 * Who may hold an account — the one place the ages live, so the policy pages
 * and the sign-up checkbox can't disagree.
 *
 * Today (the law as it stands in November 2026) the sign-up checkbox asks
 * people to confirm they're `minAge` or older — no date of birth, to keep
 * sign-up one tick. 13 because below it the US (COPPA) and most countries
 * require a parent's verified consent. People under `adultAge` use SpendChat,
 * and may buy, with a parent's or guardian's permission, which the Terms ask
 * them to have.
 *
 * **Before India's DPDP Act s.9 applies (≈ 13 May 2027)** — verifiable
 * parental consent for everyone under 18 — this needs to know who is under 18:
 * add an age question (or a "Are you 18 or older?" choice) to sign-up and the
 * terms gate, build parent approval for those who aren't, decide whether
 * under-18s may still buy, update the Terms (§2) and Privacy Policy (§17), and
 * move `LEGAL_VERSION`.
 */
export const AGE_RULES = {
  minAge: 13,
  adultAge: 18,
} as const;

/** The youngest age that can hold an account. */
export const MIN_AGE = AGE_RULES.minAge;

/** The age at which an account is the person's own, with no parent involved. */
export const ADULT_AGE = AGE_RULES.adultAge;

export const LEGAL_DOCUMENTS = [
  { href: "/terms", title: "Terms of Service" },
  { href: "/privacy", title: "Privacy Policy" },
  { href: "/cookie-policy", title: "Cookie Policy" },
  { href: "/billing-policy", title: "Billing & refund policy" },
] as const;

/** True when `version` is the bundle in force — the only one anyone can accept. */
export function isCurrentLegalVersion(version: unknown): version is typeof LEGAL_VERSION {
  return version === LEGAL_VERSION;
}

/**
 * Browser: an email sign-up ticks the box *before* the account can have a
 * session — the address still has to be verified, possibly days later. The
 * acceptance waits here, tied to the Firebase uid the sign-up created (never
 * the email), until `syncSession` delivers it with the first session sync.
 * Only that same account can pick it up, so a shared browser can't hand one
 * person's tick to somebody else's sign-in.
 */
export const TERMS_STORAGE_KEY = "spendchat:terms-accepted";

/** Long enough to verify an email the next day; short enough not to linger. */
const TERMS_STASH_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** `news`: the optional "email me product news" box was ticked too. */
type TermsStash = { uid: string; version: string; at: string; news?: boolean };

/** What the person chose on the terms dialog beyond the required tick. */
export type TermsChoices = { newsEmails: boolean };

export function storeTermsAcceptance(
  uid: string,
  choices: TermsChoices = { newsEmails: false },
  now = new Date(),
): void {
  if (typeof window === "undefined") return;
  try {
    const stash: TermsStash = {
      uid,
      version: LEGAL_VERSION,
      at: now.toISOString(),
      news: choices.newsEmails,
    };
    window.localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify(stash));
  } catch {
    // Storage blocked: the in-app gate asks again after the first sign-in.
  }
}

export function clearStoredTermsAcceptance(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TERMS_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * The current, unexpired acceptance this browser holds for `uid`, with the
 * choices made alongside it, or null. A stale or unreadable entry is removed;
 * one for another account is left for its owner (and expires on its own).
 */
export function readStoredTermsAcceptance(uid: string, now = new Date()): TermsChoices | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TERMS_STORAGE_KEY);
    if (!raw) return null;
    const stash = JSON.parse(raw) as Partial<TermsStash> | null;
    const at = typeof stash?.at === "string" ? Date.parse(stash.at) : NaN;
    if (
      !stash ||
      !isCurrentLegalVersion(stash.version) ||
      !Number.isFinite(at) ||
      now.getTime() - at > TERMS_STASH_MAX_AGE_MS
    ) {
      clearStoredTermsAcceptance();
      return null;
    }
    return stash.uid === uid ? { newsEmails: stash.news === true } : null;
  } catch {
    clearStoredTermsAcceptance();
    return null;
  }
}

/** True when this browser holds a current, unexpired acceptance for `uid`. */
export function hasStoredTermsAcceptance(uid: string, now = new Date()): boolean {
  return readStoredTermsAcceptance(uid, now) !== null;
}
