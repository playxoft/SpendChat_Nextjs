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
 * PGlite is Postgres 16, which predates the built-in `uuidv7()` that migrations
 * 0001/0002 set as the id default — so we shim it onto `gen_random_uuid()`
 * (a v4 UUID; still unique and a valid UUID, which is all the tests need).
 */
export async function initTestDb(): Promise<PgliteDatabase<typeof schema>> {
  if (db) return db;
  client = new PGlite();
  await client.exec(
    `CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
       AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;`,
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
    `TRUNCATE TABLE transactions, categories, profiles, user_settings RESTART IDENTITY CASCADE;`,
  );
}
