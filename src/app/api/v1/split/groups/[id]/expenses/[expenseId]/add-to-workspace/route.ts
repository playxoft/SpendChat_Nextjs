import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeTransaction } from "@/lib/api-serializers";
import { notFound } from "@/lib/errors";
import { getTransactionById } from "@/lib/queries";
import { addShareToWorkspace } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

/**
 * POST /api/v1/split/groups/:id/expenses/:expenseId/add-to-workspace — put your
 * share of this expense into the **current workspace** (`X-Workspace-Id` — the
 * one Split endpoint that reads it) as one expense transaction.
 * Body: { profileId, categoryId?, title?, occurredOn?, amount? }. `amount` is
 * in the workspace's currency and required only when it differs from the
 * group's (422 `amount_required`); otherwise the share is the amount.
 * 201 → the Transaction. 409 when this share is already in a workspace; 403
 * for a profile you can't write to (or a view-only workspace, `plan_limit`).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id, expenseId } = await ctx.params;
    const { transactionId } = await addShareToWorkspace(
      user.id,
      { id: workspace.id, currency: workspace.currency, locale: workspace.locale },
      id,
      expenseId,
      await readJson(request),
    );
    const row = await getTransactionById(user.id, workspace.id, transactionId);
    if (!row) throw notFound("Transaction not found");
    return apiOk(serializeTransaction(row, workspace.currency), 201);
  });
}
