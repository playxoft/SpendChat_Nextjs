"use client";

import { useRef, useState } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { attachmentGlyph } from "./attachment-icon";
import { attachmentTypeLabel, formatFileSize } from "@/lib/attachments";
import { ATTACHMENT_LABEL_MAX, type AttachmentKind } from "@/lib/validation";

export type AttachmentTileProps = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  label: string | null;
  kind: AttachmentKind | null;
  /** Stored thumbnail URL for a saved file; falls back to the type icon. */
  thumbnailUrl?: string | null;
  status?: "idle" | "uploading" | "error";
  errorMessage?: string | null;
  /** When true, the name is click-to-edit and the tag/remove controls show. */
  editable?: boolean;
  /** Open the file in the in-page preview (adds an eye button; also the name
   * click when the tile isn't editable). */
  onOpen?: () => void;
  onSave?: (next: { label: string | null; kind: AttachmentKind | null }) => void | Promise<void>;
  onRemove?: () => void;
  removeLabel?: string;
};

/**
 * A compact file row: a centered type glyph, the name (custom label or filename)
 * that truncates to fit, an optional tag + the type · size, and the open/remove
 * actions. `min-w-0`/`truncate` throughout keep a very long filename from ever
 * widening its container. Icon-only for now (no thumbnails).
 */
export function AttachmentTile({
  fileName,
  contentType,
  sizeBytes,
  label,
  kind,
  thumbnailUrl,
  status = "idle",
  errorMessage,
  editable = false,
  onOpen,
  onSave,
  onRemove,
  removeLabel = "Remove file",
}: AttachmentTileProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committed = useRef(false);
  const displayName = label && label.trim() ? label : fileName;

  function startEdit() {
    if (!editable) return;
    setDraft(label ?? "");
    committed.current = false;
    setEditing(true);
  }
  function commit() {
    if (committed.current) return; // Enter then blur shouldn't fire twice
    committed.current = true;
    setEditing(false);
    const next = draft.trim() ? draft.trim() : null;
    if (next !== label) void onSave?.({ label: next, kind });
  }

  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 items-center gap-2.5 rounded-lg border bg-card p-2",
        status === "error" && "border-destructive/40",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          attachmentGlyph(contentType, "size-5")
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            placeholder={fileName}
            maxLength={ATTACHMENT_LABEL_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                committed.current = true;
                setEditing(false);
              }
            }}
            className="h-7 text-sm"
            aria-label="File name"
          />
        ) : editable ? (
          <button
            type="button"
            onClick={startEdit}
            title={`${displayName} — click to rename`}
            className="block w-full truncate text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {displayName}
          </button>
        ) : onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            title={`Open ${displayName}`}
            className="block w-full truncate text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {displayName}
          </button>
        ) : (
          <span title={displayName} className="block truncate text-sm font-medium">
            {displayName}
          </span>
        )}

        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {/* File tag intentionally hidden for now — the `kind` field is kept in
              the data model and threaded through `onSave` for a later revival. */}
          <span className="truncate">
            {attachmentTypeLabel(contentType)} · <span className="tabular-nums">{formatFileSize(sizeBytes)}</span>
          </span>
        </div>

        {status === "error" && errorMessage ? (
          <p className="mt-0.5 truncate text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${displayName}`}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Eye className="size-4" aria-hidden />
          </button>
        ) : null}
        {editable && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {status === "uploading" ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Uploading" />
        </div>
      ) : null}
    </div>
  );
}
