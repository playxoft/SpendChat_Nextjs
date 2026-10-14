import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { convertQuote } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/convert — a quote becomes a new **draft** invoice
 * (lines, client, seller, discount, tax and notes carry over; terms don't),
 * dated today and due in 30 days. 201 with the new invoice; it counts toward
 * the month's allowance.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    return apiOk(await convertQuote(user.id, workspace.id, id), 201);
  });
}
