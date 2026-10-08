import { getBestPlanForUser, getPlanForUserIn } from "@/lib/entitlements";
import { ApiError, isRateLimitRefusal } from "@/lib/errors";
import { describeError, logger, type LogMeta } from "@/lib/logger";
import { setLogContext } from "@/lib/log-context";
import { startRateLimit, type PlanResolver } from "@/lib/rate-limit";
import { bucketOfAction } from "@/lib/rate-limit/classify";
import { withRequestContext } from "@/lib/request-context";
import { getTimingScope, summarizeTimingScope, time, withTiming } from "@/lib/timing";

/**
 * Bridges the shared service layer to the web server actions. Services throw
 * `ApiError` for validation/business-rule failures; actions historically
 * return `{ ok: false, error }`. `runAction` runs the service call and converts
 * an `ApiError` into that shape, while letting anything else (notably Next's
 * `redirect()` control-flow error) propagate untouched.
 *
 * Every call is logged under the given `action` label: `info` on success (with
 * duration), `warn` on an expected `ApiError` rejection (returned to the user),
 * and `error` on an unexpected failure (which still propagates so Next renders
 * its error boundary).
 *
 * Every call is also **rate limited per person** (abuse rule C8, `lib/rate-limit`)
 * before `fn` runs: `meta.userId` names the person (every action authenticates
 * before calling this), `meta.rateLimit` the bucket — `"create"` unless the
 * action says `"read"` (read-only, or the person's own UI preferences) or
 * `"ai"`. A refusal comes back as `{ ok: false, code: "rate_limited", details:
 * { bucket, window, retryAfterSeconds } }` like any other rejection.
 */
export type ActionOk<T> = { ok: true } & T;
/**
 * A rejected action. `code` is the `ApiError` code (`plan_limit`,
 * `storage_quota_exceeded`, `forbidden`…) and `details` its payload, so the UI
 * can react to *why* — e.g. open the upgrade dialog for a plan limit — rather
 * than only showing the message.
 */
export type ActionFailure = { ok: false; error: string; code?: string; details?: unknown };
export type ActionResult<T = Record<never, never>> = ActionOk<T> | ActionFailure;

export async function runAction<T extends object = Record<never, never>>(
  action: string,
  fn: () => Promise<T>,
  meta: LogMeta = {},
): Promise<ActionResult<T>> {
  // Actions only ever run from the web app; establish the "web" log context and
  // seed the identity from the caller-provided meta, so the action's own log
  // lines *and* the DB queries it triggers all carry it. The service layer may
  // refine `profileId` to the actually-resolved profile.
  return withRequestContext("web", () =>
    // A timing scope so every `time()` step and DB round-trip inside the action
    // rolls up into the one `action.ok` breakdown line below.
    withTiming(() => {
      setLogContext({
        userId: typeof meta.userId === "string" ? meta.userId : null,
        workspaceId: typeof meta.workspaceId === "string" ? meta.workspaceId : null,
        profileId: typeof meta.profileId === "string" ? meta.profileId : null,
      });
      return runActionInner(action, fn, meta, Date.now());
    }),
  );
}

async function runActionInner<T extends object>(
  action: string,
  fn: () => Promise<T>,
  meta: LogMeta,
  startedAt: number,
): Promise<ActionResult<T>> {
  try {
    if (typeof meta.userId === "string") {
      const userId = meta.userId;
      await time("rateLimit", () =>
        startRateLimit(userId, bucketOfAction(meta)).enforce(actionPlan(userId, meta)),
      );
    }
    const extra = await fn();
    const durationMs = Date.now() - startedAt;
    // Append the DB + per-step breakdown so one row shows where the time went:
    // `Action addTransaction succeeded in 1180ms — db 9 queries 760ms; ensureBootstrap 210ms, insert 90ms, …`.
    const scope = getTimingScope();
    const breakdown = scope ? ` — ${summarizeTimingScope(scope)}` : "";
    logger.info(`Action ${action} succeeded in ${durationMs}ms${breakdown}`, {
      event: "action.ok",
      action,
      ...meta,
      durationMs,
      ...(scope ? { dbQueries: scope.db.count, dbMs: scope.db.totalMs, steps: scope.spans } : {}),
    });
    return { ok: true, ...extra };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof ApiError) {
      // The limiter already logged this person's block once; a looping script
      // must not turn every refused call into a shipped warning.
      const log = isRateLimitRefusal(err) ? logger.debug : logger.warn;
      log(`Action ${action} rejected: ${err.message}`, {
        event: "action.rejected",
        action,
        ...meta,
        code: err.code,
        error: err.message,
        durationMs,
      });
      return {
        ok: false,
        error: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      };
    }
    // Non-Error throws are stringified so raw objects (which could carry query
    // values or other internals) never ship to the log vendor as-is.
    logger.error(`Action ${action} failed: ${describeError(err)}`, {
      event: "action.error",
      action,
      ...meta,
      error: err instanceof Error ? err : String(err),
      durationMs,
    });
    throw err;
  }
}

/**
 * The plan an action is rate-limited by — looked up only when the person is
 * over Free's numbers (see `lib/rate-limit`). The plan of the workspace in
 * `meta` when there is one — but only among the person's own workspaces: some
 * actions take that id straight from the client (`switchWorkspace`,
 * `updateWorkspace`…), and someone else's Pro workspace must not lend its
 * numbers. For an account-level action, the best plan among their workspaces.
 */
function actionPlan(userId: string, meta: LogMeta): PlanResolver {
  return () =>
    typeof meta.workspaceId === "string"
      ? getPlanForUserIn(userId, meta.workspaceId)
      : getBestPlanForUser(userId);
}
