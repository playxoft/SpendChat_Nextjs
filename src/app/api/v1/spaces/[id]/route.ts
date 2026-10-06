import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSpace } from "@/lib/api-serializers";
import { badRequest, notFound } from "@/lib/errors";
import { deleteSpace, listSpaces, updateSpace } from "@/services/spaces";
import { spaceInCurrentWorkspace } from "../scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/spaces/:id — rename / re-icon a space. Body: { name?, icon? }
 * (at least one; `icon: ""` or `null` clears it). Workspace admin only.
 * Returns the updated space.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id: rawId } = await ctx.params;
    const id = await spaceInCurrentWorkspace(workspace.id, rawId);
    const body = await readJson(request);
    await updateSpace(user.id, id, body);
    const updated = (await listSpaces(user.id, workspace.id)).find((s) => s.id === id);
    if (!updated) throw notFound("Space not found");
    return apiOk(serializeSpace(updated));
  });
}

/**
 * The body of a DELETE is optional: none at all (or an empty one) means "no
 * body", anything else must be JSON.
 */
async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

/**
 * DELETE /api/v1/spaces/:id — delete a space. Workspace admin only.
 *
 * Profiles are never deleted with a space. An empty space just goes; one that
 * still holds profiles needs a destination — another space of this workspace
 * with room under the plan's per-space cap — as `?moveProfilesTo=<uuid>` or a
 * JSON body `{ "moveProfilesTo": "<uuid>" }` (the body wins when both are
 * sent). Without one: 409. The move and the delete commit together. The last
 * space can't be deleted (409). A blank `?moveProfilesTo=` counts as absent,
 * like the blank params on `DELETE /profiles/{id}`.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id: rawId } = await ctx.params;
    const id = await spaceInCurrentWorkspace(workspace.id, rawId);
    const fromQuery = new URL(request.url).searchParams.get("moveProfilesTo") || undefined;
    const body = await readOptionalJson(request);
    const input =
      body === undefined
        ? { moveProfilesTo: fromQuery }
        : body && typeof body === "object" && !Array.isArray(body)
          ? { moveProfilesTo: fromQuery, ...(body as Record<string, unknown>) }
          : body; // not an object — let validation reject it
    await deleteSpace(user.id, id, input);
    return apiOk({ id, deleted: true });
  });
}
