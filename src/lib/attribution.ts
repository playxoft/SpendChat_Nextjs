import { z } from "zod";
import { siteConfig } from "@/lib/site";

/**
 * Signup attribution — where a new account came from.
 *
 * The public site records a visitor's first touch that names a channel (UTM
 * tags, a directory's `?ref=`, or the referring site) in localStorage
 * (`captureAttribution`, mounted once in the root layout). When the browser
 * bridges a sign-in to `POST /api/auth/session` it sends that record along
 * (`readStoredAttribution`), and `resolveUser` stores it on the freshly
 * inserted `users.acquisition` row — on the INSERT only, so an existing
 * account's origin is never rewritten by a later visit. The one-question
 * "how did you hear about us" card in the tracker merges its answer into the
 * same column (`services/settings.ts`), and `pnpm growth:report:prod` reads
 * it all back.
 *
 * Deliberately small and non-identifying: hostnames and short campaign tags,
 * never full URLs or query strings, so nothing personal can ride along in a
 * referrer.
 */

export const ATTRIBUTION_STORAGE_KEY = "spendchat:attribution";
/**
 * How old an account may be and still be asked "how did you hear about us?".
 *
 * The question is about a decision the visitor made on their way in, so it wants
 * asking while they still remember it — and a months-old account answering it is
 * noise in a report that exists to measure a launch. A week rather than a day so
 * someone who signs up and comes back the following weekend still gets asked
 * once.
 */
export const HEARD_FROM_MAX_ACCOUNT_AGE_DAYS = 7;
/** A first touch older than this is stale — the sign-up isn't its doing. */
export const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const TAG_MAX = 100;
const LANDING_MAX = 200;
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

/**
 * Control characters (NUL included) and lone surrogates: Postgres `jsonb`
 * rejects both, and a tag carrying one would make the users INSERT — and so
 * the sign-in — fail. Stripped at capture and refused by the schema, so a
 * crafted `?utm_source=%00` link can't poison someone's sign-up.
 */
const UNSTORABLE = /[\p{Cc}\p{Cs}]/gu;
const STORABLE_TAG = /^[^\p{Cc}\p{Cs}]+$/u;

const tag = z.string().trim().min(1).max(TAG_MAX).regex(STORABLE_TAG).nullable();

/**
 * What the browser sends and what the INSERT stores. `.strict()` so an
 * unexpected key (a full URL, say) is rejected rather than persisted.
 */
