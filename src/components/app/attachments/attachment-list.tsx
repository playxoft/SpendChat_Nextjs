"use client";

import { Eye } from "lucide-react";
import { attachmentGlyph } from "./attachment-icon";
import {
  attachmentDisplayName,
  attachmentThumbUrl,
  attachmentTypeLabel,
  formatFileSize,
} from "@/lib/attachments";
import type { AttachmentKind } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** A file row's data. `id` is null for a not-yet-uploaded (staged/pending) file,
 * which renders as a non-clickable row. */
export type ListAttachment = {
  id: string | null;
  fileName: string;
  contentType: string;
  label?: string | null;
  kind?: AttachmentKind | null;
  sizeBytes?: number | null;
  /** True when a stored thumbnail exists — show it instead of the type icon. */
  hasThumbnail?: boolean | null;
};

/**
 * A plain vertical list of attachment rows (Telegram-style): an icon (a
 * thumbnail later), the name, and a tag + file format · size line — each a
 * clickable button that opens the file in the in-page preview. Not a chip or a
 * scroller: files stack as full-width rows. Used inside a feed bubble.
 */
export function AttachmentList({
  attachments,
  onOpen,
  className,
}: {
  attachments: ListAttachment[];
  onOpen?: (a: ListAttachment) => void;
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      {attachments.map((a, i) => (
        <AttachmentListItem key={a.id ?? `staged-${i}`} a={a} onOpen={onOpen} />
      ))}
    </div>
  );
}

function AttachmentListItem({
  a,
  onOpen,
}: {
  a: ListAttachment;
  onOpen?: (a: ListAttachment) => void;
}) {
  const name = attachmentDisplayName({ label: a.label ?? null, fileName: a.fileName });
  const interactive = !!(onOpen && a.id);
  const meta = a.sizeBytes
    ? `${attachmentTypeLabel(a.contentType)} · ${formatFileSize(a.sizeBytes)}`
    : attachmentTypeLabel(a.contentType);

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onOpen!(a);
            }
          : undefined
      }
      title={interactive ? `Open ${name}` : name}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-lg border bg-background/60 p-2 text-left transition-colors",
        interactive
          ? "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          : "cursor-default",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
        {a.hasThumbnail && a.id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachmentThumbUrl(a.id)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          attachmentGlyph(a.contentType, "size-5")
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {interactive ? <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </button>
  );
}
