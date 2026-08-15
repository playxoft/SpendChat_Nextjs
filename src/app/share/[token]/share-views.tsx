"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  LayoutGrid,
  List,
  MessageSquare,
} from "lucide-react";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { formatFileSize } from "@/lib/attachments";
import {
  fileTypeLabel,
  rendersInBrowser,
  shareFileThumbUrl,
  shareFileUrl,
} from "@/lib/files";
import type {
  SharedFilePublic,
  SharedFolderPublic,
  SharedTagPublic,
} from "@/services/files";
import { cn } from "@/lib/utils";

/**
 * The public folder-share browser: the same three views as the app's vault
 * (grid / list / chat feed), read-only — folders navigate, files open inline
 * in a new tab when previewable, and download links appear only when the link
 * allows them.
 */
export function SharedFolderBrowser({
  token,
  rootId,
  rootName,
  folders,
  files,
  tags,
  allowDownload,
}: {
  token: string;
  rootId: string;
  rootName: string;
  folders: SharedFolderPublic[];
  files: SharedFilePublic[];
  tags: SharedTagPublic[];
  allowDownload: boolean;
}) {
  const [view, setView] = useState<"grid" | "list" | "chat">("grid");
  const [currentId, setCurrentId] = useState(rootId);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const current = folderById.get(currentId) ?? { id: rootId, parentId: null, name: rootName };
  const subFolders = folders.filter((f) => f.parentId === current.id);
  const subFiles = files.filter((f) => f.folderId === current.id);

  const breadcrumbs = useMemo(() => {
    const chain: { id: string; name: string }[] = [];
    let cursor: SharedFolderPublic | undefined = folderById.get(currentId);
    let guard = 0;
    while (cursor && guard++ < 20) {
      chain.unshift({ id: cursor.id, name: cursor.name });
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
    return chain;
  }, [currentId, folderById]);

  const chips = (tagIds: string[]) => {
    const resolved = tagIds
      .map((id) => tagById.get(id))
      .filter((t): t is SharedTagPublic => t != null)
      .slice(0, 3);
    if (resolved.length === 0) return null;
    return (
      <span className="flex flex-wrap gap-1">
        {resolved.map((t) => (
          <span
            key={t.id}
            className="inline-flex max-w-28 items-center gap-1 truncate rounded-full border px-1.5 py-px text-sm font-medium"
            style={{
              color: t.color,
              borderColor: `${t.color}55`,
              backgroundColor: `${t.color}1a`,
            }}
          >
            {t.name}
          </span>
        ))}
      </span>
    );
  };

  // Opening a file is a top-level navigation, so the test is "will the browser
  // *render* this", not "is it on the inline allowlist": a `.avi` or `.wmv` no
  // engine decodes gets saved to disk instead of shown, which a view-only link
  // must not do. Those fall to the download link, or to nothing at all — the
  // route enforces the same rule, so a hand-built URL doesn't get further.
  const fileHref = (file: SharedFilePublic) =>
    rendersInBrowser(file.contentType)
      ? shareFileUrl(token, file.id)
      : allowDownload
        ? shareFileUrl(token, file.id, true)
        : null;

  const thumb = (file: SharedFilePublic, glyphClass: string) =>
    file.hasThumbnail ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={shareFileThumbUrl(token, file.id)}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    ) : (
      <span className="text-muted-foreground">{attachmentGlyph(file.contentType, glyphClass)}</span>
    );

  const downloadBtn = (file: SharedFilePublic) =>
    allowDownload ? (
      <a
        href={shareFileUrl(token, file.id, true)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={`Download ${file.name}`}
        title="Download"
      >
        <Download className="size-4" aria-hidden />
      </a>
    ) : null;

  const openFile = (file: SharedFilePublic) => {
    const href = fileHref(file);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Toolbar: breadcrumbs + view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setCurrentId(rootId)}
            className={cn(
              "max-w-40 truncate rounded px-1 py-0.5 hover:text-foreground",
              currentId === rootId ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {rootName}
          </button>
          {breadcrumbs
            .filter((c) => c.id !== rootId)
            .map((crumb, i, arr) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                <button
                  type="button"
                  onClick={() => setCurrentId(crumb.id)}
                  className={cn(
                    "max-w-40 truncate rounded px-1 py-0.5 hover:text-foreground",
                    i === arr.length - 1 ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
        </nav>
        <div className="flex rounded-lg border p-0.5">
          {(
            [
              { v: "grid", label: "Grid", Icon: LayoutGrid },
              { v: "list", label: "List", Icon: List },
              { v: "chat", label: "Chat", Icon: MessageSquare },
            ] as const
          ).map(({ v, label, Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-label={`${label} view`}
              title={`${label} view`}
              aria-pressed={view === v}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-muted-foreground",
                view === v && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {view === "chat" ? (
        <ShareChatFeed
          token={token}
          files={files}
          folderById={folderById}
          rootName={rootName}
          rootId={rootId}
          allowDownload={allowDownload}
          openFile={openFile}
          thumb={thumb}
          downloadBtn={downloadBtn}
        />
      ) : subFolders.length === 0 && subFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          This folder is empty.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {subFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setCurrentId(folder.id)}
              className="flex w-full flex-col gap-2 rounded-xl border bg-card p-2.5 text-left transition-colors hover:bg-accent/40"
            >
              <span className="flex h-20 items-center justify-center rounded-lg border bg-muted/40">
                <Folder
                  className={cn("size-10", folder.color ? "" : "text-muted-foreground")}
                  style={folder.color ? { color: folder.color } : undefined}
                  fill={folder.color ? `${folder.color}2e` : "none"}
                  aria-hidden
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{folder.name}</span>
                {chips(folder.tagIds)}
              </span>
            </button>
          ))}
          {subFiles.map((file) => (
            <div
              key={file.id}
              role="button"
              tabIndex={0}
              onClick={() => openFile(file)}
              onKeyDown={(e) => e.key === "Enter" && openFile(file)}
              className="flex w-full flex-col gap-2 rounded-xl border bg-card p-2.5 text-left transition-colors hover:bg-accent/40"
            >
              <span className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {thumb(file, "size-8")}
              </span>
              <span className="flex items-start justify-between gap-1">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fileTypeLabel(file.contentType)} · {formatFileSize(file.sizeBytes)}
                  </span>
                  {chips(file.tagIds)}
                </span>
                {downloadBtn(file)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {subFolders.map((folder) => (
                <tr
                  key={folder.id}
                  onClick={() => setCurrentId(folder.id)}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Folder
                        className={cn("size-4 shrink-0", folder.color ? "" : "text-muted-foreground")}
                        style={folder.color ? { color: folder.color } : undefined}
                        fill={folder.color ? `${folder.color}2e` : "none"}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{folder.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">{chips(folder.tagIds)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2" />
                </tr>
              ))}
              {subFiles.map((file) => (
                <tr
                  key={file.id}
                  onClick={() => openFile(file)}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                        {thumb(file, "size-4")}
                      </span>
                      <span className="truncate font-medium">{file.name}</span>
                      {rendersInBrowser(file.contentType) ? (
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">{chips(file.tagIds)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {formatFileSize(file.sizeBytes)}
                  </td>
                  <td className="px-3 py-2">{downloadBtn(file)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Chat view: every shared file as one oldest-first, day-grouped feed, each
 * bubble labeled with the folder it lives in. */
function ShareChatFeed({
  token,
  files,
  folderById,
  rootName,
  rootId,
  openFile,
  thumb,
  downloadBtn,
}: {
  token: string;
  files: SharedFilePublic[];
  folderById: Map<string, SharedFolderPublic>;
  rootName: string;
  rootId: string;
  allowDownload: boolean;
  openFile: (file: SharedFilePublic) => void;
  thumb: (file: SharedFilePublic, glyphClass: string) => React.ReactNode;
  downloadBtn: (file: SharedFilePublic) => React.ReactNode;
}) {
  void token;
  const days = useMemo(() => {
    const sorted = [...files].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const grouped: { label: string; items: SharedFilePublic[] }[] = [];
    for (const file of sorted) {
      const label = new Date(file.createdAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const last = grouped[grouped.length - 1];
      if (last && last.label === label) last.items.push(file);
      else grouped.push({ label, items: [file] });
    }
    return grouped;
  }, [files]);

  const folderLabel = (file: SharedFilePublic) => {
    if (!file.folderId || file.folderId === rootId) return rootName;
    return folderById.get(file.folderId)?.name ?? rootName;
  };

  if (days.length === 0) {
    return (
      <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        This folder is empty.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {days.map((day) => (
        <div key={day.label} className="space-y-2">
          <div className="flex justify-center">
            <span className="rounded-full border bg-background px-3 py-0.5 text-xs text-muted-foreground">
              {day.label}
            </span>
          </div>
          {day.items.map((file) => (
            <div
              key={file.id}
              role="button"
              tabIndex={0}
              onClick={() => openFile(file)}
              onKeyDown={(e) => e.key === "Enter" && openFile(file)}
              className="flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {thumb(file, "size-4")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {fileTypeLabel(file.contentType)} · {formatFileSize(file.sizeBytes)} ·{" "}
                  {folderLabel(file)}
                </span>
              </span>
              {downloadBtn(file)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
