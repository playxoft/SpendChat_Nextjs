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

export function getTestDb(): PgliteDatabase<typeof schema> {
  if (!db) throw new Error("Test DB not initialised — call initTestDb() first");
  return db;
}

/** Wipe every row between tests so each starts from a known-empty state. */
export async function resetTestDb(): Promise<void> {
  if (!client) return;
  await client.exec(
    `TRUNCATE TABLE transactions, categories, profiles, user_settings,
       workspace_invites, profile_access, workspace_members, workspaces,
       users, email_send_log, ai_usage_log, neon_auth."user"
     RESTART IDENTITY CASCADE;`,
  );
}
