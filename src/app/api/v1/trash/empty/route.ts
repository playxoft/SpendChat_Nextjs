import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { emptyTrash } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trash/empty — delete everything in the caller's trash for good:
 * every trashed transaction, file and folder they can edit, and (admins) every
 * trashed profile. Bounded per request: returns `{ deleted: { … }, remaining }`
 * — call again while `remaining > 0`. 403 for someone who can't edit anything.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const result = await emptyTrash(user.id, workspace.id);
    return apiOk({ deleted: result.counts, remaining: result.remaining });
  });
}
