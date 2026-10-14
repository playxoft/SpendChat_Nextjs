import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { finaliseInvoice } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/finalise — give a draft the next number in the
 * workspace's series (`INV-0001`, quotes `QUO-0001`), lock it and store its
 * PDF. 409 when it's already finalised; 413 `storage_quota_exceeded` when the
 * workspace's storage is full.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    return apiOk(await finaliseInvoice(user.id, workspace.id, id));
  });
}
