import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSpace } from "@/lib/api-serializers";
import { createSpace, listSpaces } from "@/services/spaces";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/spaces — the spaces of the current workspace the caller can
 * see, in sidebar order (`position`). Admins see every space; anyone else
 * sees the spaces they're a member of plus any space holding a profile they
 * reach another way (an override or a per-profile grant).
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const rows = await listSpaces(user.id, workspace.id);
    return apiOk(rows.map(serializeSpace));
  });
}

/**
 * POST /api/v1/spaces — create a space at the end of the list. Body:
 * { name, icon? }. Workspace admin only. 403 `plan_limit` (`spaces`) when the
 * plan's space cap is reached; 409 for a duplicate name.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createSpace(user.id, workspace.id, body);
    return apiOk(serializeSpace(created), 201);
  });
}
