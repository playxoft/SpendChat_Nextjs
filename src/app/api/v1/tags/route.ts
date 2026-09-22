import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeApiTag } from "@/lib/api-serializers";
import { listTxnTags, createTxnTag } from "@/services/tags";

export const dynamic = "force-dynamic";

/** GET /api/v1/tags — the current workspace's transaction tags, by name. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { workspace } = await getApiContext(request);
    const rows = await listTxnTags(workspace.id);
    return apiOk(rows.map(serializeApiTag));
  });
}

/** POST /api/v1/tags — create a tag in the current workspace (editor+). */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createTxnTag(user.id, workspace.id, body);
    return apiOk(serializeApiTag(created), 201);
  });
}
