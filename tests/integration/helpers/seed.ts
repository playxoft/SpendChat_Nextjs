import { and, asc, eq, sql } from "drizzle-orm";
import { categories, profiles, transactions, workspaces } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { getTestDb } from "./test-db";
import { uid } from "./session";

/**
 * Every helper normalizes its user argument through `uid()`, so tests keep
 * passing short aliases ("a") even though `user_id` is a uuid column.
 */

/**
 * Register the alias in the neon_auth directory stub (name = alias, email =
 * alias@example.com) so bootstrap can name the default workspace and invites
 * can match. Idempotent.
 */
export async function registerUser(alias: string): Promise<void> {
  const db = getTestDb();
  await db.execute(
    sql`insert into neon_auth."user" ("id", "name", "email")
        values (${uid(alias)}, ${alias}, ${`${alias}@example.com`})
        on conflict ("id") do nothing`,
  );
}

/**
 * Bootstrap a user (settings + default categories + workspace with its
 * Personal profile). Registers the alias in the directory stub first, exactly
 * like a real sign-up exists in neon_auth before the first bootstrap.
 */
export async function bootstrapUser(userId: string): Promise<void> {
  await registerUser(userId);
  await ensureBootstrap(uid(userId));
}

/** The user's own (default) workspace id. */
export async function workspaceIdOf(userId: string): Promise<string> {
  const db = getTestDb();
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerId, uid(userId)))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  return row!.id;
}

/** The user's first (default) profile id. */
export async function firstProfileId(userId: string): Promise<string> {
  const db = getTestDb();
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, uid(userId)))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt))
    .limit(1);
  return row!.id;
}

/** Look up a category id by name + kind for a user. */
export async function categoryId(
  userId: string,
  name: string,
  kind: "income" | "expense",
): Promise<string> {
  const db = getTestDb();
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, uid(userId)),
        eq(categories.name, name),
        eq(categories.kind, kind),
      ),
    )
    .limit(1);
  return row!.id;
}

type TxnSeed = {
  type: "income" | "expense";
  amountMinor: number;
  occurredOn: string;
  profileId?: string;
  categoryId?: string | null;
  title?: string | null;
  description?: string | null;
};

/** Insert a transaction directly (bypassing the action) for query/seed setup. */
export async function insertTxn(userId: string, t: TxnSeed): Promise<string> {
  const db = getTestDb();
  const profileId = t.profileId ?? (await firstProfileId(userId));
  const [row] = await db
    .insert(transactions)
    .values({
      userId: uid(userId),
      type: t.type,
      amountMinor: t.amountMinor,
      occurredOn: t.occurredOn,
      profileId,
      categoryId: t.categoryId ?? null,
      title: t.title ?? null,
      description: t.description ?? null,
    })
    .returning({ id: transactions.id });
  return row!.id;
}

/** Count a user's transactions (optionally scoped to a profile). */
export async function countTxns(userId: string): Promise<number> {
  const db = getTestDb();
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.userId, uid(userId)));
  return rows.length;
}
