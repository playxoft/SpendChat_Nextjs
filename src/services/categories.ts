import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import { categoryInputSchema, updateCategorySchema } from "@/lib/validation";
import type { Category } from "@/db/schema";

/**
 * Category business logic shared by the web actions and the REST API. Returns
 * data or throws `ApiError`; all writes are scoped to `userId`. A unique-name
 * violation surfaces as a 409 with the same message the web app shows.
 */

const DUPLICATE = "A category with that name already exists";

/** List the user's categories (income first, then by name). */
export async function listCategories(userId: string): Promise<Category[]> {
  const db = getDb();
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.kind), asc(categories.name));
}

export async function createCategory(userId: string, input: unknown): Promise<Category> {
  const data = parseOrThrow(categoryInputSchema, input);
  const db = getDb();
  try {
    const [row] = await db
      .insert(categories)
      .values({
        userId,
        name: data.name,
        kind: data.kind,
        icon: data.icon || null,
        color: data.color || null,
      })
      .returning();
    return row!;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/** Update an owned category. Returns the row, or null when none matched. */
export async function updateCategory(
  userId: string,
  id: string,
  input: unknown,
): Promise<Category | null> {
  const data = parseOrThrow(updateCategorySchema, withId(input, id));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon || null;
  if (data.color !== undefined) patch.color = data.color || null;

  const db = getDb();
  try {
    const rows = await db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.id, data.id), eq(categories.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/**
 * Delete an owned category (referencing transactions are set to NULL by the FK
 * rule). Returns whether a row was removed. Throws for a non-UUID id.
 */
export async function deleteCategory(userId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid category");
  }
  const db = getDb();
  const deleted = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning({ id: categories.id });
  return deleted.length > 0;
}
