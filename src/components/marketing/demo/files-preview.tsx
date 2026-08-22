"use client";

import { useMemo, useState } from "react";
import { Folder, Share2 } from "lucide-react";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { StorageRing } from "@/components/app/files/storage-ring";
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
 * tinted with their own colour, files carrying tag dots and sizes, and the
 * workspace storage gauge) and drops the rest.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own. The ring especially is
 * worth importing rather than redrawing: its arc, its colour-tone thresholds
 * and its compact "0.1/1 GB" label are all logic that would rot in a copy.
 *
 * Filtering runs on the array below. Nothing is uploaded, stored or fetched,
 * and the panel is a fixed height so filtering to one tag can't move the page.
 */

/** 1 GB per workspace, the real quota. */
const LIMIT_BYTES = 1024 ** 3;
const USED_BYTES = 118_400_000;

/** Drawn from the vault's own swatch list (`VAULT_COLORS`). */
const TAGS = [
  { name: "Receipts", color: "#22c55e" },
  { name: "Invoices", color: "#3b82f6" },
  { name: "Tax", color: "#a855f7" },
] as const;

const FOLDERS = [
  { name: "Transaction attachments", color: "#64748b" },
  { name: "2026 tax", color: "#a855f7" },
  { name: "Home", color: "#0ea5e9" },
] as const;

type VaultFile = {
  id: number;
  name: string;
  contentType: string;
  bytes: number;
  modified: string;
  tags: string[];
};

const FILES: VaultFile[] = [
  { id: 1, name: "Grocery receipt.jpg", contentType: "image/jpeg", bytes: 842_000, modified: "21 Aug", tags: ["Receipts"] },
  { id: 2, name: "Electricity bill July.pdf", contentType: "application/pdf", bytes: 214_000, modified: "18 Aug", tags: ["Invoices"] },
  { id: 3, name: "Client invoice 0042.pdf", contentType: "application/pdf", bytes: 186_000, modified: "15 Aug", tags: ["Invoices", "Tax"] },
  { id: 4, name: "Rent receipt Aug.png", contentType: "image/png", bytes: 640_000, modified: "5 Aug", tags: ["Receipts", "Tax"] },
  { id: 5, name: "Expenses Q2.csv", contentType: "text/csv", bytes: 38_000, modified: "1 Aug", tags: ["Tax"] },
  { id: 6, name: "Pharmacy receipt.jpg", contentType: "image/jpeg", bytes: 402_000, modified: "12 Aug", tags: ["Receipts"] },
];

function tagColor(name: string): string {
  return TAGS.find((t) => t.name === name)?.color ?? "#64748b";
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
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1">
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
        <StorageRing usedBytes={USED_BYTES} limitBytes={LIMIT_BYTES} />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* Folders first, tinted with their own colour — the vault's shape. */}
        <div className="grid gap-2 sm:grid-cols-3">
          {FOLDERS.map((folder) => (
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
            <li key={file.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">
                {attachmentGlyph(file.contentType, "size-4")}
              </span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {file.tags.map((tag) => (
                  <span
                    key={tag}
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: tagColor(tag) }}
                  />
                ))}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
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
