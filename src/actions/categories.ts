"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as cats from "@/services/categories";
import { serializeCategory, type ApiCategory } from "@/lib/api-serializers";
import { type CategoryInput, type UpdateCategoryInput } from "@/lib/validation";

function revalidateApp() {
  // Transactions join their category by id, so a rename changes what every
  // route that lists one renders — not just the settings page. "/app/settings" is a
  // layout revalidation to reach the nested category manager at
  // "/app/settings/categories".
  revalidatePath("/app");
  revalidatePath("/app/transactions");
  revalidatePath("/app/analytics");
  revalidatePath("/app/settings", "layout");
}

/**
 * Create a category and hand the row back.
 *
 * Returns the created category rather than `{}` because the "/" picker offers
 * to create one from what you typed and then has to *apply* it to the
 * transaction being written. Without the id it would have to re-fetch the list
 * and match on name — a round-trip, and a guess if two people create the same
 * name at once. `addTag` returns its row for the same reason.
 */
export async function addCategory(
  input: CategoryInput,
): Promise<ActionResult<{ category: ApiCategory }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addCategory",
    async () => {
      const row = await cats.createCategory(user.id, workspace.id, input);
      revalidateApp();
      return { category: serializeCategory(row) };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function updateCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateCategory",
    async () => {
      await cats.updateCategory(user.id, workspace.id, input.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, categoryId: input.id },
  );
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteCategory",
    async () => {
      await cats.deleteCategory(user.id, workspace.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, categoryId: id },
  );
}
