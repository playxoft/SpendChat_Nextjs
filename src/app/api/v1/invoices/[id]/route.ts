import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteInvoice, getInvoice, updateInvoice } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/invoices/:id — one invoice or quote, lines included. 404 when the caller can't read it. */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const invoice = await getInvoice(user.id, workspace.id, id);
    if (!invoice) throw notFound("Invoice not found");
    return apiOk(invoice);
  });
}

/**
 * PATCH /api/v1/invoices/:id — replace a **draft**'s content (send the whole
 * document). 409 once it's finalised.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    return apiOk(await updateInvoice(user.id, workspace.id, id, await readJson(request)));
  });
}

/**
 * DELETE /api/v1/invoices/:id — delete a **draft**. A finalised invoice or
 * quote is never deleted: 409 (void it instead).
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    if (!(await deleteInvoice(user.id, workspace.id, id))) throw notFound("Invoice not found");
    return apiOk({ id, deleted: true });
  });
}
