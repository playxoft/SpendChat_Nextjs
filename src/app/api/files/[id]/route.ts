import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getFileForDownload } from "@/services/files";
import {
  ATTACHMENT_SPREADSHEET_TYPES,
  FILE_INLINE_TYPES,
} from "@/lib/validation";
import { contentDisposition, isAudioContentType, isVideoContentType } from "@/lib/files";

export const dynamic = "force-dynamic";

const URL_TTL_SECONDS = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serve a vault file. Authorizes the caller (viewer-or-better on the file's
 * profile in the current workspace), then:
 *  - **proxies** embeddable bytes (images, PDF, text/CSV/Markdown, spreadsheets)
 *    same-origin so the in-app viewer can iframe/fetch them;
 *  - **302-redirects** video/audio to a short-lived presigned URL served inline —
 *    R2 honors Range requests there, which seeking needs and a plain proxy
 *    wouldn't provide;
 *  - **302-redirects everything else as a download** (`attachment` disposition).
 *    That last rule is what keeps the vault's permissive upload policy safe: a
 *    stored HTML/SVG is never rendered in our origin.
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

    const row = await getFileForDownload(user.id, workspace.id, id);
    if (!row) return Response.json({ error: "File not found" }, { status: 404 });

    const params = new URL(request.url).searchParams;
    const forceDownload = params.get("download") === "1";
    // The tile requests `?variant=thumb` — serve the small preview object.
    const wantThumb = params.get("variant") === "thumb" && row.thumbnailKey != null;
    const isMedia = isVideoContentType(row.contentType) || isAudioContentType(row.contentType);
    const isInline = FILE_INLINE_TYPES.has(row.contentType);
    const canProxy =
      (isInline && !isMedia) || ATTACHMENT_SPREADSHEET_TYPES.has(row.contentType);

    try {
      if (wantThumb) {
        const url = await signedGetUrl(row.thumbnailKey!, {
          expiresSeconds: URL_TTL_SECONDS,
          disposition: contentDisposition(row.name, true),
        });
        return new Response(null, {
          status: 302,
          headers: { Location: url, "cache-control": "private, no-store" },
        });
      }

      if (!forceDownload && canProxy) {
        const url = await signedGetUrl(row.r2Key, { expiresSeconds: URL_TTL_SECONDS });
        const upstream = await fetch(url);
        if (!upstream.ok || !upstream.body) {
          logger.error(`Vault file preview upstream returned ${upstream.status}`, {
            event: "vault.preview_failed",
            status: upstream.status,
          });
          return Response.json({ error: "Couldn't open that file." }, { status: 502 });
        }
        const headers = new Headers({
          "content-type": row.contentType,
          "content-disposition": contentDisposition(row.name, isInline),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      }

      // Media plays inline off the presigned URL (Range support); everything
      // else — including any type we don't inline — goes out as a download.
      const inline = !forceDownload && isMedia;
      const url = await signedGetUrl(row.r2Key, {
        expiresSeconds: URL_TTL_SECONDS,
        disposition: contentDisposition(row.name, inline),
      });
      return new Response(null, {
        status: 302,
        headers: { Location: url, "cache-control": "private, no-store" },
      });
    } catch (err) {
      logger.error(`Vault file download failed to sign: ${describeError(err)}`, {
        event: "vault.download_failed",
        error: err instanceof Error ? err : String(err),
      });
      return Response.json({ error: "Couldn't open that file." }, { status: 502 });
    }
  });
}
