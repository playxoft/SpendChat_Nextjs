import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { serializeApiTag } from "@/lib/api-serializers";
import { updateTxnTag, deleteTxnTag } from "@/services/tags";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/tags/:id — rename or recolor (editor+). The change shows on
 *  every transaction carrying the tag, since they reference it by id. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateTxnTag(user.id, workspace.id, id, body);
    if (!updated) throw notFound("Tag not found");
    return apiOk(serializeApiTag(updated));
  });
}

/** DELETE /api/v1/tags/:id — deletes the tag and detaches it from every
 *  transaction in the workspace, in one database transaction (editor+). */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteTxnTag(user.id, workspace.id, id);
    if (!deleted) throw notFound("Tag not found");
    return apiOk({ id, deleted: true });
  });
}
