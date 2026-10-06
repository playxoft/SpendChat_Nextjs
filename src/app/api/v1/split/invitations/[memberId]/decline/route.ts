import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { declineInvitation } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ memberId: string }> };

/** POST /api/v1/split/invitations/:memberId/decline — say no. Always allowed. */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { memberId } = await ctx.params;
    await declineInvitation(user, memberId);
    return apiOk({ declined: true });
  });
}
