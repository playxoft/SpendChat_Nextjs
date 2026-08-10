import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson, withId } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteFolder, updateFolder } from "@/services/files";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/folders/:id — rename / recolor / re-tag / move a folder. Any
 * subset of `{ name, color, tagIds, parentId }`; `parentId: null` moves it to
 * the root, `color: null` clears the accent. The predefined "Transaction
 * attachments" folder accepts only color + tags (400 otherwise). Moving into
 * the folder's own subtree is rejected. Requires the editor role.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateFolder(user.id, workspace.id, withId(body, id));
    return apiOk(updated);
  });
}

/**
 * DELETE /api/v1/folders/:id — delete a folder, everything inside it
 * (including nested folders and their stored objects), and any share links to
 * it. The predefined folder can't be deleted (400). Requires the editor role;
 * an unreachable id is a 404.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteFolder(user.id, workspace.id, id);
    if (!deleted) throw notFound("Folder not found");
    return apiOk({ id, deleted: true });
  });
}
