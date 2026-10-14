import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { revokeInvoiceShare } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; shareId: string }> };

/** DELETE /api/v1/invoices/:id/shares/:shareId — revoke a link; it stops working at once. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id, shareId } = await ctx.params;
    if (!(await revokeInvoiceShare(user.id, workspace.id, id, shareId))) throw notFound("Link not found");
    return apiOk({ id: shareId, deleted: true });
  });
}
