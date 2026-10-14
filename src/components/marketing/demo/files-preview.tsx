"use client";

import { useMemo, useState } from "react";
import { Folder, Share2 } from "lucide-react";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { StorageRing } from "@/components/app/files/storage-ring";
import {
  DEMO_FILES,
  DEMO_FOLDERS,
  DEMO_STORAGE_LIMIT_BYTES,
  DEMO_STORAGE_USED_BYTES,
} from "./demo-data";
import { formatFileSize } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/**
 * The files vault, at homepage size.
 *
 * A compact sibling of `demo/files-demo.tsx` rather than a reuse of it: that
 * one is 38rem tall and carries the whole `/app` shell — a search field, two
 * view modes and the sidebar — which is right for a feature page that has
 * nothing else to say, and far too tall for one band of a landing page. This
 * keeps the three things that make the vault legible at a glance (folders
 * tinted with their own colour, files that say what they are, and the
 * workspace storage gauge) and drops the rest.
 *
 * **The chrome is what differs, not the vault.** Both read their contents from
 * `demo-data.ts`, so the quota, the folders and the files are one set of facts
 * told twice at two sizes.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own. The ring especially is
 * worth importing rather than redrawing: its arc, its colour-tone thresholds
 * and its compact "0.1/1 GB" label are all logic that would rot in a copy.
 *
 * Opening a folder runs on the seed array. Nothing is uploaded, stored or
 * fetched, and the panel is a fixed height so opening one can't move the page.
 */

export function FilesPreview() {
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const files = useMemo(
    () => (openFolder ? DEMO_FILES.filter((f) => f.folder === openFolder) : DEMO_FILES),
    [openFolder],
  );

  return (
    <div className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Files</span>
        <StorageRing
          usedBytes={DEMO_STORAGE_USED_BYTES}
          limitBytes={DEMO_STORAGE_LIMIT_BYTES}
        />
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label="Files"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {/* Folders first, tinted with their own colour — the vault's shape.
            Pressing one opens it: the list below narrows to what's inside. */}
        <div className="grid gap-2 sm:grid-cols-3">
          {DEMO_FOLDERS.map((folder) => {
            const open = openFolder === folder.name;
            return (
              <button
                key={folder.name}
                type="button"
                onClick={() => setOpenFolder(open ? null : folder.name)}
                aria-pressed={open}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5 text-left transition-shadow hover:shadow-sm",
                  open && "ring-2 ring-ring",
                )}
                style={{ background: `${folder.color}14` }}
              >
                <Folder
                  className="size-4 shrink-0"
                  style={{ color: folder.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-sm">{folder.name}</span>
              </button>
            );
          })}
        </div>

        <ul className="divide-y rounded-xl border">
          {files.map((file) => (
            // Name over description in one column that takes the spare width;
            // `min-w-0` lets both truncate rather than push the size off a phone.
            <li key={file.id} className="flex items-center gap-x-3 px-3 py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">
                {attachmentGlyph(file.contentType, "size-4")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{file.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {file.description}
                </span>
              </span>
              <span className="ml-auto w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatFileSize(file.bytes)}
              </span>
              <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground sm:block">
                {file.modified}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {files.length} file{files.length === 1 ? "" : "s"}
          {openFolder ? ` in ${openFolder}` : " — tap a folder to open it"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Share2 className="size-3.5" /> Share links per file
        </span>
      </div>
    </div>
  );
}
