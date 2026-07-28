"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";
import { pickAcceptedFiles } from "./upload-client";

/**
 * A fixed-height attachments area that IS the drop target — there's no separate
 * dropzone box. The file tiles live inside and scroll past the visible height, so
 * the dialog's height never changes with the file count. Accepts drag-drop, paste
 * and click-to-browse, and shows a "drop to attach" overlay while dragging.
 */
export function AttachmentBox({
  children,
  onFiles,
  remaining,
  disabled = false,
  uploading = false,
  hasItems,
}: {
  /** The `<ul>` of tiles to show when there are files. */
  children?: ReactNode;
  onFiles: (files: File[]) => void;
  remaining: number;
  disabled?: boolean;
  uploading?: boolean;
  hasItems: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = remaining <= 0;

  function accept(list: FileList | null) {
    if (!list || list.length === 0) return;
    const { accepted, errors } = pickAcceptedFiles([...list], remaining);
    errors.forEach((e) => toast.error(e));
    if (accepted.length) onFiles(accepted);
  }

  function browse() {
    if (!disabled && !full) inputRef.current?.click();
  }

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        // Keep the page-level drop handler (which opens the Add dialog) out of it.
        e.stopPropagation();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        if (!disabled) accept(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        if (disabled || e.clipboardData.files.length === 0) return;
        accept(e.clipboardData.files);
      }}
      className={cn(
        "relative flex h-44 flex-col overflow-hidden rounded-lg border transition-colors",
        dragging && !disabled && "border-primary bg-primary/5",
      )}
    >
      {hasItems ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      ) : (
        <button
          type="button"
          onClick={browse}
          disabled={disabled}
          className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">Drag files here, or browse</span>
          <span className="text-xs text-muted-foreground">Images, PDF, Excel, CSV · up to 5 MB each</span>
        </button>
      )}

      {hasItems ? (
        <div className="shrink-0 border-t">
          {full ? (
            <p className="px-2 py-1.5 text-center text-xs text-muted-foreground">
              Up to {ATTACHMENT_MAX_PER_TRANSACTION} files per transaction
            </p>
          ) : (
            <button
              type="button"
              onClick={browse}
              disabled={disabled}
              className="flex w-full items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-60"
            >
              <Plus className="size-3.5" aria-hidden /> Add file
            </button>
          )}
        </div>
      ) : null}

      {dragging && !disabled ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-foreground">
          Drop to attach
        </div>
      ) : null}

      {uploading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading…
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
