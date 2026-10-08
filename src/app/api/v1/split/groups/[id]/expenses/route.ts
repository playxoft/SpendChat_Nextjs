import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { currencyMeta, parsePagination } from "@/lib/api-query";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSplitExpense } from "@/lib/api-serializers";
import { createExpense, getExpense, listExpenses } from "@/services/split-ledger";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/split/groups/:id/expenses — newest first, with every share and
 * the caller's own share (`myShare`). `?limit=&offset=`;
 * `meta: { total, limit, offset, currency: CurrencyMeta }`.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    const { limit, offset } = parsePagination(new URL(request.url).searchParams);
    const page = await listExpenses(user.id, id, { limit, offset });
    return apiOk(
      page.items.map((e) => serializeSplitExpense(e, page.currency)),
      200,
      { total: page.total, limit, offset, ...currencyMeta(page.currency) },
    );
  });
}

/**
 * POST /api/v1/split/groups/:id/expenses — add an expense (any joined member).
 * Body: { title, amount, paidBy, occurredOn, splitType, … } where `splitType`
 * is `equal` (+ `memberIds`), `exact` (+ `shares: [{memberId, amount}]`, summing
 * to `amount`) or `percent` (+ `shares: [{memberId, percent}]`, summing to 100).
 * The server computes every share. 201 → the expense.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await getApiUser(request);
    const { id } = await ctx.params;
    const created = await createExpense(user.id, id, await readJson(request));
    const { expense, currency } = await getExpense(user.id, id, created.id);
    return apiOk(serializeSplitExpense(expense, currency), 201);
  });
}
