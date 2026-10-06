import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeSplitInvitation } from "@/lib/api-serializers";
import { listInvitations } from "@/services/split";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/split/invitations — split groups waiting for the caller to join
 * or decline. Includes invitations sent to their email before they had an
 * account. Only the group's name, icon, currency, people count and who
 * invited them — nothing inside the group until they join.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await getApiUser(request);
    const rows = await listInvitations(user);
    return apiOk(rows.map(serializeSplitInvitation));
  });
}
