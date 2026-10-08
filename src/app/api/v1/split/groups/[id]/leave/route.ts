import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { leaveGroup } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/split/groups/:id/leave — leave a group. Not for its creator
 * (400 — delete it instead); 409 `settle_first` while you still have a balance.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    await leaveGroup(user.id, id);
    return apiOk({ left: true });
  });
}
