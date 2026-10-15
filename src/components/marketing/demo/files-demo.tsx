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
  DEMO_FOLDERS,
  DEMO_STORAGE_LIMIT_BYTES,
  DEMO_STORAGE_USED_BYTES,
} from "./demo-data";
import { formatFileSize } from "@/lib/attachments";
import { normalizeVaultQuery, vaultTextMatches } from "@/lib/files";
import { cn } from "@/lib/utils";

/**
 * The files vault: folders, descriptions, two view modes and the storage gauge.
 *
 * The contents — the quota, the folders and the files with their descriptions —
 * come from `demo-data.ts`, because the homepage band (`files-preview.tsx`)
 * shows the same vault at a smaller size. The two components are separate for
 * good reasons (see that file's header); their *data* being separate was just a
 * copy, and the way that fails is a quota raised in one file and not the other.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own — the ring in
 * particular is worth reusing rather than redrawing, because its arc, its
 * colour tone thresholds and its compact "0.1/1 GB" label are all logic that
 * would rot in a copy. So is the search rule (`vaultTextMatches`): a name or a
 * description, the same as the app. Opening a folder, searching and switching
 * views run on the seed array; nothing is uploaded, stored or fetched.
 *
 * The toolbar follows the app's own rule for the same row of controls
 * (`components/app/files/files-page.tsx`): the search field has a fixed width
 * and the row wraps. See the note on it below — the page this demo sits on
 * tells the visitor to search, so the field is the one thing in the row that
 * must not be allowed to collapse.
 */

export function FilesDemo() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const needle = normalizeVaultQuery(query);

  // A search runs across every folder, like the app's; otherwise an open
  // folder narrows the list to what's in it.
  const files = useMemo(
    () =>
      DEMO_FILES.filter((file) =>
        needle
          ? vaultTextMatches(needle, [file.name, file.description])
          : !openFolder || file.folder === openFolder,
      ),
    [needle, openFolder],
  );

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
                placeholder="Search names, descriptions"
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

        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
          <span>
            {files.length} file{files.length === 1 ? "" : "s"}
            {needle ? ` matching “${query.trim()}”` : openFolder ? ` in ${openFolder}` : ""}
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
        {/* Folders first, tinted with their own colour — the vault's shape.
            Pressing one opens it: the files below narrow to what's inside. */}
        {!needle && (
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
        )}

        {files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
            <Folder className="size-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">No matches</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Try another word from a name or a description.
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
                <div className="space-y-0.5">
                  <p className="line-clamp-2 text-sm leading-snug break-words">{file.name}</p>
                  <p className="line-clamp-2 text-xs break-words text-muted-foreground">
                    {file.description}
                  </p>
                </div>
                <span className="mt-auto text-right text-xs tabular-nums text-muted-foreground">
                  {formatFileSize(file.bytes)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {files.map((file) => (
              // The name and its description share one column that takes the
              // spare width; `min-w-0` lets both truncate instead of pushing
              // the size off the row on a phone.
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
