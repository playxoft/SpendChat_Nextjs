import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeSpaceAccess } from "@/lib/api-serializers";
import { getSpaceAccess } from "@/services/spaces";
import { spaceInCurrentWorkspace } from "../../scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/spaces/:id/access — everything a "Members & access" screen
 * shows for one space: the workspace's members (with their space role), the
 * space's profiles, the per-profile overrides on them, and whether the plan
 * lets overrides be changed (`canEditOverrides`). Workspace admin only.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id: rawId } = await ctx.params;
    const id = await spaceInCurrentWorkspace(workspace.id, rawId);
    return apiOk(serializeSpaceAccess(await getSpaceAccess(user.id, id)));
  });
}
