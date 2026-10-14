import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeApiInvoiceShare } from "@/lib/api-serializers";
import { createInvoiceShare, listInvoiceShares } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/invoices/:id/shares — the document's live public links (editors only). */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const shares = await listInvoiceShares(user.id, workspace.id, id);
    return apiOk(shares.map((s) => serializeApiInvoiceShare(s, request)));
  });
}

/**
 * POST /api/v1/invoices/:id/shares — `{ expiresInDays? }` (1–365; omitted never
 * expires). A public link to a finalised document; 409 for a draft.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request).catch(() => ({}));
    const share = await createInvoiceShare(user.id, workspace.id, id, body ?? {});
    return apiOk(serializeApiInvoiceShare(share, request), 201);
  });
}
