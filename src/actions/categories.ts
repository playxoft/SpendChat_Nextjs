"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as cats from "@/services/categories";
import { type CategoryInput, type UpdateCategoryInput } from "@/lib/validation";

function revalidateApp() {
  // Transactions join their category by id, so a rename changes what every
  // route that lists one renders — not just the settings page. "/settings" is a
  // layout revalidation to reach the nested category manager at
  // "/settings/categories".
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings", "layout");
}

export async function addCategory(input: CategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "addCategory",
    async () => {
      await cats.createCategory(user.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id },
  );
}

export async function updateCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateCategory",
    async () => {
      await cats.updateCategory(user.id, input.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, categoryId: input.id },
  );
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteCategory",
    async () => {
      await cats.deleteCategory(user.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, categoryId: id },
  );
}
