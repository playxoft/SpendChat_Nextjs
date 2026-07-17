import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";
import { logger } from "@/lib/logger";

export type Db = NodePgDatabase<typeof schema>;

/** `insert into "transactions" (…)` → `transactions`, for readable log lines. */
function tableOf(query: string): string | null {
  const match = /\b(?:into|update|from|join)\s+"?([a-z_][a-z0-9_$]*)"?/i.exec(query);
  return match?.[1] ?? null;
}

/**
 * Feed every Drizzle query into the app logger. Writes (insert/update/delete)
 * are logged at `info` so each mutation is recorded in BetterStack; reads stay
 * at `debug` (console-only unless LOG_LEVEL=debug) to avoid shipping high-volume
 * SELECT traffic. Only debug reads carry bound params — writes log the
 * parameterized SQL alone so user values (amounts, notes) aren't shipped.
 *
 * The message names the operation and table (`Database insert into transactions`)
 * so BetterStack's list view is readable without opening each row; `event` keeps
 * the `db.write` / `db.read` slug for filtering.
 */
const queryLogger: Logger = {
  logQuery(query, params) {
    const op = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "query";
    const table = tableOf(query);
    const preposition = op === "insert" ? "into" : op === "update" ? "on" : "from";
    const target = table ? ` ${preposition} ${table}` : "";
    if (op === "insert" || op === "update" || op === "delete") {
      logger.info(`Database ${op}${target}`, { event: "db.write", op, table, query });
    } else {
      logger.debug(`Database ${op}${target}`, { event: "db.read", op, table, query, params });
    }
  },
};

/** Build a Drizzle client over a fresh pg pool for `connectionString`. */
function createDb(connectionString: string, max: number): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max });
  return { db: drizzle(pool, { schema, logger: queryLogger }), pool };
}

/**
 * Worker runtime: one pool per request, keyed on the request's execution
 * context. Cloudflare forbids reusing an I/O object (a TCP socket) created for
 * one request inside another, so a module-level pool would throw
 * "Cannot perform I/O on behalf of a different request" on the second request.
 * The context is unique per request and unreachable once it ends, so the entry
 * (and its sockets) are torn down with the request. Hyperdrive pools upstream
 * to Neon, so the in-Worker pool stays tiny.
 */
const workerDbByCtx = new WeakMap<object, Db>();

/**
 * Node runtime (local `next dev`, `wrangler dev` without a Hyperdrive binding,
 * migrations, tests): a long-lived pool is safe to reuse across requests.
 */
let nodeDb: Db | null = null;

/**
 * Returns a Drizzle client backed by node-postgres (TCP).
 *
 * In the deployed Worker, connections go through the Cloudflare Hyperdrive
 * binding — it keeps warm, pooled connections to Neon in Cloudflare's network,
 * so the Worker skips the TCP+TLS+auth handshake on every request. Query result
 * caching is intentionally left OFF (see wrangler.toml) so a freshly written
 * transaction/balance is never served stale.
 *
 * Everywhere else (dev, tests, migrations) it connects straight to Neon via
 * `NEON_POSTGRES_DATABASE_URL`.
 */
export function getDb(): Db {
  // getCloudflareContext() throws outside a request (build, some static paths);
  // fall through to the direct-Neon pool in that case.
  let cf: ReturnType<typeof getCloudflareContext> | null = null;
  try {
    cf = getCloudflareContext();
  } catch {
    cf = null;
  }

  const hyperdrive = cf?.env.HYPERDRIVE?.connectionString;
  if (cf && hyperdrive) {
    // The execution context is a stable per-request object; the workers-types
    // global isn't in this file's type scope, so key the WeakMap on it as an
    // opaque object.
    const key = cf.ctx as object;
    const cached = workerDbByCtx.get(key);
    if (cached) return cached;
    const { db } = createDb(hyperdrive, 5);
    workerDbByCtx.set(key, db);
    return db;
  }

  if (nodeDb) return nodeDb;
  const url =
    process.env.NEON_POSTGRES_DATABASE_URL ?? cf?.env.NEON_POSTGRES_DATABASE_URL;
  if (!url) throw new Error("NEON_POSTGRES_DATABASE_URL is not set");
  nodeDb = createDb(url, 10).db;
  return nodeDb;
}

export { schema };
