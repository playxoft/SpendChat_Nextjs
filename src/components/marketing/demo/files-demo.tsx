"use client";

import { useMemo, useState } from "react";
import { Folder, Grid2x2, List, Search, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { StorageRing } from "@/components/app/files/storage-ring";
import { DemoFrame } from "./demo-frame";
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
 * The files vault: folders, colour tags, two view modes and the storage gauge.
 *
 * The contents — the quota, the tags, the folders and the files — come from
 * `demo-data.ts`, because the homepage band (`files-preview.tsx`) shows the
 * same vault at a smaller size. The two components are separate for good
 * reasons (see that file's header); their *data* being separate was just a
 * copy, and the way that fails is a quota raised in one file and not the other.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own — the ring in
 * particular is worth reusing rather than redrawing, because its arc, its
 * colour tone thresholds and its compact "0.1/1 GB" label are all logic that
 * would rot in a copy. Filtering by tag and switching views run on the seed
 * array; nothing is uploaded, stored or fetched.
 *
 * The toolbar follows the app's own rule for the same row of controls
 * (`components/app/files/files-page.tsx`): the search field has a fixed width
 * and the row wraps. See the note on it below — the page this demo sits on
 * tells the visitor to search, so the field is the one thing in the row that
 * must not be allowed to collapse.
 */

/**
 * A tag as the vault draws it: the swatch, and the name beside it.
 *
 * The swatch on its own used to be the whole chip, in both this demo and the
 * homepage band — which meant a screen reader read "Client invoice 0042.pdf,
 * 186 KB" with no tags at all, and a reader who can't separate green from amber
 * couldn't tell two tags apart either. The row is the only place a file's tags
 * are stated (the filter chips above carry their own `aria-pressed`), so the
 * name has to be in it: colour can decorate the fact, it can't be the fact
 * (WCAG 1.4.1).
 *
 * Shaped after the app's own `TagChip` (`components/app/files/vault-tags.tsx`)
 * rather than imported from it — that module brings the tag dialogs, a dropdown
 * menu, `sonner` and three server actions with it, none of which belong in a
 * marketing bundle. Two deliberate differences: the label is `text-xs`, because
 * these rows are denser than the app's table, and it keeps the inherited
 * foreground colour rather than the swatch's, because several of the vault's
 * swatches (amber above all) are nowhere near 4.5:1 as text on their own tint —
 * the dot and the tint carry the colour, the text carries the contrast.
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

export function FilesDemo() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DEMO_FILES.filter((file) => {
      if (activeTag && !file.tags.includes(activeTag)) return false;
      if (needle && !file.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [activeTag, query]);

  return (
    <DemoFrame
      label="Interactive files vault demo"
      active="/app/files"
      className="h-[38rem]"
      header={
        <div className="shrink-0 space-y-2 border-b px-4 py-3">
          {/* `flex-wrap` plus a fixed-width field, which is exactly how the
              app's files toolbar survives a phone. It used to be a `flex-1`
              search among `shrink-0` siblings, and flex-basis 0 means the
              field is the only thing that gives: at 375px it came out around
              44px wide, 32 of which the magnifier's `pl-8` had already taken,
              and at 320px the row simply overflowed and was clipped by
              `DemoFrame`'s `overflow-hidden`. A demo captioned "search" has to
              leave something to search in, so the field keeps its width and
              whatever doesn't fit beside it moves to a second line. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files"
                aria-label="Search files"
                className="h-8 w-44 pl-8 sm:w-56"
              />
            </div>
            <div className="inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  aria-label={`${v} view`}
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 transition-colors",
                    view === v
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "grid" ? (
                    <Grid2x2 className="size-4" />
                  ) : (
                    <List className="size-4" />
                  )}
                </button>
              ))}
            </div>
            {/*
              Part of the replica chrome, like the CSV button on the
              transactions demo: it says what the toolbar holds without
              offering a control that goes nowhere. `inert` takes it out of the
              tab order too, so a keyboard visitor doesn't land on a button
              that swallows the keystroke.
            */}
            <Button
              inert
              variant="outline"
              size="sm"
              className="pointer-events-none h-8 shrink-0 gap-1.5 opacity-60"
            >
              <Upload className="size-3.5" /> Upload
            </Button>
            <StorageRing
              usedBytes={DEMO_STORAGE_USED_BYTES}
              limitBytes={DEMO_STORAGE_LIMIT_BYTES}
            />
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
            {DEMO_FILE_TAGS.map((tag) => {
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
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
          <span>
            {files.length} file{files.length === 1 ? "" : "s"}
            {activeTag && ` tagged ${activeTag}`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Share2 className="size-3.5" /> Share links available per file
          </span>
        </div>
      }
    >
      <div
        tabIndex={0}
        role="group"
        aria-label="Files and folders"
        className="h-full space-y-3 overflow-y-auto px-4 py-3"
      >
        {/* Folders first, tinted with their own colour — the vault's shape. */}
        {!activeTag && !query && (
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
        )}

        {files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
            <Folder className="size-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">No matches</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Try another tag, or clear the search.
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-2 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
              >
                <span className="text-muted-foreground">
                  {attachmentGlyph(file.contentType, "size-5")}
                </span>
                <p className="line-clamp-2 text-sm leading-snug break-words">{file.name}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {file.tags.map((tag) => (
                    <DemoTagChip key={tag} tag={tag} />
                  ))}
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {formatFileSize(file.bytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {files.map((file) => (
              // Named tags need real width, so the row wraps rather than
              // squeezing the filename out of it: on a phone the chips and the
              // size drop to a second line under the name. `min-w-32` on the
              // name is what forces that break — a `flex-1` item's hypothetical
              // size is its basis (0), so without a floor the line always
              // "fits" and the name is the thing that shrinks to nothing.
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
                <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {file.modified}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DemoFrame>
  );
}
