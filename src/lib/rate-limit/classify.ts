import type { RateBucket } from "@/lib/plans";
import { isRateBucket } from "./counter";

/**
 * Which rate-limit bucket a request counts against (abuse rule C8), and how a
 * refusal reads. The defaults are what make new routes and actions need no
 * change: a route is classified by method and path, an action by its
 * `runAction` meta.
 */

/** The REST API's AI endpoints — paid model calls, their own bucket. */
const AI_PATH = "/api/v1/ai/";

/**
 * A REST request's bucket: `/api/v1/ai/*` → ai; otherwise GET/HEAD → read;
 * anything else (POST/PUT/PATCH/DELETE) → create. One request is one hit, so a
 * bulk add counts once.
 */
export function classifyApiRequest(method: string, pathname: string): RateBucket {
  if (pathname.startsWith(AI_PATH)) return "ai";
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" ? "read" : "create";
}

/**
 * How many reads a CSV export counts as. An export reads up to 5,000 rows in
 * one request — as much as dozens of feed pages — so on Free it's 6 a minute
 * rather than 120. Used by the API route and the web export route alike.
 */
export const EXPORT_WEIGHT = 20;

/**
 * Reads (by path) that count as more than one request. Each weight must stay
 * at or below the smallest read limit, or such a request could never pass —
 * `tests/unit/rate-limit-classify.test.ts` checks every entry.
 */
export const READ_WEIGHTS: Readonly<Record<string, number>> = {
  "/api/v1/transactions/export": EXPORT_WEIGHT,
};

/** What a request counts as: its bucket, and how many requests it weighs (usually 1). */
export type RequestRate = { bucket: RateBucket; weight: number };

/** A REST request's bucket (`classifyApiRequest`) and weight. */
export function rateOfApiRequest(method: string, pathname: string): RequestRate {
  const bucket = classifyApiRequest(method, pathname);
  return { bucket, weight: bucket === "read" ? (READ_WEIGHTS[pathname] ?? 1) : 1 };
}

/** The same, read off a `Request`. */
export function rateOfRequest(request: Request): RequestRate {
  return rateOfApiRequest(request.method, new URL(request.url).pathname);
}

/**
 * A server action's bucket: `meta.rateLimit` when it names one, else create.
 * Read-only actions and the person's own UI preferences declare `"read"`; the
 * AI actions declare `"ai"`.
 */
export function bucketOfAction(meta: Record<string, unknown>): RateBucket {
  return isRateBucket(meta.rateLimit) ? meta.rateLimit : "create";
}

/** "40 seconds", "a minute", "3 minutes" — rounded up, never "0 seconds". */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s === 1) return "a second";
  if (s < 60) return `${s} seconds`;
  const minutes = Math.ceil(s / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

const WHAT: Record<RateBucket, string> = {
  create: "changes",
  read: "requests",
  ai: "AI requests",
};

/** The refusal shown to the person — plain, with the wait spelled out. */
export function rateLimitMessage(bucket: RateBucket, retryAfterSeconds: number): string {
  return `That's a lot of ${WHAT[bucket]} in a short time. Try again in ${formatWait(retryAfterSeconds)}.`;
}
