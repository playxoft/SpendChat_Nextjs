import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, notFound } from "@/lib/errors";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getAttachmentForDownload } from "@/services/attachments";
import { contentDisposition } from "@/lib/files";

export const dynamic = "force-dynamic";

/** How long a minted URL stays valid. Short — it's issued per view, only after
 * the caller has been authorized. */
const URL_TTL_SECONDS = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/attachments/:id/url — mint a short-lived presigned URL for an
 * attachment's bytes. Authorizes the caller (viewer-or-better on the
 * attachment's profile in the current workspace) and returns a URL the client
 * fetches directly — **without** the Authorization header; the signature in the
 * URL is the credential. `?variant=thumb` returns the small preview object when
 * one exists (falling back to the original); `?download=1` sets an attachment
 * disposition so a browser/share-sheet saves rather than displays.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File storage isn't configured on this server.");
    }
    const { id } = await ctx.params;
    const row = await getAttachmentForDownload(user.id, workspace.id, id);
    if (!row) throw notFound("Attachment not found");

    const params = new URL(request.url).searchParams;
    const wantThumb = params.get("variant") === "thumb" && row.thumbnailKey != null;
    const forceDownload = params.get("download") === "1";
    const key = wantThumb ? row.thumbnailKey! : row.r2Key;
    const url = await signedGetUrl(key, {
      expiresSeconds: URL_TTL_SECONDS,
      disposition: contentDisposition(row.fileName, !forceDownload),
    });
    return apiOk({
      url,
      expiresInSeconds: URL_TTL_SECONDS,
      fileName: row.fileName,
      contentType: wantThumb ? "image/webp" : row.contentType,
    });
  });
}
