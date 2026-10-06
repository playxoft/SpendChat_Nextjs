import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeOrganization } from "@/lib/api-serializers";
import { getMyOrganization, renameMyOrganization } from "@/services/organizations";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/organization — the caller's personal organisation: its name,
 * owner and every workspace in it with its plan (and whether it's view-only).
 * Not scoped to one workspace: `X-Workspace-Id` is ignored. Every account has
 * exactly one personal organisation, created at first sign-in.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireApiUser(request);
    return apiOk(serializeOrganization(await getMyOrganization(user.id)));
  });
}

/**
 * PATCH /api/v1/organization — rename the caller's personal organisation.
 * Body: { "name": string } (1–40, trimmed). Returns the organisation.
 */
export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const user = await requireApiUser(request);
    const body = await readJson(request);
    await renameMyOrganization(user.id, body);
    return apiOk(serializeOrganization(await getMyOrganization(user.id)));
  });
}
