import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeTransaction } from "@/lib/api-serializers";
import { notFound } from "@/lib/errors";
import { getTransactionById } from "@/lib/queries";
import { getWorkspaceMoneyFormat } from "@/lib/workspaces";
import { updateWorkspaceEntry } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

/**
 * PUT /api/v1/split/groups/:id/expenses/:expenseId/workspace-entry — "Update
 * my entry": the expense changed after you added your share
 * (`myShare.changedSinceAdded`), so set the linked workspace transaction's
 * amount to the new share. Works in whichever workspace the entry lives in
 * (`X-Workspace-Id` is ignored); only the amount changes. Body: `{ amount? }`
 * — in that workspace's currency, required only when it differs from the
 * group's (422 `amount_required`). 409 when the share isn't in a workspace any
 * more (add it again instead). → the updated Transaction.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, expenseId } = await ctx.params;
    const { transactionId, workspaceId } = await updateWorkspaceEntry(
      user.id,
      id,
      expenseId,
      await readJson(request),
    );
    const [row, money] = await Promise.all([
      getTransactionById(user.id, workspaceId, transactionId),
      getWorkspaceMoneyFormat(workspaceId),
    ]);
    if (!row) throw notFound("Transaction not found");
    return apiOk(serializeTransaction(row, money.currency));
  });
}
