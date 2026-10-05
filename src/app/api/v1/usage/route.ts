import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeUsage } from "@/lib/api-serializers";
import { getUsage } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/usage — the current workspace's plan, its limits, and how much
 * of each is in use: AI actions this month, storage, members, spaces,
 * categories and tags, plus the per-space profile cap and the feature flags
 * (voice, per-profile access). `readOnly: true` means the workspace is an
 * extra free one past its grace period — render it view-only. Readable by
 * anyone who can open the workspace.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { workspace } = await getApiContext(request);
    return apiOk(serializeUsage(await getUsage(workspace.id)));
  });
}
