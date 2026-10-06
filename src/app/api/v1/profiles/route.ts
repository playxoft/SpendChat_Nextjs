import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeProfile } from "@/lib/api-serializers";
import { getEffectiveProfileRole, profileRolesFor } from "@/lib/workspaces";
import { listProfiles, createProfile } from "@/services/profiles";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/profiles — the caller's profiles in sidebar order, each tagged
 * with its `spaceId` and the caller's effective `access` on it.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const [rows, roles] = await Promise.all([
      listProfiles(user.id, workspace.id),
      profileRolesFor(user.id, workspace.id),
    ]);
    return apiOk(rows.map((p) => serializeProfile(p, roles.get(p.id) ?? "viewer")));
  });
}

/**
 * POST /api/v1/profiles — create a profile (appended to the end), in `spaceId`
 * when given, else the workspace's first space.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createProfile(user.id, workspace.id, body);
    // The creator is a workspace admin, but a view-only workspace caps that —
    // read the effective role rather than assume it.
    const access = await getEffectiveProfileRole(user.id, created.id);
    return apiOk(serializeProfile(created, access?.role ?? "admin"), 201);
  });
}
