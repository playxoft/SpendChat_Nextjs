import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson, withId } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteTag, updateTag } from "@/services/files";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/file-tags/:id — rename / recolor a tag (editor only). Any
 * subset of `{ name, color }`. Every file and folder referencing the tag
 * reflects the change at once.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateTag(user.id, workspace.id, withId(body, id));
    return apiOk(updated);
  });
}

/**
 * DELETE /api/v1/file-tags/:id — delete a tag and detach it from every file
 * and folder of its profile (editor only). An unreachable id is a 404.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteTag(user.id, workspace.id, id);
    if (!deleted) throw notFound("Tag not found");
    return apiOk({ id, deleted: true });
  });
}
