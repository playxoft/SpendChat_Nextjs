import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import {
  serializeSplitAdded,
  serializeSplitGroup,
  serializeSplitGroupDetail,
} from "@/lib/api-serializers";
import { createGroup, getGroupDetail, listGroups } from "@/services/split";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/split/groups — the split groups the caller has joined, newest
 * first, each with their own balance. Split lives outside workspaces:
 * `X-Workspace-Id` is ignored.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await getApiUser(request);
    const rows = await listGroups(user.id);
    return apiOk(rows.map(serializeSplitGroup));
  });
}

/**
 * POST /api/v1/split/groups — create a group; the caller becomes its creator.
 * Body: { name, icon?, currency, members?: [{ email, name }] } (≤ 49 people).
 * 201 → { group: SplitGroupDetail, added: SplitAddedPerson[] }.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await getApiUser(request);
    const body = await readJson(request);
    const { id, added } = await createGroup(user, body);
    const detail = await getGroupDetail(user.id, id);
    return apiOk({ group: serializeSplitGroupDetail(detail), added: serializeSplitAdded(added) }, 201);
  });
}
