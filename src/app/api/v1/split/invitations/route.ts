import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/api-query";
import { apiOk, handle } from "@/lib/api-response";
import { serializeSplitInvitation } from "@/lib/api-serializers";
import { listInvitations } from "@/services/split";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/split/invitations — split groups waiting for the caller to join
 * or decline, newest first. `?limit=&offset=` (limit ≤ 100); `meta: { total,
 * limit, offset }`. Includes invitations sent to their email before they had
 * an account. Only the group's name, icon, currency, people count and who
 * invited them — nothing inside the group until they join.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await getApiUser(request);
    const sp = new URL(request.url).searchParams;
    const { limit: rawLimit, offset } = parsePagination(sp);
    const limit = sp.get("limit") ? Math.min(rawLimit, 100) : 20;
    const page = await listInvitations(user, { limit, offset });
    return apiOk(page.items.map(serializeSplitInvitation), 200, { total: page.total, limit, offset });
  });
}
