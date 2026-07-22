"use client";

import { useRef, useState, type ReactNode } from "react";
import { Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";
import { pickAcceptedFiles } from "./upload-client";

/**
 * The file-picking surface for attachments. Two shapes from one component:
 *  - `panel` — a dashed drop area (used inside dialogs) that accepts drag-drop,
 *    click-to-browse, and paste.
 *  - `inline` — a compact paperclip trigger (used in the chat composer), where
 *    the drop target is the surrounding page rather than the button itself.
 *
 * Filtering (type / size / remaining slots) is shared with the server rules via
 * `pickAcceptedFiles`; rejects surface as a toast and never reach `onFiles`.
 */
export function AttachmentDropzone({
  onFiles,
  remaining = Number.POSITIVE_INFINITY,
  disabled = false,
  variant = "panel",
  label,
  className,
}: {
  onFiles: (files: File[]) => void;
  /** Free attachment slots left; caps a multi-file pick and messages when full. */
  remaining?: number;
  disabled?: boolean;
  variant?: "panel" | "inline";
  /** Overrides the inline trigger's text. */
  label?: ReactNode;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = remaining <= 0;
  const blocked = disabled || full;

  function accept(list: FileList | null) {
    if (!list || list.length === 0) return;
    const { accepted, errors } = pickAcceptedFiles([...list], remaining);
    errors.forEach((e) => toast.error(e));
    if (accepted.length) onFiles(accepted);
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ATTACHMENT_ACCEPT}
      className="hidden"
      disabled={blocked}
      onChange={(e) => {
        accept(e.target.files);
        // Let the same file be re-picked later.
        e.target.value = "";
      }}
    />
  );

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          disabled={blocked}
          onClick={() => inputRef.current?.click()}
          aria-label="Attach files"
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
            className,
          )}
        >
          <Paperclip className="size-5" aria-hidden />
          {label ? <span className="ml-1.5 text-sm">{label}</span> : null}
        </button>
        {hiddenInput}
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        if (blocked) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        // Ignore leaves onto descendants — only reset when the pointer leaves the button.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!blocked) accept(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        if (blocked || e.clipboardData.files.length === 0) return;
        accept(e.clipboardData.files);
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
        "border-border hover:border-foreground/30 hover:bg-muted/50",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        dragging && "border-primary bg-primary/5",
        blocked && "cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent",
        className,
      )}
    >
      <Upload className="size-5 text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium text-foreground">
        {full ? "Attachment limit reached" : "Drag files here, or browse"}
      </span>
      <span className="text-xs text-muted-foreground">
        {full
          ? `Up to ${ATTACHMENT_MAX_PER_TRANSACTION} files per transaction`
          : "Receipts, bills, invoices — images, PDF, Word, Excel · up to 5 MB each"}
      </span>
      {hiddenInput}
    </button>
  );
}
