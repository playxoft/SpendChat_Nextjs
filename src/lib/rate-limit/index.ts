import "server-only";
import { after } from "next/server";
import { ApiError, rateLimited, retryAfterHeaders } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import {
  PLAN_NAMES,
  RATE_LIMITS,
  isPersonalPlan,
  type PersonalPlan,
  type RateBucket,
} from "@/lib/plans";
import { memoizeForRequest } from "@/lib/request-cache";
import { getRateLimiterStub, type RateLimiterStub } from "./binding";
import { rateLimitMessage } from "./classify";
import { evaluate, type RateSnapshot, type RateWindowLabel } from "./sliding-window";

/**
 * Per-person rate limits (abuse rule C8): every authenticated request counts
 * against one bucket — create, read or ai — over 1-, 5- and 60-minute windows,
 * with the numbers in `RATE_LIMITS` for the plan of the workspace in context.
 *
 * Applied at the two request seams: `runAction` (server actions) and the REST
 * API's auth step (`getApiContext` / `requireApiUser`, inside `handle()`).
 *
 * **How a check runs.** `startRateLimit` sends the hit to the person's Durable
 * Object straight away — before the plan is known — so the round trip overlaps
 * whatever the caller does next (the API resolves the workspace meanwhile).
 * `enforce` then judges the returned counts:
 *  1. against **Free's** numbers first. Every paid number is at least Free's, so
 *     passing them passes every plan, and the plan is never looked up — the
 *     common case costs no query at all;
 *  2. only when over Free's numbers, against the plan `resolvePlan` returns
 *     (a failed lookup counts as Free — strict, never open);
 *  3. a refused hit is taken back after the response, so it doesn't use up the
 *     budget it was refused from and `Retry-After` stays true.
 *
 * **Blocked people cost nothing.** A refusal is remembered in this isolate until
 * its `Retry-After` passes; repeats are refused before any Durable Object call
 * or database read.
 *
 * **Fails open.** No binding (`next dev`, tests, scripts), a Durable Object
 * error, or no answer within `RATE_LIMIT_TIMEOUT_MS` → the request is allowed
 * and a warning logged (throttled), because a broken limiter must never take
 * the app down with it. The AI charge keeps its own per-user lock as a backstop
 * (`ai-quota.ts`).
 */

/** How long a request waits for the Durable Object before failing open. */
export const RATE_LIMIT_TIMEOUT_MS = 250;

/** Blocked people remembered per isolate; past this, expired entries are swept. */
const BLOCK_CACHE_MAX = 1_000;

/** At most one "failed open" warning per isolate in this long. */
const FAILURE_WARNING_EVERY_MS = 60_000;

export type PlanResolver = () => PersonalPlan | Promise<PersonalPlan>;

export type RateCheck = {
  /** Allow the request, or throw a 429 `rate_limited` with its `Retry-After`. */
  enforce(resolvePlan: PlanResolver): Promise<void>;
};

type Hit = { stub: RateLimiterStub; snapshot: RateSnapshot; undone: boolean };
type Block = { until: number; window: RateWindowLabel };

// Module state is per isolate and outlives a request on purpose: it holds only
// "who is blocked until when" and two log throttles — never request data.
const blocked = new Map<string, Block>();
let warnedUnavailable = false;
let lastFailureWarningAt = Number.NEGATIVE_INFINITY;
let suppressedFailures = 0;

const WINDOW_NAMES: Record<RateWindowLabel, string> = {
  "1m": "minute",
  "5m": "5 minutes",
  "1h": "hour",
};

function refusal(bucket: RateBucket, window: RateWindowLabel, retryAfterSeconds: number): ApiError {
  return rateLimited(rateLimitMessage(bucket, retryAfterSeconds), {
    bucket,
    window,
    retryAfterSeconds,
  });
}

function activeBlock(key: string, now: number): Block | null {
  const block = blocked.get(key);
  if (!block) return null;
  if (block.until > now) return block;
  blocked.delete(key);
  return null;
}

function rememberBlock(key: string, block: Block, now: number): void {
  if (blocked.size >= BLOCK_CACHE_MAX) {
    for (const [k, b] of blocked) if (b.until <= now) blocked.delete(k);
    if (blocked.size >= BLOCK_CACHE_MAX) blocked.clear();
  }
  blocked.set(key, block);
}

function noteUnavailable(): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  // Expected in `next dev` and tests; in a deployed Worker it means the binding
  // is missing from wrangler.toml — say so loudly, once.
  const log = process.env.NODE_ENV === "production" ? logger.warn : logger.debug;
  log("Rate limiting is off: the RATE_LIMITER binding isn't available here", {
    event: "rate_limit.unavailable",
  });
}

