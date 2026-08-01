import type { NextRequest } from "next/server";
import { withRequestContext } from "@/lib/request-context";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getSharedFileForDownload } from "@/services/files";
import {
  ATTACHMENT_SPREADSHEET_TYPES,
  FILE_INLINE_TYPES,
} from "@/lib/validation";
import { isAudioContentType, isVideoContentType } from "@/lib/files";

export const dynamic = "force-dynamic";

const URL_TTL_SECONDS = 300;

function contentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? "inline" : "attachment";
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

type Ctx = { params: Promise<{ token: string; fileId: string }> };

/**
 * Serve a vault file to the holder of a share link — no session; the token is
 * the whole authorization. A file link serves exactly its file; a folder link
 * serves any file in the folder's subtree (checked in the service). View-only
 * links (`allowDownload: false`) refuse `?download=1` but still preview inline —
 * the same proxy/redirect split as the authenticated `/api/files/:id` route.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    if (!isR2Configured()) {
      return Response.json({ error: "File storage isn't configured." }, { status: 503 });
    }
    const { token, fileId } = await ctx.params;
    const resolved = await getSharedFileForDownload(token, fileId);
    // One generic 404 for every failure mode (bad token, expired, foreign file)
    // so the response never distinguishes "wrong token" from "no such file".
    if (!resolved) return Response.json({ error: "Not found" }, { status: 404 });
    const { row, allowDownload } = resolved;

    const params = new URL(request.url).searchParams;
    const forceDownload = params.get("download") === "1";
    if (forceDownload && !allowDownload) {
      return Response.json({ error: "This link is view-only." }, { status: 403 });
    }
    // Thumbnails are previews, so they're served even on view-only links.
    const wantThumb = params.get("variant") === "thumb" && row.thumbnailKey != null;
    const isMedia = isVideoContentType(row.contentType) || isAudioContentType(row.contentType);
    const isInline = FILE_INLINE_TYPES.has(row.contentType);
    const canProxy =
      (isInline && !isMedia) || ATTACHMENT_SPREADSHEET_TYPES.has(row.contentType);
    // A non-previewable type on a view-only link has no servable form at all.
    if (!forceDownload && !wantThumb && !isInline && !canProxy && !allowDownload) {
      return Response.json({ error: "This link is view-only." }, { status: 403 });
    }

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
          logger.error(`Shared file upstream returned ${upstream.status}`, {
            event: "vault.share_preview_failed",
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
      logger.error(`Shared file download failed to sign: ${describeError(err)}`, {
        event: "vault.share_download_failed",
        error: err instanceof Error ? err : String(err),
      });
      return Response.json({ error: "Couldn't open that file." }, { status: 502 });
    }
  });
}
