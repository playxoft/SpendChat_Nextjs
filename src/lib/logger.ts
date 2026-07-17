import "server-only";
import { after } from "next/server";
import { getLogContext } from "@/lib/log-context";

/**
 * Structured application logger.
 *
 * Every event is written to the console (so `wrangler tail` in production and
 * the terminal in dev show everything) and, when BetterStack is configured, the
 * same event is shipped to BetterStack Telemetry over HTTP.
 *
 * ## `message` is prose, `event` is the slug
 *
 * BetterStack's list view shows only `message`, so the message MUST read as a
 * sentence describing what actually happened — the thing you'd want to read
 * without expanding the row:
 *
 *   logger.info(`Action ${action} succeeded in ${ms}ms`, { event: "action.ok", action });
 *   logger.warn(`Email skipped for ${to} — no token configured`, { event: "email.skipped" });
 *
 * Never pass a slug as the message (`logger.info("db.write", …)`) — a list of
 * identical "db.write" rows is unreadable and forces a click per row. The stable
 * machine-readable name goes in `event` instead, which is what you filter and
 * chart on (`event:"db.write"`), and keeps that filtering working even as the
 * prose is reworded.
 *
 * Message text is interpolated, so keep user data out of it (or redact it —
 * `redactEmail()`); ids and other structured values belong in `meta`.
 *
 * ## Every log carries the request identity
 *
 * `requestId`, `platform`, `userId`, `workspaceId`, and `profileId` are attached
 * to every event automatically from the per-request `AsyncLocalStorage` context
 * (`src/lib/log-context.ts`), so you never pass them by hand — they're always
 * present (null when outside a request or not yet resolved). Explicit `meta`
 * wins over the context for the same key.
 *
 * Configuration (managed in Doppler — all optional; shipping is simply skipped
 * when the token/host are absent, so local dev needs nothing):
 *   BETTERSTACK_SOURCE_TOKEN   – the source's ingest token (sent as Bearer)
 *   BETTERSTACK_INGESTING_HOST – e.g. s1234567.eu-nbg-2.betterstackdata.com
 *   LOG_LEVEL                  – debug | info | warn | error | silent (default: info)
 *
 * Shipping is deferred with next/server `after()` so it never adds latency to a
 * response (on Cloudflare Workers this maps to `waitUntil`), and every failure
 * is swallowed — logging must never break or slow a request.
 *
 * This module is intentionally excluded from the coverage gate (see
 * vitest.config.ts): it is thin I/O wiring, like the Firebase client adapter.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown> & {
  /**
   * Stable dot-separated event name (`db.write`, `action.ok`) to filter and
   * chart on. Never put this in the message — see the note above.
   */
  event?: string;
};

const RANK: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

// Tests run this module directly under Node; stay silent there unless a level is
// explicitly requested, so the suite output isn't drowned in query logs.
const configuredLevel =
  (process.env.LOG_LEVEL as LogLevel | "silent" | undefined) ??
  (process.env.VITEST ? "silent" : "info");
const MIN_RANK = RANK[configuredLevel] ?? RANK.info;

const SOURCE_TOKEN = process.env.BETTERSTACK_SOURCE_TOKEN;
const INGEST_HOST = process.env.BETTERSTACK_INGESTING_HOST;
const SERVICE = "spendchat";

/**
 * Render a thrown value as a short string for a log `message`. Non-Error throws
 * are stringified rather than interpolated, so a raw object can't spill its
 * internals into the message (`String({})` is just "[object Object]"); the full
 * value still goes to `meta.error`, which is normalized and scrubbed.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

/** Expand Error values into plain, queryable fields (name/message/stack). */
function normalize(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return out;
}

function toConsole(level: LogLevel, message: string, meta?: LogMeta): void {
  const line = `[${level}] ${message}`;
  const write =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (meta && Object.keys(meta).length > 0) write(line, meta);
  else write(line);
}

/**
 * What leaves the process for the external vendor: keep error name/message but
 * drop stack traces (frames can embed file paths and, via driver messages
 * interpolated into them, query values). The console keeps the full detail.
 */
function scrubForShipping(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value && typeof value === "object" && "stack" in value) {
      const rest = { ...(value as Record<string, unknown>) };
      delete rest.stack;
      out[key] = rest;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function ship(level: LogLevel, message: string, meta?: LogMeta): void {
  if (!SOURCE_TOKEN || !INGEST_HOST) return;
  const event = {
    ...scrubForShipping(meta),
    dt: new Date().toISOString(),
    level,
    message,
    service: SERVICE,
    environment: process.env.NODE_ENV ?? "development",
  };
  const send = () =>
    fetch(`https://${INGEST_HOST}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SOURCE_TOKEN}`,
      },
      body: JSON.stringify(event),
    }).catch(() => {
      // Never surface a logging/network failure to the caller.
    });
  try {
    // Defer until the response is flushed (waitUntil on Workers).
    after(send);
  } catch {
    // Called outside a request scope (scripts/tests) — just fire and forget.
    void send();
  }
}

/**
 * Prepend the current request's identity (requestId/platform/user/workspace/
 * profile) so every log line carries it. The context is the base; an explicit
 * `meta` value for the same key wins.
 */
function withRequestFields(meta?: LogMeta): LogMeta {
  const ctx = getLogContext();
  return {
    requestId: ctx.requestId,
    platform: ctx.platform,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    profileId: ctx.profileId,
    ...meta,
  };
}

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  if (RANK[level] < MIN_RANK) return;
  const clean = withRequestFields(normalize(meta));
  toConsole(level, message, clean);
  ship(level, message, clean);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => emit("debug", message, meta),
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
};
