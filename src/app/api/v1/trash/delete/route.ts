import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { deleteFromTrash } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trash/delete — delete a selection from the trash **for good**
 * (rows and stored files; this can't be undone). Same body and access as
 * `/trash/restore`; returns `{ deleted: { … }, skipped }`. Deleting a folder
 * takes everything under it.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const result = await deleteFromTrash(user.id, workspace.id, await readJson(request));
    return apiOk({ deleted: result.counts, skipped: result.skipped });
  });
}
