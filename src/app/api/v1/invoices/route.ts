import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { parsePagination } from "@/lib/api-query";
import { createInvoice, listInvoices } from "@/services/invoices";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/invoices?kind=&status=&profileId=&clientId=&limit=&offset= — the
 * invoices and quotes the caller can read in the current workspace, newest
 * first, without their lines (`limit` ≤ 200). Amounts are minor units of each
 * document's own `currency`.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const sp = new URL(request.url).searchParams;
    const filters = {
      kind: sp.get("kind") ?? undefined,
      status: sp.get("status") ?? undefined,
      profileId: sp.get("profileId") ?? undefined,
      clientId: sp.get("clientId") ?? undefined,
    };
    const { limit, offset } = parsePagination(sp);
    const rows = await listInvoices(user.id, workspace.id, filters, { limit: Math.min(limit, 200), offset });
    return apiOk(rows, 200, { limit: Math.min(limit, 200), offset });
  });
}

/**
 * POST /api/v1/invoices — a new **draft** invoice or quote (`kind`) in a
 * profile the caller can edit. The server works out every line amount and
 * total. 403 `plan_limit` (`limit: "invoices"`) past the month's allowance.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const created = await createInvoice(user.id, workspace.id, await readJson(request));
    return apiOk(created, 201);
  });
}
