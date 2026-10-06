import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/api-query";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSplitSettlement } from "@/lib/api-serializers";
import { getSettlement, listSettlements, recordSettlement } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/split/groups/:id/settlements — recorded payments, newest first.
 * `?limit=&offset=`; `meta: { total, limit, offset, currency }`.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    const { limit, offset } = parsePagination(new URL(request.url).searchParams);
    const page = await listSettlements(user.id, id, { limit, offset });
    return apiOk(
      page.items.map((s) => serializeSplitSettlement(s, page.currency)),
      200,
      { total: page.total, limit, offset, currency: page.currency },
    );
  });
}

/**
 * POST /api/v1/split/groups/:id/settlements — "Mark as paid": { fromMemberId,
 * toMemberId, amount, settledOn }. The creator can record any payment; a member
 * only one they made or received (403). 201 → the payment.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    const { id: settlementId } = await recordSettlement(user.id, id, await readJson(request));
    const { settlement, currency } = await getSettlement(user.id, id, settlementId);
    return apiOk(serializeSplitSettlement(settlement, currency), 201);
  });
}
