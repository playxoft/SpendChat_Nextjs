import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { currencyMeta } from "@/lib/api-query";
import { serializeApiBudget } from "@/lib/api-serializers";
import { notFound } from "@/lib/errors";
import { deleteBudget, getBudget, updateBudget } from "@/services/budgets";
import { budgetMonthFrom } from "../month";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/budgets/:id — change the amount and/or `emailAlerts`. What a
 * budget covers is fixed. 404 when the caller can't see it.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const month = budgetMonthFrom(new URL(request.url));
    const body = await readJson(request);
    if (!(await updateBudget(user.id, workspace.id, id, body))) throw notFound("Budget not found");
    const updated = await getBudget(user.id, workspace.id, id, month);
    if (!updated) throw notFound("Budget not found");
    return apiOk(serializeApiBudget(updated), 200, { month, ...currencyMeta(workspace.currency) });
  });
}

/** DELETE /api/v1/budgets/:id — delete the budget (its alert history goes with it). */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    if (!(await deleteBudget(user.id, workspace.id, id))) throw notFound("Budget not found");
    return apiOk({ id, deleted: true });
  });
}
