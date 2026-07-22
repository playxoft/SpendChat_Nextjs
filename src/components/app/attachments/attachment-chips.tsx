"use client";

import { attachmentGlyph } from "./attachment-icon";
import { attachmentDisplayName } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/** The minimal shape a chip needs. `id` is null for a not-yet-uploaded (staged)
 * file, which renders as a static chip rather than a clickable one. */
export type ChipAttachment = {
  id: string | null;
  fileName: string;
  contentType: string;
  label?: string | null;
};

/**
 * A horizontally scrollable strip of attachment chips (glyph + name). Used under
 * a feed bubble and inside the transactions table's attachments column. A chip
 * with an `id` is a button that opens the in-page preview; a staged chip (no id)
 * is static. Clicks stop propagation so opening a file never also triggers the
 * surrounding row/bubble's own click (which edits the transaction).
 */
export function AttachmentChips({
  attachments,
  onOpen,
  className,
}: {
  attachments: ChipAttachment[];
  onOpen?: (a: ChipAttachment) => void;
  className?: string;
}) {
  if (attachments.length === 0) return null;

  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto [scrollbar-width:thin]",
        className,
      )}
    >
      {attachments.map((a, i) => {
        const name = attachmentDisplayName({ label: a.label ?? null, fileName: a.fileName });
        const inner = (
          <>
            <span className="shrink-0">{attachmentGlyph(a.contentType, "size-3.5")}</span>
            <span className="max-w-[9rem] truncate">{name}</span>
          </>
        );
        return onOpen && a.id ? (
          <button
            key={a.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(a);
            }}
            title={name}
            className={cn(
              base,
              "transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            {inner}
          </button>
        ) : (
          <span key={a.id ?? `staged-${i}`} title={name} className={base}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
