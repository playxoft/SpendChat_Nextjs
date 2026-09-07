import { z } from "zod";

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
/** A first touch older than this is stale — the sign-up isn't its doing. */
export const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const TAG_MAX = 100;
const LANDING_MAX = 200;
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

const tag = z.string().trim().min(1).max(TAG_MAX).nullable();

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
      .regex(/^\/[^\s?#]*$/)
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
export const heardFromOtherSchema = z.string().trim().max(HEARD_FROM_OTHER_MAX);

/** Stored shape of `users.acquisition`. */
export type Acquisition = AttributionInput & {
  heardFrom?: HeardFrom | null;
  heardFromOther?: string | null;
  heardFromAt?: string | null;
};

/** Our own hosts never count as a referrer — that's just navigation. */
const INTERNAL_HOSTS = ["spendchat.app", "localhost"];

function externalHost(referrer: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || !HOSTNAME_RE.test(host)) return null;
  const internal = INTERNAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return internal ? null : host;
}

function param(url: URL, key: string): string | null {
  const value = url.searchParams.get(key)?.trim();
  return value ? value.slice(0, TAG_MAX) : null;
}

/** Pure: the record for a landing URL plus `document.referrer`. */
export function attributionFromLanding(url: URL, referrer: string, now: Date): AttributionInput {
  return {
    source: param(url, "utm_source"),
    medium: param(url, "utm_medium"),
    campaign: param(url, "utm_campaign"),
    content: param(url, "utm_content"),
    ref: param(url, "ref"),
    referrer: externalHost(referrer),
    landing: url.pathname.slice(0, LANDING_MAX),
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

/** Browser: the stored first touch, or null when absent, malformed or stale. */
export function readStoredAttribution(now = new Date()): AttributionInput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = attributionInputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const at = parsed.data.capturedAt ? Date.parse(parsed.data.capturedAt) : NaN;
    if (!Number.isFinite(at) || now.getTime() - at > ATTRIBUTION_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
