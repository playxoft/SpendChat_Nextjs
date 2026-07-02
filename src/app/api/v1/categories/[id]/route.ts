import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { notFound } from "@/lib/errors";
import { serializeCategory } from "@/lib/api-serializers";
import { updateCategory, deleteCategory } from "@/services/categories";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/categories/:id — partial update (name, icon, color). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    const updated = await updateCategory(user.id, id, body);
    if (!updated) throw notFound("Category not found");
    return apiOk(serializeCategory(updated));
  });
}

/** DELETE /api/v1/categories/:id — referencing transactions are set to NULL. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const { id } = await ctx.params;
    const deleted = await deleteCategory(user.id, id);
    if (!deleted) throw notFound("Category not found");
    return apiOk({ id, deleted: true });
  });
}
