import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, notFound, validationError } from "@/lib/errors";
import { INVOICE_LOGO_MAX_BYTES } from "@/lib/invoices";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getSellerLogo, removeSellerLogo, setSellerLogo } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const URL_TTL_SECONDS = 300;

/**
 * GET /api/v1/invoice-sellers/:id/logo — a short-lived URL for the logo's
 * bytes (fetch it without the Authorization header). 404 when there's none.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File storage isn't configured on this server.");
    }
    const { id } = await ctx.params;
    const logo = await getSellerLogo(user.id, workspace.id, id);
    if (!logo) throw notFound("No logo");
    const url = await signedGetUrl(logo.key, { expiresSeconds: URL_TTL_SECONDS, contentType: logo.contentType });
    return apiOk({ url, expiresInSeconds: URL_TTL_SECONDS, contentType: logo.contentType });
  });
}

/**
 * PUT /api/v1/invoice-sellers/:id/logo — the image itself as the body
 * (`Content-Type: image/png` or `image/jpeg`, ≤ 300 KB), replacing any logo it
 * had. It counts toward the workspace's storage (413 `storage_quota_exceeded`).
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > INVOICE_LOGO_MAX_BYTES) throw validationError("A logo can be at most 300 KB");
    const bytes = new Uint8Array(await request.arrayBuffer());
    return apiOk(await setSellerLogo(user.id, workspace.id, id, bytes));
  });
}

/** DELETE /api/v1/invoice-sellers/:id/logo — remove the logo. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const seller = await removeSellerLogo(user.id, workspace.id, id);
    if (!seller) throw notFound("Business details not found");
    return apiOk(seller);
  });
}
