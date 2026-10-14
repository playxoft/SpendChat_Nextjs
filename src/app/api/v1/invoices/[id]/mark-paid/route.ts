import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { markInvoicePaid } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/mark-paid — `{ amount?, paidOn?, categoryId? }`.
 * Writes one income transaction in the invoice's profile, in the workspace's
 * currency (`amount` in major units — required when the invoice is in another
 * currency, else 422 `amount_required`; the total otherwise). Calling it again
 * returns the same transaction (`alreadyPaid: true`).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request).catch(() => ({}));
    const result = await markInvoicePaid(user.id, workspace, id, body ?? {});
    return apiOk(result);
  });
}
