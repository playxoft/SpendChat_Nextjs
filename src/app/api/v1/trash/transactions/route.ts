import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, parseOrThrow } from "@/lib/api-response";
import { serializeTrashedTransaction } from "@/lib/api-serializers";
import { currencyMeta } from "@/lib/api-query";
import { encodeTrashCursor } from "@/lib/trash";
import { trashCursorSchema } from "@/lib/validation";
import { listTrashTransactions } from "@/services/trash";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/trash/transactions — the caller's trashed transactions in the
 * current workspace (profiles they can view), most recently deleted first.
 * Keyset-paged: `limit` (1–200, default 50) and `cursor` (the previous page's
 * `meta.nextCursor`; absent on the last page). A trashed *profile*'s rows are
 * not listed here — the profile is one item of its own (`/trash/profiles`).
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const sp = new URL(request.url).searchParams;
    const cursor = sp.get("cursor");
    const before = cursor ? parseOrThrow(trashCursorSchema, cursor) : undefined;
    const limitParam = Number(sp.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 50;
    const page = await listTrashTransactions(user.id, workspace.id, { limit, before });
    return apiOk(
      page.rows.map((r) => serializeTrashedTransaction(r, workspace.currency)),
      200,
      {
        nextCursor: page.nextCursor ? encodeTrashCursor(page.nextCursor) : null,
        ...currencyMeta(workspace.currency),
      },
    );
  });
}
