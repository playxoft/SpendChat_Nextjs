import "server-only";
import { after } from "next/server";
import { ApiError, rateLimited, retryAfterHeaders } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import {
  PERSONAL_PLANS,
  PLAN_NAMES,
  RATE_LIMITS,
  isPersonalPlan,
  planAtLeast,
  type PersonalPlan,
  type RateBucket,
} from "@/lib/plans";
import { memoizeForRequest } from "@/lib/request-cache";
import { getRateLimiterStub, type RateLimiterStub } from "./binding";
import { formatWait, rateLimitMessage } from "./classify";
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
 * **Blocked people cost nothing.** A refusal is remembered in this isolate,
 * with the plan it was judged by and the weight of the request, until its
 * `Retry-After` passes. A repeat at least that heavy, judged by the same plan
 * (or a lower one), is refused without a Durable Object call; one in a
 * workspace on a higher plan — or after an upgrade — is judged afresh, and so
 * is a lighter one (a refused 20-read export doesn't stop plain reads). A
 * block earned on the top plan refuses before anything else runs.
 *
 * **Failing open — except AI.** With no binding at all (`next dev`, tests,
 * scripts) every request is allowed. With a binding whose object errors or
 * doesn't answer in time, a create or read is allowed too — a broken limiter
 * must not take the app down — but an **AI** request is refused for a few
 * seconds: AI calls a paid provider, and nothing else limits how many calls
 * one person makes (the monthly allowance gives a failed call its action
 * back, and the charge's per-user lock only stops two running at once). Both
 * are logged (throttled).
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

/** No plan is higher: a block earned here can't be lifted by a workspace change. */
const TOP_PLAN = PERSONAL_PLANS[PERSONAL_PLANS.length - 1]!;

export type PlanResolver = () => PersonalPlan | Promise<PersonalPlan>;

export type RateCheck = {
  /** Allow the request, or throw a 429 `rate_limited` with its `Retry-After`. */
  enforce(resolvePlan: PlanResolver): Promise<void>;
};

type Hit = { stub: RateLimiterStub; snapshot: RateSnapshot; weight: number; undone: boolean };
/** What counting a request came to: a hit to judge, or the limiter couldn't count it. */
type Count = { kind: "hit"; hit: Hit } | { kind: "open" } | { kind: "closed" };
/** A remembered refusal: until when, which window, judged on which plan, for how heavy a request. */
type Block = { until: number; window: RateWindowLabel; plan: PersonalPlan; weight: number };

// Module state is per isolate and outlives a request on purpose: it holds only
// "who is blocked until when, on which plan" and log throttles — never request data.
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

function blockRefusal(bucket: RateBucket, block: Block, now: number): ApiError {
  return refusal(bucket, block.window, Math.max(1, Math.ceil((block.until - now) / 1000)));
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
  try {
    const stub = getRateLimiterStub(userId);
    if (!stub) {
      noteUnavailable();
      return { kind: "open" }; // no binding at all: dev, tests, scripts
    }
    const timeout = ai ? AI_RATE_LIMIT_TIMEOUT_MS : RATE_LIMIT_TIMEOUT_MS;
    const snapshot = await withTimeout(stub.hit(bucket, weight), timeout);
    return { kind: "hit", hit: { stub, snapshot, weight, undone: false } };
  } catch (err) {
    // A binding that errors or is slow: AI fails closed, everything else open.
    noteFailure(bucket, ai, err);
    return { kind: ai ? "closed" : "open" };
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
    hit.stub.undo(bucket, hit.snapshot.at, hit.weight).catch((err: unknown) => {
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
  pending: Promise<Count>,
  resolvePlan: PlanResolver,
  knownPlan?: PersonalPlan,
): Promise<void> {
  const count = await pending;
  if (count.kind === "open") return;
  if (count.kind === "closed") throw aiUnavailable();
  const { hit } = count;
  if (evaluate(hit.snapshot, RATE_LIMITS.free[bucket], hit.weight).allowed) return;

  const plan = knownPlan ?? (await planOrFree(resolvePlan));
  const verdict = evaluate(hit.snapshot, RATE_LIMITS[plan][bucket], hit.weight);
  if (verdict.allowed) return;

  // A request judged twice (a route that calls both API auth helpers) is taken
  // back, remembered and logged once.
  if (!hit.undone) {
    hit.undone = true;
    takeBack(hit, bucket);
    const now = Date.now();
    rememberBlock(
      key,
      { until: now + verdict.retryAfterSeconds * 1000, window: verdict.window, plan, weight: hit.weight },
      now,
    );
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
 * When this isolate already holds a block for the person, for a request at
 * least this heavy: earned on the top plan, it throws the 429 straight away;
 * otherwise counting waits for the plan — the same plan or a lower one is
 * refused from the block, a higher one (another workspace, an upgrade) is
 * counted and judged afresh.
 */
export function startRateLimit(userId: string, bucket: RateBucket, weight = 1): RateCheck {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const found = activeBlock(key, now);
  // A lighter request than the one refused may still fit: let it be counted.
  const block = found && weight >= found.weight ? found : null;
  if (block?.plan === TOP_PLAN) throw blockRefusal(bucket, block, now);
  const count = () =>
    memoizeForRequest(`rate-limit:${key}`, () => countHit(userId, bucket, weight));
  if (!block) {
    const pending = count();
    return { enforce: (resolvePlan) => judge(key, bucket, pending, resolvePlan) };
  }
  return {
    async enforce(resolvePlan) {
      const plan = await planOrFree(resolvePlan);
      if (!planAtLeast(plan, block.plan) || plan === block.plan) {
        throw blockRefusal(bucket, block, Date.now());
      }
      return judge(key, bucket, count(), resolvePlan, plan);
    },
  };
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
