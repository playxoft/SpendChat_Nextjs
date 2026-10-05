import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSpace } from "@/lib/api-serializers";
import { listSpaces, reorderSpaces } from "@/services/spaces";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/spaces/reorder — persist the order of the current workspace's
 * spaces. Body: { "ids": [<spaceId>, ...] } (no duplicates; every id must be
 * a space of this workspace → 400 otherwise). Workspace admin only. Returns
 * the spaces in their new order.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    await reorderSpaces(user.id, workspace.id, body);
    const rows = await listSpaces(user.id, workspace.id);
    return apiOk(rows.map(serializeSpace));
  });
}
