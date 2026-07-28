import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request logging context.
 *
 * These six fields are attached to *every* log line automatically (see
 * `src/lib/logger.ts`), so BetterStack can filter and group by them without each
 * call site having to remember to pass them. Outside a request (scripts, tests,
 * module init) they're all null.
 *
 * The context is request-scoped via `AsyncLocalStorage` (available because
 * `nodejs_compat` is on — see wrangler.toml). It's established once at each
 * entry point — `handle()` for the REST API and `runAction()` for server
 * actions (`src/lib/request-context.ts`) — and enriched as auth resolves the
 * user/workspace and a mutation resolves its target profile.
 */
export type LogContext = {
  /** Cloudflare `cf-ray` in prod, a generated uuid in dev — one per request. */
  requestId: string | null;
  /** Client platform: "web" (Next.js app), "android" / "ios" (Flutter), or "api". */
  platform: string | null;
  /**
   * Request `Host` header — which deployment served it: `spendchat.app`,
   * `beta.spendchat.app`, or `localhost:3010` in dev. Complements `environment`
   * (the static deploy env, shipped separately) so you can filter BetterStack by
   * the exact hostname a request hit.
   */
  host: string | null;
  userId: string | null;
  workspaceId: string | null;
  /** The single profile a request targets, when it has one (else null). */
  profileId: string | null;
};

const EMPTY: LogContext = {
  requestId: null,
  platform: null,
  host: null,
  userId: null,
  workspaceId: null,
  profileId: null,
};

const storage = new AsyncLocalStorage<LogContext>();

/** The active request's context, or an all-null context outside a request. */
export function getLogContext(): LogContext {
  return storage.getStore() ?? EMPTY;
}

/**
 * Merge resolved fields into the active request's context. A no-op outside a
 * request scope, so it's always safe to call (e.g. from a shared service that
 * also runs in scripts/tests). Only defined keys are applied.
 */
export function setLogContext(patch: Partial<LogContext>): void {
  const store = storage.getStore();
  if (!store) return;
  for (const key of Object.keys(patch) as (keyof LogContext)[]) {
    const value = patch[key];
    if (value !== undefined) store[key] = value;
  }
}

/** Run `fn` inside a fresh request context seeded from `seed`. */
export function runWithLogContext<T>(seed: Partial<LogContext>, fn: () => T): T {
  return storage.run({ ...EMPTY, ...seed }, fn);
}

/** Client platforms we recognise on the `X-Client-Platform` request header. */
const KNOWN_PLATFORMS = new Set(["web", "android", "ios"]);

/** Normalise a client-declared platform header to a known value, or null. */
export function normalizePlatform(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return KNOWN_PLATFORMS.has(value) ? value : null;
}

/**
 * Derive the request seed (requestId + platform + host) from a header getter.
 * Pure so it needs no `next/headers`: callers pass `(name) => headers.get(name)`.
 * `cf-ray` is Cloudflare's per-request id in production; without it (local dev,
 * tests) we mint a uuid. `fallbackPlatform` applies when the client sends no
 * `X-Client-Platform` — "web" for server actions, "api" for the mobile REST API.
 * `host` is the request's `Host` header (the deployment's hostname), or null
 * when absent.
 */
export function seedFromHeaders(
  get: (name: string) => string | null,
  fallbackPlatform: string,
): Pick<LogContext, "requestId" | "platform" | "host"> {
  return {
    requestId: get("cf-ray") ?? crypto.randomUUID(),
    platform: normalizePlatform(get("x-client-platform")) ?? fallbackPlatform,
    host: get("host"),
  };
}
