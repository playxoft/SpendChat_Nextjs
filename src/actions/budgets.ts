"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { notFound } from "@/lib/errors";
import * as budgetService from "@/services/budgets";
import type { CreateBudgetInput, UpdateBudgetInput } from "@/lib/validation";

/**
 * Server actions for budgets — the web half of `services/budgets.ts` (the REST
 * API is the other). All three write; none is read-only.
 */

function revalidateBudgets() {
  // The budgets page, the analytics card, and the nav badge the layout streams.
  revalidatePath("/app/budgets");
  revalidatePath("/app/analytics");
  revalidatePath("/app", "layout");
}

export async function addBudget(input: CreateBudgetInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addBudget",
    async () => {
      const { id } = await budgetService.createBudget(user.id, workspace.id, input);
      revalidateBudgets();
      return { id };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Change a budget's amount or email alerts. A stale page must not report a change it didn't make. */
export async function updateBudget(id: string, input: UpdateBudgetInput): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateBudget",
    async () => {
      const updated = await budgetService.updateBudget(user.id, workspace.id, id, input);
      if (!updated) throw notFound("Budget not found");
      revalidateBudgets();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, budgetId: id },
  );
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteBudget",
    async () => {
      const deleted = await budgetService.deleteBudget(user.id, workspace.id, id);
      if (!deleted) throw notFound("Budget not found");
      revalidateBudgets();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, budgetId: id },
  );
}
