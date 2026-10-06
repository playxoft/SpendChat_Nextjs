import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { sendInviteEmail } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

/**
 * POST /api/v1/split/groups/:id/members/:memberId/invite-email — send someone
 * their one invite email, when the daily cap kept it from going at add time
 * (creator only). → `{ emailed }`: false when today's cap is still spent (share
 * the link instead). 409 when they were already emailed (one email per group,
 * ever) or have an account (they see an in-app invitation).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, memberId } = await ctx.params;
    return apiOk(await sendInviteEmail(user.id, id, memberId));
  });
}
