import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeProfile } from "@/lib/api-serializers";
import { reorderProfiles, listProfiles } from "@/services/profiles";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/profiles/reorder — persist the sidebar order.
 * Body: { "ids": [<profileId>, ...] } (the full ordered list). Returns the
 * reordered profiles.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = (await readJson(request)) as { ids?: string[] };
    await reorderProfiles(user.id, body?.ids ?? []);
    const rows = await listProfiles(user.id);
    return apiOk(rows.map(serializeProfile));
  });
}
