import "server-only";
import { after } from "next/server";
import { getPlanRangeForUser, type PlanRange } from "@/lib/entitlements";
import { ApiError, rateLimited, retryAfterHeaders } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import {
  PERSONAL_PLANS,
  PLAN_NAMES,
  RATE_LIMITS,
  isPersonalPlan,
  type PersonalPlan,
  type RateBucket,
} from "@/lib/plans";
import { memoizeForRequest } from "@/lib/request-cache";
import { getRateLimiterStub, type RateLimiterStub } from "./binding";
import { formatWait, rateLimitMessage } from "./classify";
import {
  evaluate,
  recordHit,
  removeHit,
  type RateSnapshot,
  type RateVerdict,
  type RateWindowLabel,
} from "./sliding-window";

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
 * **Blocked people cost (almost) nothing.** A refusal is remembered in this
 * isolate as a block: the counts the Durable Object holds without the refused
 * hit, and the person's plan range — the lowest and highest plan among their
 * workspaces, looked up once per block. A later request is judged against
 * those counts locally, at its own weight, so the wait it's told is right for
 * it (a refused 20-read export doesn't stop a plain read). When every one of
 * the person's workspaces is on the same plan — nearly everyone, and every
 * script on a throwaway Free account — the plan is known, and a refusal is
 * thrown by `startRateLimit` itself: no database read, no Durable Object call.
 * Someone with workspaces on different plans has the plan of this request
 * resolved first. Two consequences, accepted: an upgrade mid-block waits out
 * the block (it holds the plan range from when it was made), and a request
 * naming a workspace the person isn't in is told the wait for their own plan.
 * Other isolates may have counted more in the meantime; at worst a request is
 * passed to the Durable Object, which refuses it with the true wait.
 *
 * **Failing open — except AI.** With no binding at all (`next dev`, tests,
 * scripts) every request is allowed. With a binding whose object errors or
 * doesn't answer in time, a create or read is allowed too — a broken limiter
 * must not take the app down — but an **AI** request is refused for a few
 * seconds: AI calls a paid provider, and nothing else limits how many calls
 * one person makes (the monthly allowance gives a failed call its action
 * back, and the charge's per-user lock only stops two running at once). A
 * refused AI hit that lands after the timeout is taken back. Both are logged
 * (throttled).
 */

/** How long a create or read waits for the Durable Object before failing open. */
export const RATE_LIMIT_TIMEOUT_MS = 250;

/** How long an AI request waits before failing closed — AI calls take seconds anyway. */
export const AI_RATE_LIMIT_TIMEOUT_MS = 1_000;

/** The wait an AI request is told when the limiter can't be reached. */
export const AI_UNAVAILABLE_RETRY_SECONDS = 5;

/** Blocked people remembered per isolate; past this, expired entries are swept. */
const BLOCK_CACHE_MAX = 1_000;

/** At most one "failed open/closed" warning per isolate in this long. */
const FAILURE_WARNING_EVERY_MS = 60_000;

/** When the plan range can't be read, assume the widest: the plan is then resolved per request. */
const UNKNOWN_RANGE: PlanRange = {
  floor: PERSONAL_PLANS[0]!,
  ceiling: PERSONAL_PLANS[PERSONAL_PLANS.length - 1]!,
};

export type PlanResolver = () => PersonalPlan | Promise<PersonalPlan>;

export type RateCheck = {
  /** Allow the request, or throw a 429 `rate_limited` with its `Retry-After`. */
  enforce(resolvePlan: PlanResolver): Promise<void>;
};

type Hit = { stub: RateLimiterStub; snapshot: RateSnapshot; weight: number; undone: boolean };
/** What counting a request came to: a hit to judge, or the limiter couldn't count it. */
type Count = { kind: "hit"; hit: Hit } | { kind: "open" } | { kind: "closed" };
/**
 * A remembered refusal: the Durable Object's counts without the refused hit
 * (`base`), the person's plan range then, and when the refused request itself
 * would have passed (an upper bound for keeping the block around).
 */
type Block = { until: number; base: RateSnapshot; range: PlanRange };

// Module state is per isolate and outlives a request on purpose: it holds only
// counts, plan names and log throttles — never request data.
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

/** AI refused because the limiter couldn't count it (fail closed). */
function aiUnavailable(): ApiError {
  return rateLimited(
    `AI requests are paused for a moment. Try again in ${formatWait(AI_UNAVAILABLE_RETRY_SECONDS)}.`,
    { bucket: "ai", retryAfterSeconds: AI_UNAVAILABLE_RETRY_SECONDS },
  );
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

/** How a request of `weight`, judged by `plan`, would fare against a block's counts right now. */
function judgeFromBlock(
  block: Block,
  bucket: RateBucket,
  weight: number,
  plan: PersonalPlan,
  now: number,
): RateVerdict {
  const windows = recordHit(block.base.windows, now, weight);
  return evaluate({ at: now, windows }, RATE_LIMITS[plan][bucket], weight);
}

/** Run `fn` once the response is out (`waitUntil` on Workers), or now outside a request. */
function afterResponse(fn: () => Promise<unknown>): void {
  try {
    after(fn);
  } catch {
    void fn(); // outside a request scope (tests, scripts)
  }
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

function noteFailure(bucket: RateBucket, closed: boolean, err: unknown): void {
  const now = Date.now();
  if (now - lastFailureWarningAt < FAILURE_WARNING_EVERY_MS) {
    suppressedFailures++;
    return;
  }
  const outcome = closed ? "closed (AI refused)" : "open";
  logger.warn(`Rate limit check failed ${outcome}: ${describeError(err)}`, {
    event: closed ? "rate_limit.failed_closed" : "rate_limit.failed_open",
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

/** Count the request on the person's Durable Object. Never rejects. */
async function countHit(userId: string, bucket: RateBucket, weight: number): Promise<Count> {
  const ai = bucket === "ai";
  let stub: RateLimiterStub | null = null;
  let landing: Promise<RateSnapshot> | null = null;
  try {
    stub = getRateLimiterStub(userId);
    if (!stub) {
      noteUnavailable();
      return { kind: "open" }; // no binding at all: dev, tests, scripts
    }
    landing = stub.hit(bucket, weight);
    const timeout = ai ? AI_RATE_LIMIT_TIMEOUT_MS : RATE_LIMIT_TIMEOUT_MS;
    const snapshot = await withTimeout(landing, timeout);
    return { kind: "hit", hit: { stub, snapshot, weight, undone: false } };
  } catch (err) {
    // A binding that errors or is slow: AI fails closed, everything else open.
    noteFailure(bucket, ai, err);
    if (!ai) return { kind: "open" };
    // A refused AI request mustn't count — but a slow hit may still land after
    // the timeout. Take it back if and when it does.
    if (stub && landing) {
      const s = stub;
      const pending = landing;
      afterResponse(() =>
        pending.then((snap) => s.undo(bucket, snap.at, weight)).catch(() => {}),
      );
    }
    return { kind: "closed" };
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

async function planRangeOf(userId: string): Promise<PlanRange> {
  try {
    return await getPlanRangeForUser(userId);
  } catch {
    return UNKNOWN_RANGE;
  }
}

/** Give a refused hit back, after the response (`waitUntil` on Workers). */
function takeBack(hit: Hit, bucket: RateBucket): void {
  afterResponse(() =>
    hit.stub.undo(bucket, hit.snapshot.at, hit.weight).catch((err: unknown) => {
      logger.debug(`Couldn't take back a refused request: ${describeError(err)}`, {
        event: "rate_limit.undo_failed",
        bucket,
      });
    }),
  );
}

async function judge(
  userId: string,
  bucket: RateBucket,
  pending: Promise<Count>,
  resolvePlan: PlanResolver,
  knownPlan?: PersonalPlan,
): Promise<void> {
  const key = `${userId}:${bucket}`;
  const count = await pending;
  if (count.kind === "open") return;
  if (count.kind === "closed") throw aiUnavailable();
  const { hit } = count;
  if (evaluate(hit.snapshot, RATE_LIMITS.free[bucket], hit.weight).allowed) {
    blocked.delete(key); // a block's counts are stale once a request gets through
    return;
  }

  const plan = knownPlan ?? (await planOrFree(resolvePlan));
  const verdict = evaluate(hit.snapshot, RATE_LIMITS[plan][bucket], hit.weight);
  if (verdict.allowed) {
    blocked.delete(key);
    return;
  }

  // A request judged twice (a route that calls both API auth helpers) is taken
  // back, remembered and logged once.
  if (!hit.undone) {
    hit.undone = true;
    takeBack(hit, bucket);
    const range = await planRangeOf(userId);
    const now = Date.now();
    const base: RateSnapshot = {
      at: hit.snapshot.at,
      windows: removeHit(hit.snapshot.windows, hit.snapshot.at, hit.weight),
    };
    rememberBlock(key, { until: now + verdict.retryAfterSeconds * 1000, base, range }, now);
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
 * Count one request by `userId` against `bucket` — weighing `weight` requests
 * (1 unless it's a heavy read, see `classify.ts`) — and return the check to
 * `enforce` once the plan is at hand. Counts once per request however often
 * it's called (memoized in the request scope).
 *
 * When this isolate holds a block for the person (see the header): if all
 * their workspaces are on one plan, the request is judged against the block
 * right here, and a refusal is thrown before anything else runs; if their
 * plans differ, `enforce` resolves this request's plan and judges against the
 * block then. Only a request the block's counts would let through is counted
 * on the Durable Object.
 */
export function startRateLimit(userId: string, bucket: RateBucket, weight = 1): RateCheck {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const block = activeBlock(key, now);
  const count = () =>
    memoizeForRequest(`rate-limit:${key}`, () => countHit(userId, bucket, weight));

  if (block && block.range.floor !== block.range.ceiling) {
    // Workspaces on different plans: this request's plan decides.
    return {
      async enforce(resolvePlan) {
        const plan = await planOrFree(resolvePlan);
        const verdict = judgeFromBlock(block, bucket, weight, plan, Date.now());
        if (!verdict.allowed) throw refusal(bucket, verdict.window, verdict.retryAfterSeconds);
        return judge(userId, bucket, count(), resolvePlan, plan);
      },
    };
  }
  if (block) {
    // One plan across all their workspaces: judged on the spot.
    const verdict = judgeFromBlock(block, bucket, weight, block.range.ceiling, now);
    if (!verdict.allowed) throw refusal(bucket, verdict.window, verdict.retryAfterSeconds);
  }
  const pending = count();
  return { enforce: (resolvePlan) => judge(userId, bucket, pending, resolvePlan) };
}

/** Count and judge in one go — for routes that already know the plan. */
export function enforceRateLimit(
  userId: string,
  bucket: RateBucket,
  resolvePlan: PlanResolver,
  weight = 1,
): Promise<void> {
  try {
    return startRateLimit(userId, bucket, weight).enforce(resolvePlan);
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
  weight = 1,
): Promise<Response | null> {
  try {
    await enforceRateLimit(userId, bucket, resolvePlan, weight);
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
