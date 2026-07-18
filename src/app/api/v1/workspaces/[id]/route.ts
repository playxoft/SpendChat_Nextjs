import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeWorkspace } from "@/lib/api-serializers";
import { updateWorkspaceCurrency } from "@/services/workspaces";
import { listUserWorkspaces } from "@/lib/workspaces";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/workspaces/:id — update a workspace's currency + number format.
 * Admin only (the service enforces it). Body: { currency, locale }. Returns the
 * updated workspace (with `currencyDetail`).
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    await updateWorkspaceCurrency(user.id, id, body);
    // Re-read so the response carries the full workspace shape (name, role, …).
    const updated = (await listUserWorkspaces(user.id)).find((w) => w.id === id);
    if (!updated) throw notFound("Workspace not found");
    return apiOk(serializeWorkspace(updated));
  });
}
