import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { logger, type LogMeta } from "@/lib/logger";

/**
 * Lightweight per-request timing, for answering "where did this slow request
 * spend its time?". Two things accumulate into a request-scoped scope:
 *   - named spans from `time(label, fn)` — one per instrumented step, and
 *   - a DB aggregate (count + total ms) fed by the pool wrapper in `src/db`.
 *
 * The scope is opened at an entry seam (`runAction` for server actions) so every
 * step and query inside it rolls up. `summarizeTimingScope()` renders the whole
 * thing as one line, which `runAction` appends to its `action.ok` log — so a
 * single BetterStack row shows the total, the DB time, and the per-step
 * breakdown without expanding anything.
 *
 * Outside a scope `time()` still logs its own line but records nothing, so it's
 * safe to call from shared code that also runs on the API path or in scripts.
 */

/** A single measured step within a request's timing scope. */
export type TimingSpan = { label: string; durationMs: number };

export type TimingScope = {
  spans: TimingSpan[];
  /** Aggregate of every DB round-trip made inside the scope, plus the single
   *  slowest one — so the request's one summary line can name the worst query
   *  without a log per query. */
  db: { count: number; totalMs: number; slowest: { table: string | null; durationMs: number } | null };
};

const storage = new AsyncLocalStorage<TimingScope>();

/** Open a fresh timing scope around `fn`; spans + DB stats inside accumulate here. */
export function withTiming<T>(fn: () => T): T {
  return storage.run({ spans: [], db: { count: 0, totalMs: 0, slowest: null } }, fn);
}

/**
 * Push an already-measured span into the active scope (no-op outside one). Use
 * for work timed by hand — e.g. steps that ran before the scope was opened and
 * whose duration you want folded into the same breakdown.
 */
export function recordSpan(label: string, durationMs: number): void {
  storage.getStore()?.spans.push({ label, durationMs });
}

/** Record a completed DB round-trip into the active scope (no-op outside one). */
export function recordDbQuery(durationMs: number, table: string | null = null): void {
  const scope = storage.getStore();
  if (scope) {
    scope.db.count += 1;
    scope.db.totalMs += durationMs;
    if (!scope.db.slowest || durationMs > scope.db.slowest.durationMs) {
      scope.db.slowest = { table, durationMs };
    }
  }
}

/** The active scope (spans + DB aggregate), or null when outside one. */
export function getTimingScope(): TimingScope | null {
  return storage.getStore() ?? null;
}

/**
 * A compact one-line breakdown of a scope: the DB aggregate followed by each
 * named span, e.g. `db 9 queries 780ms; ensureBootstrap 210ms, insert 90ms`.
 */
export function summarizeTimingScope(scope: TimingScope): string {
  const noun = scope.db.count === 1 ? "query" : "queries";
  const slow = scope.db.slowest;
  const slowest = slow ? ` (slowest ${slow.table ?? "?"} ${slow.durationMs}ms)` : "";
  const db = `db ${scope.db.count} ${noun} ${scope.db.totalMs}ms${slowest}`;
  const steps = scope.spans.map((s) => `${s.label} ${s.durationMs}ms`).join(", ");
  return steps ? `${db}; ${steps}` : db;
}

/**
 * Run `fn` inside a fresh timing scope and emit exactly ONE `info` line for it:
 * the total wall time plus the DB + per-step breakdown. Use this to give a unit
 * of work (a page render, an API request) a single rich log line instead of a
 * line per query/step. `runAction` builds its own equivalent line, so actions
 * don't need this.
 */
export async function timedScope<T>(label: string, event: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  return withTiming(async () => {
    try {
      return await fn();
    } finally {
      const durationMs = Date.now() - startedAt;
      const scope = getTimingScope();
      const breakdown = scope ? ` — ${summarizeTimingScope(scope)}` : "";
      logger.info(`${label} in ${durationMs}ms${breakdown}`, {
        event,
        label,
        durationMs,
        ...(scope
          ? { dbQueries: scope.db.count, dbMs: scope.db.totalMs, steps: scope.spans }
          : {}),
      });
    }
  });
}

/**
 * Measure `fn`, record its duration as a named span in the active timing scope,
 * and emit a timing log line. Returns fn's result; the span is recorded even when
 * `fn` throws. Defaults to `debug` (console / `wrangler tail` locally, BetterStack
 * only at LOG_LEVEL=debug), since the aggregate breakdown already ships at `info`
 * — pass `level: "info"` for a step you want shipped on its own (e.g. a page
 * render that has no enclosing action to roll it up).
 */
export async function time<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { event?: string; level?: "debug" | "info"; meta?: LogMeta } = {},
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - startedAt;
    recordSpan(label, durationMs);
    const emit = opts.level === "info" ? logger.info : logger.debug;
    emit(`${label} took ${durationMs}ms`, {
      event: opts.event ?? "timing.step",
      step: label,
      durationMs,
      ...opts.meta,
    });
  }
}
