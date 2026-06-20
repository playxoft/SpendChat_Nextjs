"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  categoryInputSchema,
  updateCategorySchema,
  type CategoryInput,
  type UpdateCategoryInput,
} from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addCategory(input: CategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category" };
  }
  const db = getDb();
  try {
    await db.insert(categories).values({
      userId: user.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      icon: parsed.data.icon || null,
    });
  } catch {
    return { ok: false, error: "A category with that name already exists" };
  }
  revalidatePath("/settings");
  revalidatePath("/app");
  return { ok: true };
}

export async function updateCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category" };
  }
  const { id, name, icon, color } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (icon !== undefined) patch.icon = icon || null;
  if (color !== undefined) patch.color = color || null;

  const db = getDb();
  try {
    await db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  } catch {
    return { ok: false, error: "A category with that name already exists" };
  }
  revalidatePath("/settings");
  revalidatePath("/app");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid category" };
  }
  const db = getDb();
  // Transactions referencing this category are set to NULL by the FK rule.
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  revalidatePath("/settings");
  revalidatePath("/app");
  return { ok: true };
}
