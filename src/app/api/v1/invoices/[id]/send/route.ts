import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeApiInvoiceShare } from "@/lib/api-serializers";
import { sendInvoiceAsLink } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/send — "send as link": finalise it if it's a
 * draft, then return a public link to send (the newest live one, or a new
 * one) with the invoice.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const { invoice, share } = await sendInvoiceAsLink(user.id, workspace.id, id);
    return apiOk({ invoice, share: serializeApiInvoiceShare(share, request) });
  });
}
