import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

let client: PGlite | null = null;
let db: PgliteDatabase<typeof schema> | null = null;

/**
 * Boot an in-process Postgres (PGlite), apply the real Drizzle migrations, and
 * return a Drizzle client wired to the app schema. Runs once per worker.
 *
 * PGlite is Postgres 18, so `uuidv7()` and its interval overload come from
 * `pg_catalog` — the same built-ins production uses, and the ids these tests
 * mint are real v7. A `public` shim onto `gen_random_uuid()` used to sit here,
 * from when PGlite was Postgres 16; it never took effect at this version
 * (`pg_catalog` precedes `public` in `search_path`) and it was misleading, since
 * ordering by `id` is a real tiebreaker in the feed and the list — the tests
 * need it to behave like production's, not like a random v4.
 */
export async function initTestDb(): Promise<PgliteDatabase<typeof schema>> {
  if (db) return db;
  client = new PGlite();
  // Minimal stand-in for the Neon-managed auth directory: bootstrap names
  // workspaces from it and invites are matched against it. Tests register
  // users via the seed helpers.
  await client.exec(
    `CREATE SCHEMA IF NOT EXISTS neon_auth;
     CREATE TABLE IF NOT EXISTS neon_auth."user" (
       "id" uuid PRIMARY KEY,
       "name" text,
       "email" text
     );`,
  );
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "src/db/migrations"),
  });
  return db;
}

/**
 * Collect the SQL a block of app code actually sends, so a test can assert on
 * the *real* statement rather than a copy of it that drifts. Used to `EXPLAIN`
 * a listing's own query — asserting an index exists proves nothing if the query
 * stopped being able to use it.
 */
export type CapturedStatement = {
  text: string;
  params: unknown[];
  /** Which `db.transaction` sent it (1, 2, … in order), or null outside one. */
  tx: number | null;
};

export async function captureSql(fn: () => Promise<unknown>): Promise<CapturedStatement[]> {
  if (!client) throw new Error("Test DB not initialised — call initTestDb() first");
  const pglite = client;
  const original = pglite.query.bind(pglite);
  const originalTx = pglite.transaction.bind(pglite);
  const seen: CapturedStatement[] = [];
  let txCount = 0;
  const recording =
    (query: (...a: unknown[]) => unknown, tx: number | null) =>
    (text: string, ...rest: unknown[]) => {
      seen.push({ text, params: Array.isArray(rest[0]) ? (rest[0] as unknown[]) : [], tx });
      return query(text, ...rest);
    };
  (pglite as { query: unknown }).query = recording(original as (...a: unknown[]) => unknown, null);
  // Drizzle runs a transaction's statements on the handle PGlite passes in.
  (pglite as { transaction: unknown }).transaction = (cb: (tx: { query: unknown }) => Promise<unknown>) =>
    originalTx(async (tx) => {
      const n = ++txCount;
      (tx as { query: unknown }).query = recording(tx.query.bind(tx) as (...a: unknown[]) => unknown, n);
      return cb(tx);
    });
  try {
    await fn();
  } finally {
    (pglite as { query: typeof original }).query = original;
    (pglite as { transaction: typeof originalTx }).transaction = originalTx;
  }
  return seen;
}

/** The raw PGlite client, for tests that need to run a statement with its own
 * bound parameters (EXPLAIN of a captured query). */
export function getTestClient(): PGlite {
  if (!client) throw new Error("Test DB not initialised — call initTestDb() first");
  return client;
}

export function getTestDb(): PgliteDatabase<typeof schema> {
  if (!db) throw new Error("Test DB not initialised — call initTestDb() first");
  return db;
}

/**
 * Wipe every row between tests so each starts from a known-empty state.
 *
 * `CASCADE` only follows foreign keys *into* a listed table, so a table that
 * listed ones point at (organisations — workspaces reference them) and a table
 * with no foreign key at all (the email/AI logs) must be named. Spaces, space
 * members and profile overrides would cascade from workspaces/profiles anyway;
 * they're listed so the reset doesn't depend on that.
 */
export async function resetTestDb(): Promise<void> {
  if (!client) return;
  await client.exec(
    `TRUNCATE TABLE transactions, categories, profile_overrides, profiles,
       space_members, spaces, user_settings, workspace_invites, profile_access,
       workspace_members, workspaces, organizations, users, email_send_log,
       ai_usage_log, workspace_subscriptions, billing_checkout_sessions, billing_webhook_events,
       billing_payments, ai_topups, billing_trial_ledger, billing_request_log, split_settlements, split_shares, split_expense_payers, split_expenses,
       split_members, split_groups, split_rate_log, ai_chat_messages, ai_chats,
       neon_auth."user"
     RESTART IDENTITY CASCADE;`,
  );
}
