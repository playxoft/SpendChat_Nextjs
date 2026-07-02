import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Read-only lookups against the Neon-managed `neon_auth."user"` table (the
 * auth user directory). Raw SQL because the schema is owned by Neon Auth, not
 * by our Drizzle migrations. Lookups fail soft (null / empty map): the table
 * is absent until Neon Auth is provisioned, and callers always have a
 * fallback (e.g. invite-by-email instead of direct membership).
 */

export type DirectoryUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type Row = { id: string; name: string | null; email: string | null };

export async function findUserById(userId: string): Promise<DirectoryUser | null> {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`select "id", "name", "email" from neon_auth."user" where "id" = ${userId} limit 1`,
    );
    const row = (result.rows as Row[])[0];
    return row ? { id: row.id, name: row.name, email: row.email } : null;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<DirectoryUser | null> {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`select "id", "name", "email" from neon_auth."user" where lower("email") = ${email.trim().toLowerCase()} limit 1`,
    );
    const row = (result.rows as Row[])[0];
    return row ? { id: row.id, name: row.name, email: row.email } : null;
  } catch {
    return null;
  }
}

/** Batch lookup for member lists; missing ids are simply absent from the map. */
export async function findUsersByIds(userIds: string[]): Promise<Map<string, DirectoryUser>> {
  const map = new Map<string, DirectoryUser>();
  if (userIds.length === 0) return map;
  try {
    const db = getDb();
    const idList = sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const result = await db.execute(
      sql`select "id", "name", "email" from neon_auth."user" where "id" in (${idList})`,
    );
    for (const row of result.rows as Row[]) {
      map.set(row.id, { id: row.id, name: row.name, email: row.email });
    }
  } catch {
    // Directory unavailable (e.g. a database without Neon Auth provisioned).
  }
  return map;
}
