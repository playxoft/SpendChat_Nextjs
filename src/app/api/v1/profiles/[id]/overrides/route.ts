import type { NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeProfileOverride } from "@/lib/api-serializers";
import { validationError } from "@/lib/errors";
import { listProfileOverrides, setProfileOverride } from "@/services/spaces";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function profileId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw validationError("Invalid profile");
  return id;
}

/**
 * GET /api/v1/profiles/:id/overrides — the per-profile access overrides on
 * this profile: `[{ userId, access: "none" | "read" | "write" }]`, oldest
 * first. Workspace admin only. Only non-admin workspace members' overrides
 * are listed (admins see everything, so an override means nothing for them).
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const id = await profileId(ctx);
    const rows = await listProfileOverrides(user.id, id);
    return apiOk(rows.map(serializeProfileOverride));
  });
}

/**
 * PUT /api/v1/profiles/:id/overrides — set one member's override on this
 * profile, or clear it. Body: { "userId": "<uuid>", "access": "none" | "read"
 * | "write" | null }. An override replaces the member's space role on this
 * one profile in either direction (`none` hides it inside their space;
 * `read`/`write` open it in a space they're not in). Workspace admin only;
 * the target must be a non-admin member (400 otherwise).
 *
 * Changing overrides is a Plus/Pro feature: on Free this is a 403
 * `plan_limit` with `limit: "profileLevelAccess"` (existing overrides keep
 * applying). Returns the profile's overrides after the change.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const id = await profileId(ctx);
    const body = await readJson(request);
    await setProfileOverride(user.id, id, body);
    const rows = await listProfileOverrides(user.id, id);
    return apiOk(rows.map(serializeProfileOverride));
  });
}
