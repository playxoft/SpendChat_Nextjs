import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { getProfileDeletionImpact } from "@/services/profiles";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/profiles/:id/deletion-impact — what deleting this profile would
 * take with it: `{ transactions, files }`. Requires admin on the profile, the
 * same role the delete does.
 *
 * Meant for the confirmation step: `transactions` is the count the caller is
 * choosing the fate of (`?transactions=delete|move` on the DELETE), while
 * `files` is the profile's vault, which goes with it either way.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    return apiOk(await getProfileDeletionImpact(user.id, id));
  });
}
