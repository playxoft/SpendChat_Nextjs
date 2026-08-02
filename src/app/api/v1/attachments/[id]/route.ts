import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { deleteAttachment, updateAttachment } from "@/services/attachments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/attachments/:id — update an attachment's optional metadata.
 * Any subset of `{ label, kind }`; `null` clears a field. Requires the editor
 * role on the transaction's profile.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateAttachment(user.id, workspace.id, id, body);
    return apiOk(updated);
  });
}

/**
 * DELETE /api/v1/attachments/:id — remove an attachment (metadata row + the
 * stored object). Requires the editor role on the transaction's profile; an id
 * that doesn't exist or isn't reachable in the current workspace is a 404.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteAttachment(user.id, workspace.id, id);
    if (!deleted) throw notFound("Attachment not found");
    return apiOk({ id, deleted: true });
  });
}
