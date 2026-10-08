import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSplitGroupDetail } from "@/lib/api-serializers";
import { deleteGroup, getGroupDetail, updateGroup } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/split/groups/:id — the group, its people (emails only for the
 * creator and on your own row), balances and settle-up suggestions. 404 for
 * anyone who isn't a joined member — invitees included.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    return apiOk(serializeSplitGroupDetail(await getGroupDetail(user.id, id)));
  });
}

/**
 * PATCH /api/v1/split/groups/:id — { name?, icon?, currency? } (creator only).
 * The currency can change only while the group has no expenses or payments
 * (409 otherwise). Returns the updated group.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    await updateGroup(user.id, id, await readJson(request));
    return apiOk(serializeSplitGroupDetail(await getGroupDetail(user.id, id)));
  });
}

/** DELETE /api/v1/split/groups/:id — delete the group and everything in it (creator only). */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    await deleteGroup(user.id, id);
    return apiOk({ deleted: true });
  });
}
