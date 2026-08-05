import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { parseActiveProfile } from "@/lib/filters";
import { listVaultTags } from "@/lib/queries";
import { createTag } from "@/services/files";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/file-tags — the vault tags of the accessible profiles in the
 * current workspace (`?profile=<uuid>` scopes to one), name-ascending. Tags
 * are per-profile entities; files and folders reference them by id, so only a
 * created tag can be applied.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const profileId = parseActiveProfile(new URL(request.url).searchParams.get("profile"));
    const tags = await listVaultTags(user.id, workspace.id, profileId);
    return apiOk(tags);
  });
}

/**
 * POST /api/v1/file-tags — create a tag (editor only). Body
 * `{ profileId, name, color }` — color is a `#rrggbb` hex. Names are unique
 * per profile case-insensitively (409).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createTag(user.id, workspace.id, body);
    return apiOk(created, 201);
  });
}
