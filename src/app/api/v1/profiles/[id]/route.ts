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
 * DELETE /api/v1/profiles/:id — always refused (409) for the workspace's last
 * profile.
 *
 * `?transactions=` says what to do with the transactions filed under it:
 *   delete            — remove them (and their attachments) too
 *   move&to=<id>      — re-file them under another profile first
 *   omitted / reject  — refuse with 409 while any remain (the old behaviour,
 *                       kept as the default so a client that says nothing can't
 *                       destroy rows it didn't ask about)
 *
 * Either way the profile's vault files go with it — that has always been the
 * cascade, and `GET /profiles/:id/deletion-impact` reports the counts first.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const params = new URL(request.url).searchParams;
    // `|| undefined`, not `??`: a client that builds the URL from empty state
    // sends `?transactions=` / `&to=`, and an empty string is "not given", not
    // a value to fail the enum and the uuid check on. Both params are optional
    // in the spec, so present-but-blank must behave exactly like absent.
    const deleted = await deleteProfile(user.id, id, {
      transactions: params.get("transactions") || undefined,
      toProfileId: params.get("to") || undefined,
    });
    if (!deleted) throw notFound("Profile not found");
    return apiOk({ id, deleted: true });
  });
}
