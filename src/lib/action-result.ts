import { ApiError } from "@/lib/errors";
import { describeError, logger, type LogMeta } from "@/lib/logger";

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
 */
export type ActionOk<T> = { ok: true } & T;
export type ActionResult<T = Record<never, never>> = ActionOk<T> | { ok: false; error: string };

export async function runAction<T extends object = Record<never, never>>(
  action: string,
  fn: () => Promise<T>,
  meta: LogMeta = {},
): Promise<ActionResult<T>> {
  const startedAt = Date.now();
  try {
    const extra = await fn();
    const durationMs = Date.now() - startedAt;
    logger.info(`Action ${action} succeeded in ${durationMs}ms`, {
      event: "action.ok",
      action,
      ...meta,
      durationMs,
    });
    return { ok: true, ...extra };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof ApiError) {
      logger.warn(`Action ${action} rejected: ${err.message}`, {
        event: "action.rejected",
        action,
        ...meta,
        code: err.code,
        error: err.message,
        durationMs,
      });
      return { ok: false, error: err.message };
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
