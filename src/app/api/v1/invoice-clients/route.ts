import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { createClient, listClients } from "@/services/invoices";

export const dynamic = "force-dynamic";

/** GET /api/v1/invoice-clients?profileId= — saved clients the caller can read, by name. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const profileId = new URL(request.url).searchParams.get("profileId");
    return apiOk(await listClients(user.id, workspace.id, profileId));
  });
}

/**
 * POST /api/v1/invoice-clients — `{ profileId, name, email?, address?, taxId? }`.
 * 403 `plan_limit` (`limit: "invoiceClients"`) past the tier's saved clients.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    return apiOk(await createClient(user.id, workspace.id, await readJson(request)), 201);
  });
}
