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
    // The update requires admin on the profile, so that is the caller's access.
    return apiOk(serializeProfile(updated, "admin"));
  });
}

/**
 * DELETE /api/v1/profiles/:id — moves the profile to the trash, as one unit,
 * restorable for 30 days by a workspace admin (`POST /trash/restore`). Always
 * refused (409) for the workspace's last live profile.
 *
 * `?transactions=` says what to do with the transactions filed under it:
 *   delete            — they go to the trash with the profile
 *   move&to=<id>      — re-file them (and the vault) under another profile
 *                       first; the empty profile then goes to the trash
 *   omitted / reject  — refuse with 409 while any live ones remain (the old
 *                       behaviour, kept as the default so a client that says
 *                       nothing can't lose rows it didn't ask about)
 *
 * The vault goes to the trash with the profile on Plus/Pro; on Free it is
 * deleted for good (`GET /profiles/:id/deletion-impact` says which, as
 * `filesRecoverable`, with the counts).
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
    // The profile goes to the trash as one unit (restorable for 30 days by a
    // workspace admin); on Free its vault files are deleted for good.
    return apiOk({ id, deleted: true, trashed: true });
  });
}
