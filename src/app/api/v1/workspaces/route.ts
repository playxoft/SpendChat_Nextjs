import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { ensureBootstrap } from "@/lib/auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeWorkspace } from "@/lib/api-serializers";
import { listUserWorkspaces } from "@/lib/workspaces";
import { createWorkspace } from "@/services/workspaces";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/workspaces — every workspace the caller can open, so the mobile
 * app can build a workspace switcher. Not scoped to one workspace: the
 * `X-Workspace-Id` header is ignored here (this lists all of them, never 404s).
 * Ordering mirrors `listUserWorkspaces`: memberships first (workspace createdAt
 * ascending), then grant-only workspaces. Each carries its currency + number
 * format, so the switcher can format amounts without a follow-up request.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireApiUser(request);
    // Guarantee a default workspace on the first ever call, like getApiContext().
    await ensureBootstrap(user.id);
    const list = await listUserWorkspaces(user.id);
    return apiOk(list.map(serializeWorkspace));
  });
}

/**
 * POST /api/v1/workspaces — create a workspace; the caller becomes its admin.
 * Mirrors the web's "create workspace" flow (service seeds the admin
 * membership + a default "Personal" profile) and makes the new workspace
 * current (persists `lastWorkspaceId`), so the client should pin the returned
 * id as `X-Workspace-Id`. The `X-Workspace-Id` request header is ignored —
 * creation is not scoped to the current workspace.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireApiUser(request);
    const body = await readJson(request);
    // createWorkspace validates { name } (1–60) and runs ensureBootstrap.
    const created = await createWorkspace(user.id, body);
    return apiOk(serializeWorkspace(created), 201);
  });
}
