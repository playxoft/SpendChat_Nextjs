import type { NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeProfile } from "@/lib/api-serializers";
import { notFound, validationError } from "@/lib/errors";
import { getEffectiveProfileRole } from "@/lib/workspaces";
import { listProfiles } from "@/services/profiles";
import { moveProfileToSpace } from "@/services/spaces";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/profiles/:id/space — move the profile into another space of
 * its workspace. Body: { "spaceId": "<uuid>" }. Workspace admin only. Who can
 * see the profile follows the new space's members (plus anyone with an
 * override on the profile itself). Returns the profile with its new `spaceId`.
 *
 * Moving into a full space is a 403 `plan_limit` (`profilesPerSpace`); moving
 * into the space it's already in is a no-op.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw validationError("Invalid profile");
    const body = await readJson(request);
    await moveProfileToSpace(user.id, id, body);

    const access = await getEffectiveProfileRole(user.id, id);
    if (!access) throw notFound("Profile not found");
    const profile = (await listProfiles(user.id, access.workspaceId)).find((p) => p.id === id);
    if (!profile) throw notFound("Profile not found");
    return apiOk(serializeProfile(profile, access.role));
  });
}
