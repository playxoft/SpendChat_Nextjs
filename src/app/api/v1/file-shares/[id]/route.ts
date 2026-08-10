import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { revokeFileShare } from "@/services/files";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/file-shares/:id — revoke a share link (editor only). The
 * token stops working immediately. An unreachable id is a 404.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const revoked = await revokeFileShare(user.id, workspace.id, id);
    if (!revoked) throw notFound("Share link not found");
    return apiOk({ id, deleted: true });
  });
}
