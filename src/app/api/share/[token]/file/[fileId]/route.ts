import type { NextRequest } from "next/server";
import { withRequestContext } from "@/lib/request-context";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured, signedGetUrl } from "@/lib/r2";
import { getSharedFileForDownload } from "@/services/files";
import { ATTACHMENT_SPREADSHEET_TYPES, effectiveContentType } from "@/lib/validation";
import {
  contentDisposition,
  isAudioContentType,
  isVideoContentType,
  rendersInBrowser,
} from "@/lib/files";

export const dynamic = "force-dynamic";

const URL_TTL_SECONDS = 300;

type Ctx = { params: Promise<{ token: string; fileId: string }> };

/**
 * Serve a vault file to the holder of a share link — no session; the token is
 * the whole authorization. A file link serves exactly its file; a folder link
 * serves any file in the folder's subtree (checked in the service). Same
 * proxy/redirect split as the authenticated `/api/files/:id` route.
 *
 * View-only links (`allowDownload: false`) refuse `?download=1` **and** anything
 * the browser wouldn't render — a preview the engine can't produce is a
 * download by another name (see `rendersInBrowser`). Everything else previews
 * inline, thumbnails included.
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
    const contentType = effectiveContentType(row.name, row.contentType);
    const isMedia = isVideoContentType(contentType) || isAudioContentType(contentType);
    // On this route "inline" has to mean *the browser will render it*, not just
    // "it's on the inline allowlist". Media is allowlisted across the board so
    // each engine can try every container, but navigating to a `.avi`/`.wmv`
    // nothing decodes saves it to the recipient's disk — which is the one thing
    // a view-only link promises won't happen. The guard is here and not only in
    // the page's link builder because the token, not the client, is the caller.
    const renders = rendersInBrowser(contentType);
    const canProxy = (renders && !isMedia) || ATTACHMENT_SPREADSHEET_TYPES.has(contentType);
    if (!forceDownload && !wantThumb && !renders && !allowDownload) {
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
          "content-type": contentType,
          "content-disposition": contentDisposition(row.name, renders),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      }

      // Only what renders goes out inline; a container the browser would save
      // is labelled `attachment`, so a download-allowed link is honest about
      // what the click does instead of pretending to preview.
      const inline = !forceDownload && renders;
      const url = await signedGetUrl(row.r2Key, {
        expiresSeconds: URL_TTL_SECONDS,
        disposition: contentDisposition(row.name, inline),
        contentType,
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
