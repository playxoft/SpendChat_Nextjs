"use client";

import { useMemo, useState } from "react";
import { Folder, Share2 } from "lucide-react";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { StorageRing } from "@/components/app/files/storage-ring";
import {
  DEMO_FILES,
  DEMO_FILE_TAGS,
  DEMO_FOLDERS,
  DEMO_STORAGE_LIMIT_BYTES,
  DEMO_STORAGE_USED_BYTES,
  demoTagColor,
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
 * tinted with their own colour, files carrying named tags and sizes, and the
 * workspace storage gauge) and drops the rest.
 *
 * **The chrome is what differs, not the vault.** Both read their contents from
 * `demo-data.ts`, so the quota, the folders, the tag colours and the files are
 * one set of facts told twice at two sizes. What's local here is only the
 * *shortening*: which tags survive the compact strip, and therefore which files
 * come with them.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own. The ring especially is
 * worth importing rather than redrawing: its arc, its colour-tone thresholds
 * and its compact "0.1/1 GB" label are all logic that would rot in a copy.
 *
 * Filtering runs on the seed array. Nothing is uploaded, stored or fetched,
 * and the panel is a fixed height so filtering to one tag can't move the page.
 */

/**
 * Three tags, not the vault's four: a fourth chip crowds the compact strip, and
 * the point of the band is "files carry colours", which three make as well as
 * four. Named rather than sliced so adding a tag to the shared list doesn't
 * silently change which one this drops.
 */
const PREVIEW_TAG_NAMES = ["Receipts", "Invoices", "Tax"];

const TAGS = DEMO_FILE_TAGS.filter((t) => PREVIEW_TAG_NAMES.includes(t.name));

/**
 * …and only the files those tags reach. A row whose every tag was dropped would
 * show a bare name with no dots beside it, which is precisely the thing this
 * band is trying to demonstrate.
 */
const FILES = DEMO_FILES.filter((f) =>
  f.tags.some((t) => PREVIEW_TAG_NAMES.includes(t)),
);

/**
 * The same tag chip the full demo draws, for the same reason — a swatch with no
 * name beside it is a fact only a sighted reader who can separate the hues gets
 * to have (WCAG 1.4.1). The long version of that argument, and why this isn't
 * the app's own `TagChip`, is in `files-demo.tsx`; it's copied here rather than
 * imported from there because the chrome is what's local to each of these two
 * files, and importing it would pull the whole 38rem demo into the homepage
 * bundle for the sake of twelve lines.
 */
function DemoTagChip({ tag }: { tag: string }) {
  const color = demoTagColor(tag);
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-xs"
      style={{ borderColor: `${color}55`, background: `${color}1a` }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate">{tag}</span>
    </span>
  );
}

export function FilesPreview() {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const files = useMemo(
    () => (activeTag ? FILES.filter((f) => f.tags.includes(activeTag)) : FILES),
    [activeTag],
  );

  return (
    <div className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1">
          {TAGS.map((tag) => {
            const active = activeTag === tag.name;
            return (
              <button
                key={tag.name}
                type="button"
                onClick={() => setActiveTag(active ? null : tag.name)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: tag.color }}
                />
                {tag.name}
              </button>
            );
          })}
        </div>
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
        {/* Folders first, tinted with their own colour — the vault's shape. */}
        <div className="grid gap-2 sm:grid-cols-3">
          {DEMO_FOLDERS.map((folder) => (
            <div
              key={folder.name}
              className="flex items-center gap-2 rounded-xl border p-2.5"
              style={{ background: `${folder.color}14` }}
            >
              <Folder
                className="size-4 shrink-0"
                style={{ color: folder.color }}
                aria-hidden
              />
              <span className="min-w-0 truncate text-sm">{folder.name}</span>
            </div>
          ))}
        </div>

        <ul className="divide-y rounded-xl border">
          {files.map((file) => (
            // Wraps, like the full demo's rows: the named chips need width, and
            // the thing that must not lose it is the filename. `min-w-32` gives
            // the name a floor, which is what makes the line break at all — a
            // `flex-1` item's hypothetical size is its basis (0), so the row
            // would otherwise stay on one line with the name squeezed to
            // nothing.
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="shrink-0 text-muted-foreground">
                {attachmentGlyph(file.contentType, "size-4")}
              </span>
              <span className="min-w-32 flex-1 truncate">{file.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {file.tags.map((tag) => (
                  <DemoTagChip key={tag} tag={tag} />
                ))}
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
          {activeTag ? ` tagged ${activeTag}` : " — tap a tag to filter"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Share2 className="size-3.5" /> Share links per file
        </span>
      </div>
    </div>
  );
}
