import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { voidInvoice } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/void — void a sent invoice or quote. It stays, with
 * its number. 409 for a draft (delete it), a paid invoice, or one already void.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    return apiOk(await voidInvoice(user.id, workspace.id, id));
  });
}
