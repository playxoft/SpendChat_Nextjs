import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getAttachmentForDownload } from "@/services/attachments";
import { ATTACHMENT_INLINE_TYPES } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** How long a minted download URL stays valid. Short — it's issued per view,
 * only after the caller has been authorized. */
const URL_TTL_SECONDS = 300;

/**
 * Build a `Content-Disposition` value with both an ASCII-safe filename and an
 * RFC 5987 UTF-8 filename, so non-ASCII names survive without letting a hostile
 * name break out of the header.
 */
function contentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? "inline" : "attachment";
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serve a transaction attachment. Authorizes the caller (viewer-or-better on the
 * attachment's profile in the current workspace), then either:
 *  - **proxies** previewable bytes (images, PDF, text) same-origin, so the in-app
 *    preview can embed them in an `<iframe>` — a cross-origin R2 URL would be
 *    blocked by our `frame-src`/`frame-ancestors`; or
 *  - **302-redirects** to a short-lived presigned R2 URL for downloads
 *    (`?download=1`), the small thumbnail (`?variant=thumb`), and non-previewable
 *    types — cheaper, since those don't need to be framed.
 * The object's public bucket URL is never exposed either way.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    setLogContext({ userId: user.id });

    if (!isR2Configured()) {
      return Response.json({ error: "File storage isn't configured." }, { status: 503 });
    }

    const { id } = await ctx.params;
    const workspace = await getCurrentWorkspace(user.id);
    setLogContext({ workspaceId: workspace.id });

    const row = await getAttachmentForDownload(user.id, workspace.id, id);
    if (!row) return Response.json({ error: "Attachment not found" }, { status: 404 });

    const params = new URL(request.url).searchParams;
    // The tile requests `?variant=thumb` — serve the small preview object.
    const wantThumb = params.get("variant") === "thumb" && row.thumbnailKey != null;
    const forceDownload = params.get("download") === "1";
    const isPreviewable = ATTACHMENT_INLINE_TYPES.has(row.contentType);

    try {
      // Proxy previewable bytes through this same-origin route so the in-app
      // viewer can embed them (see the header note above). Streamed, not
      // buffered — the 5 MB cap bounds it.
      if (!wantThumb && !forceDownload && isPreviewable) {
        const url = await signedGetUrl(row.r2Key, { expiresSeconds: URL_TTL_SECONDS });
        const upstream = await fetch(url);
        if (!upstream.ok || !upstream.body) {
          logger.error(`Attachment preview upstream returned ${upstream.status}`, {
            event: "attachment.preview_failed",
            status: upstream.status,
          });
          return Response.json({ error: "Couldn't open that file." }, { status: 502 });
        }
        const headers = new Headers({
          "content-type": row.contentType,
          "content-disposition": contentDisposition(row.fileName, true),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      }

      // Everything else 302s straight to R2. `no-store` keeps the short-lived
      // signed URL out of any shared cache.
      const key = wantThumb ? row.thumbnailKey! : row.r2Key;
      const url = await signedGetUrl(key, {
        expiresSeconds: URL_TTL_SECONDS,
        disposition: contentDisposition(row.fileName, wantThumb),
      });
      return new Response(null, {
        status: 302,
        headers: { Location: url, "cache-control": "private, no-store" },
      });
    } catch (err) {
      logger.error(`Attachment download failed to sign: ${describeError(err)}`, {
        event: "attachment.download_failed",
        error: err instanceof Error ? err : String(err),
      });
      return Response.json({ error: "Couldn't open that file." }, { status: 502 });
    }
  });
}
