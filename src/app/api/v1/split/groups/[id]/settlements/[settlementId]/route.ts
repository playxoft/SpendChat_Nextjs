import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { deleteSettlement } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; settlementId: string }> };

/**
 * DELETE /api/v1/split/groups/:id/settlements/:settlementId — undo a payment.
 * Whoever recorded it, or the group's creator (403 otherwise).
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, settlementId } = await ctx.params;
    await deleteSettlement(user.id, id, settlementId);
    return apiOk({ deleted: true });
  });
}
