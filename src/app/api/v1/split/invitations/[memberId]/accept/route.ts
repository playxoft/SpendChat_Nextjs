import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeSplitGroupDetail } from "@/lib/api-serializers";
import { acceptInvitation, getGroupDetail } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ memberId: string }> };

/**
 * POST /api/v1/split/invitations/:memberId/accept — join the group. 404 when
 * the invitation isn't the caller's or is no longer open. → the group.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { memberId } = await ctx.params;
    const { groupId } = await acceptInvitation(user, memberId);
    return apiOk(serializeSplitGroupDetail(await getGroupDetail(user.id, groupId)));
  });
}
