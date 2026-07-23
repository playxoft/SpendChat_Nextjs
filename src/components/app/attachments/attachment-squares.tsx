"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { attachmentGlyph } from "./attachment-icon";
import { AttachmentList, type ListAttachment } from "./attachment-list";
import { attachmentThumbUrl } from "@/lib/attachments";
import { cn } from "@/lib/utils";

const MAX_SQUARES = 2;

/**
 * Compact attachments cell for the table: up to two square file icons plus a
 * "+N" for the rest and a dropdown caret. Clicking opens a popover below with the
 * full file list (the same `AttachmentList` used in the chat feed) — picking a
 * file opens the shared preview. The popover stays open until dismissed
 * (Escape / click elsewhere), never on hover.
 */
export function AttachmentSquares({
  attachments,
  onOpen,
}: {
  attachments: ListAttachment[];
  onOpen: (a: ListAttachment) => void;
}) {
  const [open, setOpen] = useState(false);
  if (attachments.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const shown = attachments.slice(0, MAX_SQUARES);
  const extra = attachments.length - shown.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Don't let opening the list also open the row's edit dialog (the row
          // reacts to both click and Enter).
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`${attachments.length} ${attachments.length === 1 ? "file" : "files"} — open list`}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border bg-background p-1 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            open && "bg-muted/60",
          )}
        >
          {shown.map((a, i) => (
            <span
              key={a.id ?? i}
              className="flex size-7 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground"
            >
              {a.hasThumbnail && a.id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentThumbUrl(a.id)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                attachmentGlyph(a.contentType, "size-4")
              )}
            </span>
          ))}
          {extra > 0 ? (
            <span className="px-1 text-xs font-medium text-muted-foreground">+{extra}</span>
          ) : null}
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" closeOnOutsideClick className="w-72 p-2">
        <AttachmentList
          attachments={attachments}
          onOpen={(a) => {
            setOpen(false);
            onOpen(a);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
