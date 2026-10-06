import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { currencyMeta } from "@/lib/api-query";
import { serializeApiBudget } from "@/lib/api-serializers";
import { createBudget, getBudget, listBudgets } from "@/services/budgets";
import { budgetMonthFrom } from "./month";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/budgets?month=YYYY-MM — the budgets the caller can see in the
 * current workspace, each with that month's spending (expenses only, minor
 * units). `month` defaults to the current UTC month; `meta` carries it and the
 * currency.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const month = budgetMonthFrom(new URL(request.url));
    const rows = await listBudgets(user.id, workspace.id, month);
    return apiOk(rows.map(serializeApiBudget), 200, { month, ...currencyMeta(workspace.currency) });
  });
}

/**
 * POST /api/v1/budgets — add a monthly budget for the whole workspace, a
 * profile or an expense category. Needs edit access to every profile it
 * covers; 403 `plan_limit` (`limit: "budgets"`) past the plan's cap, 409 when
 * that scope already has one.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const month = budgetMonthFrom(new URL(request.url));
    const body = await readJson(request);
    const { id } = await createBudget(user.id, workspace.id, body);
    const created = await getBudget(user.id, workspace.id, id, month);
    return apiOk(created ? serializeApiBudget(created) : { id }, 201, {
      month,
      ...currencyMeta(workspace.currency),
    });
  });
}