export const attributionInputSchema = z
  .object({
    source: tag.optional(),
    medium: tag.optional(),
    campaign: tag.optional(),
    content: tag.optional(),
    ref: tag.optional(),
    referrer: z.string().trim().regex(HOSTNAME_RE).nullable().optional(),
    landing: z
      .string()
      .regex(/^\/[^\s?#\p{Cc}\p{Cs}]*$/u)
      .max(LANDING_MAX)
      .nullable()
      .optional(),
    capturedAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type AttributionInput = z.infer<typeof attributionInputSchema>;

const HEARD_FROM_VALUES = [
  "hacker_news",
  "reddit",
  "product_hunt",
  "github",
  "linkedin",
  "x",
  "youtube",
  "search",
  "friend",
  "other",
] as const;
export type HeardFromChoice = (typeof HEARD_FROM_VALUES)[number];

/** The chips on the card, in display order. */
export const HEARD_FROM_OPTIONS: ReadonlyArray<{ value: HeardFromChoice; label: string }> = [
  { value: "hacker_news", label: "Hacker News" },
  { value: "reddit", label: "Reddit" },
  { value: "product_hunt", label: "Product Hunt" },
  { value: "github", label: "GitHub" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "youtube", label: "YouTube" },
  { value: "search", label: "Search engine" },
  { value: "friend", label: "A friend" },
  { value: "other", label: "Other" },
];

/** `skipped` is stored too, so the card doesn't come back. */
export const heardFromSchema = z.enum([...HEARD_FROM_VALUES, "skipped"]);
export type HeardFrom = z.infer<typeof heardFromSchema>;

export const HEARD_FROM_OTHER_MAX = 80;
export const heardFromOtherSchema = z
  .string()
  .trim()
  .max(HEARD_FROM_OTHER_MAX)
  .regex(/^[^\p{Cc}\p{Cs}]*$/u);

/** Stored shape of `users.acquisition`. */
export type Acquisition = AttributionInput & {
  heardFrom?: HeardFrom | null;
  heardFromOther?: string | null;
  heardFromAt?: string | null;
};

/**
 * Our own hosts never count as a referrer — that's just navigation.
 *
 * Read from `siteConfig` rather than spelled again here, so the canonical
 * domain has one home; a second copy would go stale the day we move and quietly
 * record every internal navigation on the new domain as an external channel.
 *
 * The rest of the list is the hosts that are also us but aren't that name: a dev
 * box on `127.0.0.1` as well as `localhost`, and the Firebase auth domain, which
 * the browser passes through on password-reset and email-action links. The host
 * actually being viewed is added per call (see `externalHost`), which covers a
 * preview Worker on `*.workers.dev` and any future second production host
 * without naming either.
 */
const INTERNAL_HOSTS = [siteConfig.domain, "localhost", "127.0.0.1", "firebaseapp.com"];

function externalHost(referrer: string, selfHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || !HOSTNAME_RE.test(host)) return null;
  const ours = selfHost ? [...INTERNAL_HOSTS, selfHost.toLowerCase()] : INTERNAL_HOSTS;
  const internal = ours.some((h) => host === h || host.endsWith(`.${h}`));
  return internal ? null : host;
}

function param(url: URL, key: string): string | null {
  const value = url.searchParams.get(key)?.replace(UNSTORABLE, "").trim();
  if (!value) return null;
  // Cut on code points, never through a surrogate pair; a pair is two UTF-16
  // units, so halve the budget when the cut would still overrun `max(TAG_MAX)`.
  const points = Array.from(value);
  const cut = points.slice(0, TAG_MAX).join("");
  return cut.length <= TAG_MAX ? cut : points.slice(0, TAG_MAX / 2).join("");
}

/**
 * Public content trees keep their full path (which page converts is the point);
 * everything else collapses to its first segment, so a share link's secret
 * token or an app route never lands in a column documented as non-identifying.
 */
const KEEP_FULL_PATH = new Set(["features", "blog", "compare", "docs"]);

export function landingFor(pathname: string): string {
  const [first, ...rest] = pathname.split("/").filter(Boolean);
  if (!first) return "/";
  const path = KEEP_FULL_PATH.has(first) ? [first, ...rest].join("/") : first;
  return `/${path}`.replace(UNSTORABLE, "").slice(0, LANDING_MAX);
}

/**
 * Landings where `document.referrer` is a round trip rather than a channel.
 *
 * The auth flow is reached from a verification link in the visitor's own webmail
 * or from an identity provider's redirect, so the referrer there names
 * `mail.google.com` or `accounts.google.com` — neither of which brought anyone
 * to SpendChat. Someone who arrives direct, signs up, then clicks the
 * verification link in Gmail would otherwise have their channel overwritten with
 * their mail provider, and `growth:report` would show a phantom channel for a
 * good share of email/password signups. Inside the app the same is true of any
 * external redirect back in.
 *
 * Only the referrer is blinded: a UTM-tagged ad pointing straight at `/sign-up`
 * is a real campaign and still counts.
 */
const REFERRER_BLIND_LANDINGS = new Set([
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/forgot-password",
  "/auth",
  "/app",
]);

/** Pure: the record for a landing URL plus `document.referrer`. */
export function attributionFromLanding(url: URL, referrer: string, now: Date): AttributionInput {
  const landing = landingFor(url.pathname);
  return {
    source: param(url, "utm_source"),
    medium: param(url, "utm_medium"),
    campaign: param(url, "utm_campaign"),
    content: param(url, "utm_content"),
    ref: param(url, "ref"),
    referrer: REFERRER_BLIND_LANDINGS.has(landing)
      ? null
      : externalHost(referrer, url.hostname),
    landing,
    capturedAt: now.toISOString(),
  };
}

/** Anything that names a channel. A bare direct visit has none. */
export function hasChannelSignal(a: AttributionInput): boolean {
  return Boolean(a.source || a.ref || a.referrer || a.campaign);
}

/**
 * Browser: remember the first touch that names a channel. A stored record with
 * a channel wins over anything later; a stored bare/direct one yields to a
 * later tagged visit (the link that actually brought them back).
 */
export function captureAttribution(now = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    const fresh = attributionFromLanding(new URL(window.location.href), document.referrer, now);
    const existing = readStoredAttribution(now);
    if (existing && (hasChannelSignal(existing) || !hasChannelSignal(fresh))) return;
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Storage blocked (private mode, disabled) — attribution is best-effort.
  }
}

/**
 * Browser: forget the stored touch. Called after a session POST succeeds — the
 * server has seen it once and kept it if that sign-in created the account, so
 * there is nothing left for it to do, and no reason to resend it every hour.
 */
export function clearStoredAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Storage blocked — nothing was stored to begin with.
  }
}

/**
 * Browser: the stored first touch, or null when absent, malformed or stale.
 *
 * A record it refuses is also *removed*, not merely ignored. "Expires after 30
 * days" is what the cookie policy promises the reader, and an entry that sits in
 * local storage forever while being quietly skipped does not honour that — the
 * visitor inspecting their own storage sees a record we said would be gone.
 */
export function readStoredAttribution(now = new Date()): AttributionInput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = attributionInputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      clearStoredAttribution();
      return null;
    }
    const at = parsed.data.capturedAt ? Date.parse(parsed.data.capturedAt) : NaN;
    if (!Number.isFinite(at) || now.getTime() - at > ATTRIBUTION_MAX_AGE_MS) {
      clearStoredAttribution();
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
