import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { Logger } from "drizzle-orm";
import * as schema from "./schema";
import { logger } from "@/lib/logger";

let cached: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Feed every Drizzle query into the app logger. Writes (insert/update/delete)
 * are logged at `info` so each mutation is recorded in BetterStack; reads stay
 * at `debug` (console-only unless LOG_LEVEL=debug) to avoid shipping high-volume
 * SELECT traffic. Only debug reads carry bound params — writes log the
 * parameterized SQL alone so user values (amounts, notes) aren't shipped.
 */
const queryLogger: Logger = {
  logQuery(query, params) {
    const op = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "query";
    if (op === "insert" || op === "update" || op === "delete") {
      logger.info("db.write", { op, query });
    } else {
      logger.debug("db.read", { op, query, params });
    }
  },
};

/**
 * Returns a Drizzle client backed by Neon's HTTP driver.
 * HTTP (not a TCP pool) keeps CPU/latency low on Cloudflare Workers.
 * Lazily initialized so env/secrets are read inside the request context.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.NEON_POSTGRES_DATABASE_URL;
  if (!url) throw new Error("NEON_POSTGRES_DATABASE_URL is not set");
  cached = drizzle(neon(url), { schema, logger: queryLogger });
  return cached;
}

export { schema };
