import Link from "next/link";
import { Download, File as FileIcon } from "lucide-react";
import { createMetadata } from "@/lib/seo";
import { resolveShare, type SharedFilePublic } from "@/services/files";
import {
  isAudioContentType,
  isVideoContentType,
  rendersInBrowser,
  shareFileUrl,
} from "@/lib/files";
import { formatFileSize } from "@/lib/attachments";
import { MediaPlayer } from "@/components/media-player";
import { SharedFolderBrowser } from "./share-views";

export const dynamic = "force-dynamic";

// Public but secret-URL page: never indexed (also robots-disallowed).
export const metadata = createMetadata({
  title: "Shared files",
  description: "A file or folder shared with you from SpendChat.",
  path: "/share",
  noIndex: true,
});

/**
 * The public landing page behind a share link. No auth — the token in the URL
 * is the whole capability (resolved + expiry-checked in the service). A file
 * link previews the file inline where the type allows; a folder link renders
 * the folder's subtree with per-file view/download links. Bytes are served by
 * `/api/share/[token]/file/[fileId]`, which re-checks the token per request.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveShare(token);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          SpendChat
        </Link>
        <span className="text-xs text-muted-foreground">Shared with you</span>
      </header>

      {!share ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-20 text-center">
          <p className="text-sm font-medium">This link doesn’t work anymore</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have expired or been revoked, or the file was deleted. Ask the person who
            shared it for a fresh link.
          </p>
        </div>
      ) : share.kind === "file" ? (
        <SharedFile token={token} file={share.file} allowDownload={share.allowDownload} />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold">{share.folder.name}</h1>
            <p className="text-xs text-muted-foreground">
              Shared folder{share.allowDownload ? "" : " · view only"}
            </p>
          </div>
          <SharedFolderBrowser
            token={token}
            rootId={share.folder.id}
            rootName={share.folder.name}
            folders={share.folders}
            files={share.files}
            tags={share.tags}
            allowDownload={share.allowDownload}
          />
        </div>
      )}
    </main>
  );
}

function DownloadLink({
  token,
  file,
  allowDownload,
}: {
  token: string;
  file: SharedFilePublic;
  allowDownload: boolean;
}) {
  if (!allowDownload) return null;
  return (
    <a
      href={shareFileUrl(token, file.id, true)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
    >
      <Download className="size-4" aria-hidden /> Download
    </a>
  );
}

/** The card shown instead of a preview, with the download button when the link
 *  allows one. Also the media player's fallback, so a container the engine
 *  turns out not to decode lands somewhere that explains itself. */
function NoPreview({
  token,
  file,
  allowDownload,
  message,
}: {
  token: string;
  file: SharedFilePublic;
  allowDownload: boolean;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <FileIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      <DownloadLink token={token} file={file} allowDownload={allowDownload} />
    </div>
  );
}

function SharedFile({
  token,
  file,
  allowDownload,
}: {
  token: string;
  file: SharedFilePublic;
  allowDownload: boolean;
}) {
  const src = shareFileUrl(token, file.id);
  const isImage = file.contentType.startsWith("image/");
  const isPdf = file.contentType === "application/pdf";
  const isText = file.contentType === "text/plain" || file.contentType === "text/markdown";
  // `rendersInBrowser`, not `video/*`: a `.avi` or `.wmv` is stored as video and
  // served inline everywhere a download is available, but here it would render
  // a permanently broken player — and on a view-only link there'd be no
  // download button either, so nothing would explain it.
  const previewable = rendersInBrowser(file.contentType);
  const isVideo = previewable && isVideoContentType(file.contentType);
  const isAudio = previewable && isAudioContentType(file.contentType);
  const unplayable = (
    <NoPreview
      token={token}
      file={file}
      allowDownload={allowDownload}
      message={
        allowDownload
          ? "This browser can’t play this file’s format. Download it to open in a media player."
          : "This browser can’t play this file’s format, and this link is view-only."
      }
    />
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{file.name}</h1>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</p>
        </div>
        <DownloadLink token={token} file={file} allowDownload={allowDownload} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-muted/30">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={file.name} className="mx-auto max-h-[75svh] object-contain" />
        ) : isPdf ? (
          <iframe src={src} title={file.name} className="h-[75svh] w-full border-0" />
        ) : isVideo ? (
          <MediaPlayer
            src={src}
            kind="video"
            className="mx-auto max-h-[75svh] w-full"
            fallback={unplayable}
          />
        ) : isAudio ? (
          <div className="p-6">
            <MediaPlayer src={src} kind="audio" className="w-full" fallback={unplayable} />
          </div>
        ) : isText ? (
          <iframe src={src} title={file.name} className="h-[60svh] w-full border-0 bg-background" />
        ) : (
          <NoPreview
            token={token}
            file={file}
            allowDownload={allowDownload}
            message={
              previewable
                ? "Preview couldn’t be shown for this file."
                : allowDownload
                  ? "No inline preview for this file type — download it to view."
                  : "No inline preview for this file type, and this link is view-only."
            }
          />
        )}
      </div>
    </div>
  );
}
