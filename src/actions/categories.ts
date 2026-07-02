"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as cats from "@/services/categories";
import { type CategoryInput, type UpdateCategoryInput } from "@/lib/validation";

function revalidateApp() {
  revalidatePath("/settings");
  revalidatePath("/app");
}

export async function addCategory(input: CategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("addCategory", async () => {
    await cats.createCategory(user.id, input);
    revalidateApp();
    return {};
  });
}

export async function updateCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("updateCategory", async () => {
    await cats.updateCategory(user.id, input.id, input);
    revalidateApp();
    return {};
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction("deleteCategory", async () => {
    await cats.deleteCategory(user.id, id);
    revalidateApp();
    return {};
  });
}
