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

/** The bucket of a request, from its `Request` — see `classifyApiRequest`. */
export function bucketOfRequest(request: Request): RateBucket {
  return classifyApiRequest(request.method, new URL(request.url).pathname);
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
