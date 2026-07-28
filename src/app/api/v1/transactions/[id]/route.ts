import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { serializeTransaction } from "@/lib/api-serializers";
import { getTransactionById } from "@/lib/queries";
import { updateTransaction, deleteTransaction } from "@/services/transactions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/transactions/:id */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const row = await getTransactionById(user.id, workspace.id, id);
    if (!row) throw notFound("Transaction not found");
    return apiOk(serializeTransaction(row, workspace.currency));
  });
}

/**
 * PATCH /api/v1/transactions/:id — replace the mutable fields. The full
 * transaction body is required (type, amount, occurredOn, and optional
 * category/profile/title/description), mirroring the web editor.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateTransaction(user.id, workspace.id, id, body);
    if (!updated) throw notFound("Transaction not found");
    return apiOk(serializeTransaction(updated, workspace.currency));
  });
}

/** DELETE /api/v1/transactions/:id */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteTransaction(user.id, workspace.id, id);
    if (!deleted) throw notFound("Transaction not found");
    return apiOk({ id, deleted: true });
  });
}
