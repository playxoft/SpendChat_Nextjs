import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { listTrashVault } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/trash/files — the vault's trash: `{ folders, files }`. A folder
 * carries the subfolders and files that went to the trash with it (restored
 * with it, not listed separately); `files` are those deleted on their own (at
 * most 500, most recent first). Free workspaces have no file trash, so this is
 * empty there unless the workspace was downgraded with files still in it.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    return apiOk(await listTrashVault(user.id, workspace.id));
  });
}
