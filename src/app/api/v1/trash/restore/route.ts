import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { restoreFromTrash } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trash/restore — body `{ transactionIds?, fileIds?, folderIds?,
 * profileIds? }` (each ≤ 500, at least one id). Restores what the caller can
 * (editor on the item's profile; admins for profiles) and returns
 * `{ restored: { transactions, files, folders, profiles }, skipped }` — ids it
 * couldn't act on are skipped, not an error. A profile whose restore would
 * break a plan limit is refused with 403 `plan_limit` before anything else in
 * the request is restored.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const result = await restoreFromTrash(user.id, workspace.id, await readJson(request));
    return apiOk({ restored: result.counts, skipped: result.skipped });
  });
}
