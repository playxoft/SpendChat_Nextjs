import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { deleteAllTransactions } from "@/services/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/transactions/delete-all — danger zone. **Workspace admins only.**
 * Wipes every transaction (regardless of author) in the selected profiles of the
 * current workspace. Body: { "confirm": "DELETE", "profileIds"?: string[] } —
 * `confirm` must be the exact string; `profileIds` omitted/empty clears every
 * profile in the workspace. A non-admin caller gets 403.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = (await readJson(request)) as { confirm?: string; profileIds?: string[] };
    const result = await deleteAllTransactions(
      user.id,
      workspace.id,
      body?.confirm ?? "",
      Array.isArray(body?.profileIds) ? body.profileIds : [],
    );
    return apiOk(result);
  });
}