function noteFailure(bucket: RateBucket, err: unknown): void {
  const now = Date.now();
  if (now - lastFailureWarningAt < FAILURE_WARNING_EVERY_MS) {
    suppressedFailures++;
    return;
  }
  logger.warn(`Rate limit check failed open: ${describeError(err)}`, {
    event: "rate_limit.failed_open",
    bucket,
    suppressed: suppressedFailures,
    error: err instanceof Error ? err : String(err),
  });
  lastFailureWarningAt = now;
  suppressedFailures = 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Count the request on the person's Durable Object; null = fail open. Never rejects. */
async function countHit(userId: string, bucket: RateBucket): Promise<Hit | null> {
  try {
    const stub = getRateLimiterStub(userId);
    if (!stub) {
      noteUnavailable();
      return null;
    }
    const snapshot = await withTimeout(stub.hit(bucket), RATE_LIMIT_TIMEOUT_MS);
    return { stub, snapshot, undone: false };
  } catch (err) {
    noteFailure(bucket, err);
    return null;
  }
}

async function planOrFree(resolvePlan: PlanResolver): Promise<PersonalPlan> {
  try {
    const plan = await resolvePlan();
    return isPersonalPlan(plan) ? plan : "free";
  } catch {
    return "free";
  }
}

/** Give a refused hit back, after the response (`waitUntil` on Workers). */
function takeBack(hit: Hit, bucket: RateBucket): void {
  const run = () =>
    hit.stub.undo(bucket, hit.snapshot.at).catch((err: unknown) => {
      logger.debug(`Couldn't take back a refused request: ${describeError(err)}`, {
        event: "rate_limit.undo_failed",
        bucket,
      });
    });
  try {
    after(run);
  } catch {
    void run(); // outside a request scope (tests, scripts)
  }
}

async function judge(
  key: string,
  bucket: RateBucket,
  pending: Promise<Hit | null>,
  resolvePlan: PlanResolver,
): Promise<void> {
  const hit = await pending;
  if (!hit) return;
  if (evaluate(hit.snapshot, RATE_LIMITS.free[bucket]).allowed) return;

  const plan = await planOrFree(resolvePlan);
  const verdict = evaluate(hit.snapshot, RATE_LIMITS[plan][bucket]);
  if (verdict.allowed) return;

  // A request judged twice (a route that calls both API auth helpers) is taken
  // back, remembered and logged once.
  if (!hit.undone) {
    hit.undone = true;
    takeBack(hit, bucket);
    const now = Date.now();
    rememberBlock(key, { until: now + verdict.retryAfterSeconds * 1000, window: verdict.window }, now);
    logger.warn(
      `Someone went over the ${bucket} limit (${verdict.limit} per ${WINDOW_NAMES[verdict.window]} on ${PLAN_NAMES[plan]}); blocked for ${verdict.retryAfterSeconds}s`,
      {
        event: "rate_limit.exceeded",
        bucket,
        window: verdict.window,
        limit: verdict.limit,
        plan,
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
    );
  }
  throw refusal(bucket, verdict.window, verdict.retryAfterSeconds);
}

/**
 * Count one request by `userId` against `bucket` and return the check to
 * `enforce` once the plan is at hand. Counts once per request however often
 * it's called (memoized in the request scope). Throws the 429 straight away
 * when this isolate already knows the person is blocked.
 */
export function startRateLimit(userId: string, bucket: RateBucket): RateCheck {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const block = activeBlock(key, now);
  if (block) {
    throw refusal(bucket, block.window, Math.max(1, Math.ceil((block.until - now) / 1000)));
  }
  const pending = memoizeForRequest(`rate-limit:${key}`, () => countHit(userId, bucket));
  return { enforce: (resolvePlan) => judge(key, bucket, pending, resolvePlan) };
}

/** Count and judge in one go — for routes that already know the plan. */
export function enforceRateLimit(
  userId: string,
  bucket: RateBucket,
  resolvePlan: PlanResolver,
): Promise<void> {
  try {
    return startRateLimit(userId, bucket).enforce(resolvePlan);
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * For the few cookie-authenticated route handlers outside both seams (uploads,
 * the avatar, the CSV export): count the request and return the 429 to send —
 * `{ error, code, details }` plus `Retry-After`, the shape those routes already
 * answer errors in — or null to carry on.
 */
export async function rateLimitedResponse(
  userId: string,
  bucket: RateBucket,
  resolvePlan: PlanResolver,
): Promise<Response | null> {
  try {
    await enforceRateLimit(userId, bucket, resolvePlan);
    return null;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return Response.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.status, headers: { "Cache-Control": "no-store", ...retryAfterHeaders(err) } },
    );
  }
}

/**
 * Tests only: forget remembered blocks and reset the one-time warnings. The
 * module state is per isolate — in a test file that's every test.
 */
export function resetRateLimitState(): void {
  blocked.clear();
  warnedUnavailable = false;
  lastFailureWarningAt = Number.NEGATIVE_INFINITY;
  suppressedFailures = 0;
}
