import "server-only";
import { after } from "next/server";

/**
 * Structured application logger.
 *
 * Every event is written to the console (so `wrangler tail` in production and
 * the terminal in dev show everything) and, when BetterStack is configured, the
 * same event is shipped to BetterStack Telemetry over HTTP.
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
 * vitest.config.ts): it is thin I/O wiring, like the neon-auth adapters.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown>;

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

function ship(level: LogLevel, message: string, meta?: LogMeta): void {
  if (!SOURCE_TOKEN || !INGEST_HOST) return;
  const event = {
    ...meta,
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

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  if (RANK[level] < MIN_RANK) return;
  const clean = normalize(meta);
  toConsole(level, message, clean);
  ship(level, message, clean);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => emit("debug", message, meta),
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
};
