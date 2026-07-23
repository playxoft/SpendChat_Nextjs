"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { attachmentGlyph } from "./attachment-icon";
import {
  attachmentDisplayName,
  attachmentDownloadUrl,
  attachmentTypeLabel,
  attachmentViewUrl,
  isImageContentType,
} from "@/lib/attachments";
import { ATTACHMENT_SPREADSHEET_TYPES } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** What the viewer needs to render + fetch an attachment. */
export type ViewerAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  label?: string | null;
};

const ViewerContext = createContext<((a: ViewerAttachment) => void) | null>(null);

/** Open an attachment in the shared full-screen preview. */
export function useAttachmentViewer(): (a: ViewerAttachment) => void {
  const open = useContext(ViewerContext);
  if (!open) {
    throw new Error("useAttachmentViewer must be used within <AttachmentViewerProvider>");
  }
  return open;
}

/**
 * Renders one full-screen preview for the whole app tree and exposes `open()` via
 * context, so a feed bubble, a table popover, or the edit dialog all open a file
 * in-page (never a new tab). Images/PDF/CSV/text render inline; other office docs
 * fall back to a download card. Bytes come from the authenticated, same-origin
 * `/api/attachments/:id` route (proxied so the frame isn't cross-origin).
 */
export function AttachmentViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ViewerAttachment | null>(null);
  const open = useCallback((a: ViewerAttachment) => setItem(a), []);

  return (
    <ViewerContext.Provider value={open}>
      {children}
      <AttachmentPreview item={item} onClose={() => setItem(null)} />
    </ViewerContext.Provider>
  );
}

const ICON_BTN =
  "inline-flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none";

