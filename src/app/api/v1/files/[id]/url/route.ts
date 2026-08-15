import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, notFound } from "@/lib/errors";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getFileForDownload } from "@/services/files";
import { contentDisposition } from "@/lib/files";
import { FILE_INLINE_TYPES, effectiveContentType } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** How long a minted URL stays valid. Short — it's issued per view, only after
 * the caller has been authorized. */
const URL_TTL_SECONDS = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/files/:id/url — mint a short-lived presigned URL for a vault
 * file's bytes. Authorizes the caller (viewer-or-better on the file's profile
 * in the current workspace) and returns a URL the client fetches directly —
 * **without** the Authorization header; the signature in the URL is the
 * credential. `?variant=thumb` returns the small preview object when one
 * exists (falling back to the original); `?download=1` forces an attachment
 * disposition so a browser/share-sheet saves rather than displays.
 *
 * Only types on `FILE_INLINE_TYPES` are served inline; everything else gets an
 * `attachment` disposition even without `?download=1`. That is the same rule
 * the web route applies, and it is what keeps the vault's permissive upload
 * policy safe — the vault accepts any well-formed MIME type, so a stored
 * HTML/SVG must never render (and run its script) off the R2 origin in the
 * app's WebView. Previews are always inline: they're webp we generated.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File storage isn't configured on this server.");
    }
    const { id } = await ctx.params;
    const row = await getFileForDownload(user.id, workspace.id, id);
    if (!row) throw notFound("File not found");

    const params = new URL(request.url).searchParams;
    const wantThumb = params.get("variant") === "thumb" && row.thumbnailKey != null;
    const forceDownload = params.get("download") === "1";
    const key = wantThumb ? row.thumbnailKey! : row.r2Key;
    // Re-derived rather than echoed, and restated on the URL itself: a file
    // stored before we could name its container is `application/octet-stream`
    // in the DB *and* in the bucket, and on a presigned URL the client obeys
    // the object's own header — so without the override the app would still be
    // handed an anonymous binary to play.
    const contentType = effectiveContentType(row.name, row.contentType);
    const inline = wantThumb || (!forceDownload && FILE_INLINE_TYPES.has(contentType));
    const url = await signedGetUrl(key, {
      expiresSeconds: URL_TTL_SECONDS,
      disposition: contentDisposition(row.name, inline),
      // The preview is an image stored under its own type; only the original
      // ever needs correcting.
      ...(wantThumb ? {} : { contentType }),
    });
    return apiOk({
      url,
      expiresInSeconds: URL_TTL_SECONDS,
      fileName: row.name,
      contentType: wantThumb ? "image/webp" : contentType,
    });
  });
}
