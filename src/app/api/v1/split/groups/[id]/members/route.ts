import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSplitAdded, serializeSplitGroupDetail } from "@/lib/api-serializers";
import { addMembers, getGroupDetail } from "@/services/split";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/split/groups/:id/members — add people by email (creator only).
 * Body: { members: [{ email, name }] }. Someone with an account gets an in-app
 * invitation (no email); someone without one gets a join link. 409
 * `split_group_full` past 50 people (creator included).
 * → { group: SplitGroupDetail, added: SplitAddedPerson[] }.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    const { added } = await addMembers(user.id, id, await readJson(request));
    const detail = await getGroupDetail(user.id, id);
    return apiOk({ group: serializeSplitGroupDetail(detail), added: serializeSplitAdded(added) });
  });
}
