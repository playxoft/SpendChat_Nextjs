import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { serializeProfile } from "@/lib/api-serializers";
import { updateProfile, deleteProfile } from "@/services/profiles";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/profiles/:id — partial update (name, icon, color). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateProfile(user.id, id, body);
    if (!updated) throw notFound("Profile not found");
    return apiOk(serializeProfile(updated));
  });
}

/**
 * DELETE /api/v1/profiles/:id — refused (409) for the last profile or one that
 * still has transactions (move them first).
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteProfile(user.id, id);
    if (!deleted) throw notFound("Profile not found");
    return apiOk({ id, deleted: true });
  });
}
