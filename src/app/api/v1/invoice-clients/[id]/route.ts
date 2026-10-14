import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteClient, getClient, updateClient } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const client = await getClient(user.id, workspace.id, id);
    if (!client) throw notFound("Client not found");
    return apiOk(client);
  });
}

/** PATCH /api/v1/invoice-clients/:id — any of `name`, `email`, `address`, `taxId` (null clears). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const client = await updateClient(user.id, workspace.id, id, await readJson(request));
    if (!client) throw notFound("Client not found");
    return apiOk(client);
  });
}

/** DELETE /api/v1/invoice-clients/:id — documents already written keep their copy of the details. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    if (!(await deleteClient(user.id, workspace.id, id))) throw notFound("Client not found");
    return apiOk({ id, deleted: true });
  });
}
