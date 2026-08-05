import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson, withId } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteFile, updateFile } from "@/services/files";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/files/:id — rename / re-categorize / re-tag / move a vault
 * file. Any subset of `{ name, category, tagIds, folderId }`; `category: null`
 * clears it, `folderId: null` moves the file to the profile's root. Requires
 * the editor role on the file's profile.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateFile(user.id, workspace.id, withId(body, id));
    return apiOk(updated);
  });
}

/**
 * DELETE /api/v1/files/:id — remove a vault file (metadata row + the stored
 * object). Requires the editor role on the file's profile; an id that isn't
 * reachable in the current workspace is a 404.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteFile(user.id, workspace.id, id);
    if (!deleted) throw notFound("File not found");
    return apiOk({ id, deleted: true });
  });
}
