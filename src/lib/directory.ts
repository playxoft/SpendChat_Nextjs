import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Read-only lookups of member names/emails against our own `users` table
 * (populated from the verified Firebase token in `resolveUser`). Used for
 * workspace naming at bootstrap and for rendering member lists. Keyed on the
 * internal user id (`users.id`), which is what every `user_id` column stores.
 */

export type DirectoryUser = {
  id: string;
  name: string | null;
  email: string | null;
};

const cols = { id: users.id, name: users.name, email: users.email };

export async function findUserById(userId: string): Promise<DirectoryUser | null> {
  const db = getDb();
  const [row] = await db.select(cols).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export async function findUserByEmail(email: string): Promise<DirectoryUser | null> {
  const db = getDb();
  const [row] = await db
    .select(cols)
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

/** Batch lookup for member lists; missing ids are simply absent from the map. */
export async function findUsersByIds(userIds: string[]): Promise<Map<string, DirectoryUser>> {
  const map = new Map<string, DirectoryUser>();
  if (userIds.length === 0) return map;
  const db = getDb();
  const rows = await db.select(cols).from(users).where(inArray(users.id, userIds));
  for (const row of rows) map.set(row.id, row);
  return map;
}
