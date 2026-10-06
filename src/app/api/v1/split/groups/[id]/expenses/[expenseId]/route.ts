import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSplitExpense } from "@/lib/api-serializers";
import { deleteExpense, getExpense, updateExpense } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

/** GET /api/v1/split/groups/:id/expenses/:expenseId — one expense with its shares. */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, expenseId } = await ctx.params;
    const { expense, currency } = await getExpense(user.id, id, expenseId);
    return apiOk(serializeSplitExpense(expense, currency));
  });
}

/**
 * PUT /api/v1/split/groups/:id/expenses/:expenseId — replace an expense (same
 * body as POST). Only whoever added it, or the group's creator (403 otherwise).
 * A share already added to someone's workspace keeps that marker.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, expenseId } = await ctx.params;
    await updateExpense(user.id, id, expenseId, await readJson(request));
    const { expense, currency } = await getExpense(user.id, id, expenseId);
    return apiOk(serializeSplitExpense(expense, currency));
  });
}

/** DELETE /api/v1/split/groups/:id/expenses/:expenseId — same rights as PUT. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, expenseId } = await ctx.params;
    await deleteExpense(user.id, id, expenseId);
    return apiOk({ deleted: true });
  });
}
