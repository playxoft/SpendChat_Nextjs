"use client";

import { useMemo, useState } from "react";
import { Folder, Grid2x2, List, Search, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { StorageRing } from "@/components/app/files/storage-ring";
import { DemoFrame } from "./demo-frame";
import { formatFileSize } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/** 1 GB per workspace, the real quota. */
const LIMIT_BYTES = 1024 ** 3;

type Tag = { name: string; color: string };

/** Colours are drawn from the vault's own swatch list (`VAULT_COLORS`). */
const TAGS: Tag[] = [
  { name: "Receipts", color: "#22c55e" },
  { name: "Invoices", color: "#3b82f6" },
  { name: "Warranties", color: "#f59e0b" },
  { name: "Tax", color: "#a855f7" },
];

type VaultFile = {
  id: number;
  name: string;
  contentType: string;
  bytes: number;
  modified: string;
  tags: string[];
  folder: string;
};

const FOLDERS = [
  { name: "Transaction attachments", color: "#64748b", system: true },
  { name: "2026 tax", color: "#a855f7", system: false },
  { name: "Home", color: "#0ea5e9", system: false },
];

const FILES: VaultFile[] = [
  { id: 1, name: "Grocery receipt.jpg", contentType: "image/jpeg", bytes: 842_000, modified: "21 Aug", tags: ["Receipts"], folder: "Transaction attachments" },
  { id: 2, name: "Electricity bill July.pdf", contentType: "application/pdf", bytes: 214_000, modified: "18 Aug", tags: ["Invoices"], folder: "Home" },
  { id: 3, name: "Client invoice 0042.pdf", contentType: "application/pdf", bytes: 186_000, modified: "15 Aug", tags: ["Invoices", "Tax"], folder: "2026 tax" },
  { id: 4, name: "Laptop warranty.pdf", contentType: "application/pdf", bytes: 512_000, modified: "9 Aug", tags: ["Warranties"], folder: "Home" },
  { id: 5, name: "Rent receipt Aug.png", contentType: "image/png", bytes: 640_000, modified: "5 Aug", tags: ["Receipts", "Tax"], folder: "2026 tax" },
  { id: 6, name: "Expenses Q2.csv", contentType: "text/csv", bytes: 38_000, modified: "1 Aug", tags: ["Tax"], folder: "2026 tax" },
  { id: 7, name: "Pharmacy receipt.jpg", contentType: "image/jpeg", bytes: 402_000, modified: "12 Aug", tags: ["Receipts"], folder: "Transaction attachments" },
  { id: 8, name: "Insurance policy.pdf", contentType: "application/pdf", bytes: 928_000, modified: "28 Jul", tags: ["Warranties"], folder: "Home" },
];

const USED_BYTES = 118_400_000;

function tagColor(name: string): string {
  return TAGS.find((t) => t.name === name)?.color ?? "#64748b";
}

/**
 * The files vault: folders, colour tags, two view modes and the storage gauge.
 *
 * `StorageRing` and `attachmentGlyph` are the app's own — the ring in
 * particular is worth reusing rather than redrawing, because its arc, its
 * colour tone thresholds and its compact "0.1/1 GB" label are all logic that
 * would rot in a copy. Filtering by tag and switching views run on the array
 * above; nothing is uploaded, stored or fetched.
 */
export function FilesDemo() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FILES.filter((file) => {
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
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files"
                aria-label="Search files"
                className="h-8 w-full pl-8"
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
            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
              <Upload className="size-3.5" /> Upload
            </Button>
            <StorageRing usedBytes={USED_BYTES} limitBytes={LIMIT_BYTES} />
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
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
      <div className="h-full space-y-3 overflow-y-auto px-4 py-3">
        {/* Folders first, tinted with their own colour — the vault's shape. */}
        {!activeTag && !query && (
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
                <div className="mt-auto flex items-center gap-1.5">
                  {file.tags.map((tag) => (
                    <span
                      key={tag}
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: tagColor(tag) }}
                    />
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatFileSize(file.bytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
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
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
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
