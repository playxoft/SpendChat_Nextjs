import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteSeller, getSeller, updateSeller } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const seller = await getSeller(user.id, workspace.id, id);
    if (!seller) throw notFound("Business details not found");
    return apiOk(seller);
  });
}

/** PATCH /api/v1/invoice-sellers/:id — any of `name`, `address`, `contact`, `taxId`, `upiId`. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const seller = await updateSeller(user.id, workspace.id, id, await readJson(request));
    if (!seller) throw notFound("Business details not found");
    return apiOk(seller);
  });
}

/** DELETE /api/v1/invoice-sellers/:id — and its logo. Documents keep their copy of the text. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    if (!(await deleteSeller(user.id, workspace.id, id))) throw notFound("Business details not found");
    return apiOk({ id, deleted: true });
  });
}
