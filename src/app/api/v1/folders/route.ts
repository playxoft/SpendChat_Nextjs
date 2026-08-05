import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { createFolder } from "@/services/files";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/folders — create a vault folder (editor only). Body
 * `{ profileId, name, parentId?, color?, tagIds? }`. Folders never span
 * profiles, sibling names are unique case-insensitively (409), and the
 * predefined "Transaction attachments" folder can't be a parent. The folder
 * list itself ships with `GET /files`.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createFolder(user.id, workspace.id, body);
    return apiOk(created, 201);
  });
}
