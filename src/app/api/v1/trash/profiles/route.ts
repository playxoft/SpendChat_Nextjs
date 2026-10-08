import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { listTrashProfiles } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/trash/profiles — trashed profiles of the current workspace, for
 * **workspace admins** (anyone else gets an empty list). Restoring one brings
 * back everything in it; counts are the live transactions and files inside.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    return apiOk(await listTrashProfiles(user.id, workspace.id));
  });
}
