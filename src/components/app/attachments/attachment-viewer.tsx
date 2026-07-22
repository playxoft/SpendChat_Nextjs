"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attachmentGlyph } from "./attachment-icon";
import {
  attachmentDisplayName,
  attachmentDownloadUrl,
  attachmentTypeLabel,
  attachmentViewUrl,
  isImageContentType,
} from "@/lib/attachments";

/** What the viewer needs to render + fetch an attachment. */
export type ViewerAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  label?: string | null;
};

const ViewerContext = createContext<((a: ViewerAttachment) => void) | null>(null);

/** Open an attachment in the shared in-page preview dialog. */
export function useAttachmentViewer(): (a: ViewerAttachment) => void {
  const open = useContext(ViewerContext);
  if (!open) {
    throw new Error("useAttachmentViewer must be used within <AttachmentViewerProvider>");
  }
  return open;
}

/**
 * Renders a single preview dialog for the whole app tree and exposes `open()`
 * via context, so a feed bubble, a table cell, or the edit dialog can all open a
 * file in-page (never a new tab) without each mounting its own modal. Images and
 * PDFs render inline (the authenticated route 302s to a short-lived signed URL);
 * office docs fall back to a download card.
 */
export function AttachmentViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ViewerAttachment | null>(null);
  const open = useCallback((a: ViewerAttachment) => setItem(a), []);

  return (
    <ViewerContext.Provider value={open}>
      {children}
      <AttachmentPreviewDialog item={item} onClose={() => setItem(null)} />
    </ViewerContext.Provider>
  );
}

function AttachmentPreviewDialog({
  item,
  onClose,
}: {
  item: ViewerAttachment | null;
  onClose: () => void;
}) {
  const name = item
    ? attachmentDisplayName({ label: item.label ?? null, fileName: item.fileName })
    : "";
  const isImage = item ? isImageContentType(item.contentType) : false;
  const isPdf = item?.contentType === "application/pdf";
  const embeds = isImage || isPdf;

  // Show a centered spinner until the media finishes loading; reset each time a
  // different file opens (adjust-state-during-render — no effect needed).
  const [loading, setLoading] = useState(true);
  const [seenId, setSeenId] = useState<string | null>(item?.id ?? null);
  if ((item?.id ?? null) !== seenId) {
    setSeenId(item?.id ?? null);
    setLoading(true);
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      {/* A large, fixed-size window so the preview isn't cramped — it stays this
          size while loading (spinner centered) rather than shrinking to content. */}
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[calc(100%-2rem)] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader className="min-w-0 shrink-0 pr-8">
          <DialogTitle className="truncate">{name}</DialogTitle>
          <DialogDescription className="truncate">
            {item ? attachmentTypeLabel(item.contentType) : ""}
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
            {embeds && loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading" />
              </div>
            ) : null}
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentViewUrl(item.id)}
                alt={name}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
                className="size-full object-contain"
              />
            ) : isPdf ? (
              <iframe
                src={attachmentViewUrl(item.id)}
                title={name}
                onLoad={() => setLoading(false)}
                className="size-full"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-xl border bg-background text-muted-foreground">
                  {attachmentGlyph(item.contentType, "size-7")}
                </div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Previews aren’t available for {attachmentTypeLabel(item.contentType)} files.
                  Download it to view.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {item ? (
          <div className="flex shrink-0 items-center justify-end gap-2">
            <a
              href={attachmentViewUrl(item.id)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <ExternalLink className="size-4" /> Open in new tab
            </a>
            <a href={attachmentDownloadUrl(item.id)} className={cn(buttonVariants({ size: "sm" }))}>
              <Download className="size-4" /> Download
            </a>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
