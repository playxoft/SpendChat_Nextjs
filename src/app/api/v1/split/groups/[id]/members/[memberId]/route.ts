import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { removeMember } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

/**
 * DELETE /api/v1/split/groups/:id/members/:memberId — remove someone (creator
 * only). 409 `settle_first` while they still owe or are owed.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id, memberId } = await ctx.params;
    await removeMember(user.id, id, memberId);
    return apiOk({ removed: true });
  });
}
