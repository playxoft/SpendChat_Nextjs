import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { moveProfileTransactions } from "@/services/profiles";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/profiles/:id/move — move every transaction from this profile to
 * another owned profile. Body: { "toProfileId": "<id>" }. Typically used
 * before deleting a non-empty profile.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = (await readJson(request)) as { toProfileId?: string };
    const result = await moveProfileTransactions(user.id, id, body?.toProfileId ?? "");
    return apiOk(result);
  });
}
