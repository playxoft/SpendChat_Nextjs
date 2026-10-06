import "server-only";
import { after } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getLogContext, runWithLogContext } from "@/lib/log-context";
import { describeError, logger } from "@/lib/logger";
import { runWithRequestCache } from "@/lib/request-cache";

/**
 * Run follow-up work **after the response has gone** — side effects a write
 * triggers but must never wait for (today: the budget alert check).
 *
 * In a request this is Next's `after()`. On Cloudflare Workers, OpenNext hands
 * Next the request's `ctx.waitUntil` (`@next/request-context`), and Next binds
 * the callback to the async context `after()` was called in
 * (`AsyncLocalStorage.bind`). So the callback still sees the request's
 * Cloudflare context, and `getDb()` returns the same request's Hyperdrive pool;
 * I/O inside `waitUntil` belongs to the same request, which Workers allow.
 * It runs after the action or route handler has finished, so any database
 * transaction the write used has already committed.
 *
 * Three things are added around the task:
 *  - The log context is replayed, as `sendEmail` does, so the task's logs keep
 *    the request identity.
 *  - A **fresh** request-cache scope: reads memoized before the write (the
 *    plan, the accessible profiles) must not stand in for reads after it.
 *  - If the request had a Cloudflare context and the task doesn't, the task is
 *    skipped with a warning. Without one, `getDb()` would build a long-lived
 *    pool that the next request can't use ("Cannot perform I/O on behalf of a
 *    different request").
 *
 * Every error is caught and logged — the write it follows has already
 * succeeded and must stay that way.
 *
 * Outside a request (`after()` throws: tests, scripts) the task is queued and
 * runs when `settleDeferred()` is called. The integration suite drains the
 * queue after every test; nothing else in the app writes outside a request.
 */

const queue: (() => Promise<void>)[] = [];

function hasCloudflareContext(): boolean {
  try {
    getCloudflareContext();
    return true;
  } catch {
    return false;
  }
}

/** `name` labels the task in logs ("budget check"). */
export function afterResponse(name: string, task: () => Promise<void>): void {
  const logContext = getLogContext();
  const hadCloudflare = hasCloudflareContext();
  const run = async (): Promise<void> => {
    if (hadCloudflare && !hasCloudflareContext()) {
      logger.warn(`The ${name} was skipped because the request's Cloudflare context was gone after the response`, {
        event: "defer.context_lost",
        task: name,
      });
      return;
    }
    try {
      await runWithLogContext(logContext, () => runWithRequestCache(task));
    } catch (err) {
      logger.error(`The ${name} failed after the response: ${describeError(err)}`, {
        event: "defer.failed",
        task: name,
        error: err,
      });
    }
  };
  try {
    after(run);
  } catch {
    queue.push(run);
  }
}

/** Run every task queued outside a request, in order — for tests and scripts. */
export async function settleDeferred(): Promise<void> {
  while (queue.length > 0) {
    await queue.shift()!();
  }
}