function AttachmentPreview({
  item,
  onClose,
}: {
  item: ViewerAttachment | null;
  onClose: () => void;
}) {
  const name = item
    ? attachmentDisplayName({ label: item.label ?? null, fileName: item.fileName })
    : "";
  const isImage = item ? isImageContentType(item.contentType) : false;
  const isPdf = item?.contentType === "application/pdf";
  const embeds = isImage || isPdf;

  // Spinner for the embedded <img>/<iframe> until it loads; reset per file
  // (adjust-state-during-render — no effect needed).
  const [loading, setLoading] = useState(true);
  const [seenId, setSeenId] = useState<string | null>(item?.id ?? null);
  if ((item?.id ?? null) !== seenId) {
    setSeenId(item?.id ?? null);
    setLoading(true);
  }

  return (
    <DialogPrimitive.Root open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        {/* Full-screen Google-Drive-style chrome: a slim top bar with the file
            name and icon actions, then the document filling the rest. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        >
          {item ? (
            <>
              <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>

              <div className="flex shrink-0 items-center gap-3 px-3 py-2 sm:px-4">
                <div className="min-w-0 flex-1 text-white">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="truncate text-xs text-white/60">
                    {attachmentTypeLabel(item.contentType)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <a
                    href={attachmentViewUrl(item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in new tab"
                    title="Open in new tab"
                    className={ICON_BTN}
                  >
                    <ExternalLink className="size-5" aria-hidden />
                  </a>
                  <a
                    href={attachmentDownloadUrl(item.id)}
                    aria-label="Download"
                    title="Download"
                    className={ICON_BTN}
                  >
                    <Download className="size-5" aria-hidden />
                  </a>
                  <DialogPrimitive.Close aria-label="Close" title="Close" className={ICON_BTN}>
                    <X className="size-5" aria-hidden />
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                {embeds && loading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-9 animate-spin text-white/70" aria-label="Loading" />
                  </div>
                ) : null}

                {isImage ? (
                  <div className="flex size-full items-center justify-center p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachmentViewUrl(item.id)}
                      alt={name}
                      onLoad={() => setLoading(false)}
                      onError={() => setLoading(false)}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : isPdf ? (
                  <iframe
                    src={attachmentViewUrl(item.id)}
                    title={name}
                    onLoad={() => setLoading(false)}
                    className="size-full border-0"
                  />
                ) : (
                  <DataFilePreview key={item.id} item={item} />
                )}
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Preview for the non-embedded types: CSV/plain text and Excel render as a
 * table (fetched same-origin, Excel parsed client-side); everything else (Word)
 * shows a download card. Keyed by id so it refetches per file. */
function DataFilePreview({ item }: { item: ViewerAttachment }) {
  const isCsv = item.contentType === "text/csv";
  const isText = item.contentType === "text/plain";

  if (isCsv || isText) {
    return <TextTablePreview id={item.id} asTable={isCsv} />;
  }
  if (ATTACHMENT_SPREADSHEET_TYPES.has(item.contentType)) {
    return <ExcelPreview item={item} />;
  }
  return <DownloadCard item={item} />;
}

/** Fallback panel for a file we can't render inline. */
function DownloadCard({ item }: { item: ViewerAttachment }) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-background p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
          {attachmentGlyph(item.contentType, "size-7")}
        </div>
        <p className="text-sm text-muted-foreground">
          Previews aren’t available for {attachmentTypeLabel(item.contentType)} files yet.
          Download it to view.
        </p>
        <a
          href={attachmentDownloadUrl(item.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Download className="size-4" aria-hidden /> Download
        </a>
      </div>
    </div>
  );
}

const MAX_PREVIEW_ROWS = 500;

/** A very small CSV parser (quoted fields, escaped quotes, CRLF), capped so a
 * huge file can't lock the tab. Returns rows of string cells. */
function parseCsv(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (rows.length < maxRows && (field.length > 0 || row.length > 0)) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function TextTablePreview({ id, asTable }: { id: string; asTable: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; text: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(attachmentViewUrl(id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!cancelled) setState({ status: "ready", text });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-9 animate-spin text-white/70" aria-label="Loading" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex size-full items-center justify-center p-6 text-center text-sm text-white/80">
        Couldn’t load this file’s preview.
      </div>
    );
  }

  return (
    <div className="flex size-full justify-center overflow-auto p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-xl border bg-background">
        {asTable ? (
          <CsvTable text={state.text} />
        ) : (
          <pre className="max-h-full overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {state.text.slice(0, 200_000)}
          </pre>
        )}
      </div>
    </div>
  );
}

function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text, MAX_PREVIEW_ROWS);
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">This file is empty.</p>;
  }
  return <SheetTable rows={rows} truncated={rows.length >= MAX_PREVIEW_ROWS} />;
}

/** Renders tabular data (first row = header). Shared by the CSV preview and the
 * Excel preview (which feeds it parsed sheet rows). */
export function SheetTable({ rows, truncated }: { rows: string[][]; truncated: boolean }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">This sheet is empty.</p>;
  }
  const [header, ...body] = rows;
  const cols = header!.length;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {header!.map((cell, i) => (
              <th
                key={i}
                className="border-b px-3 py-2 text-left font-medium whitespace-nowrap text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="even:bg-muted/30">
              {Array.from({ length: cols }, (_, ci) => (
                <td key={ci} className="border-b px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {r[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated ? (
        <p className="p-3 text-center text-xs text-muted-foreground">
          Showing the first {MAX_PREVIEW_ROWS} rows — download the file for the rest.
        </p>
      ) : null}
    </div>
  );
}

const MAX_PREVIEW_COLS = 60;

type ParsedSheet = { name: string; rows: string[][]; truncated: boolean };

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toLocaleDateString();
  return String(cell);
}

/** Excel preview: fetches the file same-origin, parses it with `read-excel-file`
 * (lazy-loaded), and renders each sheet through `SheetTable` with sheet tabs.
 * Old binary `.xls` (which the parser doesn't support) falls back to download. */
function ExcelPreview({ item }: { item: ViewerAttachment }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "unsupported" } | { status: "ready"; sheets: ParsedSheet[] }
  >({ status: "loading" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(attachmentViewUrl(item.id));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const parsed = await readXlsxFile(blob);
        const sheets: ParsedSheet[] = parsed.map((s) => ({
          name: s.sheet,
          truncated: s.data.length > MAX_PREVIEW_ROWS,
          rows: s.data
            .slice(0, MAX_PREVIEW_ROWS)
            .map((r) => r.slice(0, MAX_PREVIEW_COLS).map(cellToString)),
        }));
        if (!cancelled) setState({ status: "ready", sheets: sheets.length ? sheets : [] });
      } catch {
        // .xls binary / unreadable → offer a download instead.
        if (!cancelled) setState({ status: "unsupported" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  if (state.status === "loading") {
    return (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-9 animate-spin text-white/70" aria-label="Loading" />
      </div>
    );
  }
  if (state.status === "unsupported" || state.sheets.length === 0) {
    return <DownloadCard item={item} />;
  }

  const current = state.sheets[Math.min(active, state.sheets.length - 1)]!;
  return (
    <div className="flex size-full flex-col gap-2 p-4">
      {state.sheets.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {state.sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                i === active
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/80 hover:bg-white/20",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
        <SheetTable rows={current.rows} truncated={current.truncated} />
      </div>
    </div>
  );
}
