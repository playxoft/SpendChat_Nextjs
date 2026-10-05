import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSpaceAccess } from "@/lib/api-serializers";
import { getSpaceAccess, setSpaceMember } from "@/services/spaces";
import { spaceInCurrentWorkspace } from "../../scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/spaces/:id/members — put a workspace member in this space,
 * change their role, or take them out. Body: { "userId": "<uuid>", "role":
 * "viewer" | "editor" | null }. Workspace admin only; the target must be a
 * non-admin member of the workspace (400 otherwise — admins already see every
 * space). Taking someone out (`role: null`) also clears their overrides on
 * this space's profiles. Returns the space's access view after the change.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id: rawId } = await ctx.params;
    const id = await spaceInCurrentWorkspace(workspace.id, rawId);
    const body = await readJson(request);
    await setSpaceMember(user.id, id, body);
    return apiOk(serializeSpaceAccess(await getSpaceAccess(user.id, id)));
  });
}
