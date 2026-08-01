"use client";

import { useState } from "react";
import { Download, Eye, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attachmentDownloadUrl, formatFileSize } from "@/lib/attachments";
import {
  FILE_CATEGORY_LABELS,
  SYSTEM_FOLDER_NOTICE,
  fileDownloadUrl,
  fileTypeLabel,
  type FileDTO,
  type FolderDTO,
  type TxnFileDTO,
} from "@/lib/files";
import { cn } from "@/lib/utils";
import {
  FileThumb,
  FolderGlyph,
  TagChips,
  TxnAmount,
  VaultContextMenu,
  VaultEmptyState,
  VaultItemMenu,
  dragSourceProps,
  formatVaultDate,
  useFolderDrop,
  type VaultHandlers,
  type VaultTarget,
} from "./files-views";

type Selected =
  | { kind: "file"; id: string }
  | { kind: "txn"; id: string }
  | null;

/**
 * macOS-Finder / Supabase-storage-style column browser: each column lists one
 * level, separated by vertical rules; clicking a folder opens the next column
 * (pushing the URL, so browser-back walks back up), clicking a file shows a
 * detail column. Every row carries the shared context menu — right-click, or
 * the ⋮ button that appears on hover.
 */
export function FilesColumnView({
  folders,
  files,
  txnFiles,
  handlers,
  path,
  onNavigate,
  filtering = false,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  txnFiles: TxnFileDTO[];
  handlers: VaultHandlers;
  /** Folder ids from root to the open folder (the breadcrumb chain). */
  path: FolderDTO[];
  onNavigate: (folderId: string | null) => void;
  /** True when a tag filter pruned the tree (affects the empty-state copy). */
  filtering?: boolean;
}) {
  const [selected, setSelected] = useState<Selected>(null);

  // Re-resolve the selection each render so a refresh/rename stays live, and a
  // deleted item clears itself.
  const selectedFile =
    selected?.kind === "file" ? (files.find((f) => f.id === selected.id) ?? null) : null;
  const selectedTxn =
    selected?.kind === "txn" ? (txnFiles.find((t) => t.id === selected.id) ?? null) : null;

  if (folders.length === 0 && files.length === 0 && txnFiles.length === 0) {
    return <VaultEmptyState searching={filtering} canWrite={handlers.canWrite} />;
  }

  // Column N shows the children of path[N-1]; column 0 shows the roots.
  const levels: { parent: FolderDTO | null }[] = [
    { parent: null },
    ...path.map((folder) => ({ parent: folder })),
  ];

  const childFolders = (parent: FolderDTO | null) => {
    const children = folders.filter((f) => f.parentId === (parent?.id ?? null));
    return [...children.filter((f) => f.system), ...children.filter((f) => !f.system)];
  };
  const childFiles = (parent: FolderDTO | null) =>
    parent?.system ? [] : files.filter((f) => f.folderId === (parent?.id ?? null));
  const childTxns = (parent: FolderDTO | null) =>
    parent?.system ? txnFiles.filter((t) => t.profileId === parent.profileId) : [];

  const openFolder = (folder: FolderDTO) => {
    setSelected(null);
    onNavigate(folder.id);
  };
  const selectFile = (parent: FolderDTO | null, file: FileDTO) => {
    // Truncate any deeper columns to this file's level (Finder behavior).
    if ((parent?.id ?? null) !== (path[path.length - 1]?.id ?? null)) {
      onNavigate(parent?.id ?? null);
    }
    setSelected({ kind: "file", id: file.id });
  };
  const selectTxn = (parent: FolderDTO, txn: TxnFileDTO) => {
    if (parent.id !== (path[path.length - 1]?.id ?? null)) onNavigate(parent.id);
    setSelected({ kind: "txn", id: txn.id });
  };

  // The predefined folder's explainer pins to the bottom of the browser (it
  // must stay visible however far the column scrolls) whenever that folder is
  // open in the path.
  const systemOpen = path.some((f) => f.system);

  return (
    // Fills the viewport below the toolbar (topbar + bottom nav on mobile),
    // so the column rules run the full height of the screen.
    <div className="flex h-[calc(100svh-17.5rem)] min-h-96 flex-col overflow-hidden rounded-lg border bg-background md:h-[calc(100svh-9.75rem)]">
      <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {levels.map(({ parent }, i) => (
          <Column
            key={parent?.id ?? "root"}
            parent={parent}
            folders={childFolders(parent)}
            files={childFiles(parent)}
            txns={childTxns(parent)}
            activeFolderId={path[i]?.id ?? null}
            selectedItemId={selectedFile?.id ?? selectedTxn?.id ?? null}
            handlers={handlers}
            onOpenFolder={openFolder}
            onSelectFile={(file) => selectFile(parent, file)}
            onSelectTxn={(txn) => parent && selectTxn(parent, txn)}
          />
        ))}
        {selectedFile ? <FileDetail file={selectedFile} handlers={handlers} /> : null}
        {selectedTxn ? <TxnDetail txn={selectedTxn} handlers={handlers} /> : null}
      </div>
      {systemOpen ? (
        <p className="flex shrink-0 items-start gap-2 border-t bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          {SYSTEM_FOLDER_NOTICE}
        </p>
      ) : null}
    </div>
  );
}

const ROW =
  "group/row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-6 transition-colors hover:bg-accent/50";

/** The ⋮ button on a column row — appears on hover (and on the active row). */
function RowMenu({
  target,
  handlers,
  visible,
}: {
  target: VaultTarget;
  handlers: VaultHandlers;
  visible: boolean;
}) {
  return (
    <span
      className={cn(
        "-my-1 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100",
        visible && "opacity-100",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <VaultItemMenu target={target} handlers={handlers} />
    </span>
  );
}

function Column({
  parent,
  folders,
  files,
  txns,
  activeFolderId,
  selectedItemId,
  handlers,
  onOpenFolder,
  onSelectFile,
  onSelectTxn,
}: {
  parent: FolderDTO | null;
  folders: FolderDTO[];
  files: FileDTO[];
  txns: TxnFileDTO[];
  /** The folder of this column the path continues into (highlighted). */
  activeFolderId: string | null;
  selectedItemId: string | null;
  handlers: VaultHandlers;
  onOpenFolder: (folder: FolderDTO) => void;
  onSelectFile: (file: FileDTO) => void;
  onSelectTxn: (txn: TxnFileDTO) => void;
}) {
  // Empty space in a column drops into that column's folder (or the root).
  const { over, dropProps } = useFolderDrop(parent?.id ?? null, handlers, parent?.system ?? false);
  const empty = folders.length === 0 && files.length === 0 && txns.length === 0;

  return (
    <div
      className={cn(
        // The right rule stays on the LAST column too — the browser always
        // ends in a vertical line (1 at the root, one more per open level).
        "flex w-60 shrink-0 flex-col gap-px overflow-y-auto border-r p-1.5",
        over && "bg-accent/20",
      )}
      {...dropProps}
    >
      {folders.map((folder) => (
        <FolderColumnRow
          key={folder.id}
          folder={folder}
          active={folder.id === activeFolderId}
          handlers={handlers}
          onOpen={() => onOpenFolder(folder)}
        />
      ))}
      {files.map((file) => (
        <VaultContextMenu key={file.id} target={{ kind: "file", file }} handlers={handlers}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFile(file)}
            onDoubleClick={() => handlers.previewFile(file)}
            onKeyDown={(e) => e.key === "Enter" && onSelectFile(file)}
            className={cn(ROW, file.id === selectedItemId && "bg-accent text-accent-foreground")}
            {...dragSourceProps({ kind: "file", id: file.id }, handlers.canWrite)}
          >
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
              <FileThumb
                id={file.id}
                contentType={file.contentType}
                hasThumbnail={file.hasThumbnail}
                source="file"
                glyphClass="size-3"
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <RowMenu
              target={{ kind: "file", file }}
              handlers={handlers}
              visible={file.id === selectedItemId}
            />
          </div>
        </VaultContextMenu>
      ))}
      {txns.map((txn) => (
        <VaultContextMenu key={txn.id} target={{ kind: "txn", txn }} handlers={handlers}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectTxn(txn)}
            onDoubleClick={() => handlers.previewTxn(txn)}
            onKeyDown={(e) => e.key === "Enter" && onSelectTxn(txn)}
            className={cn(ROW, txn.id === selectedItemId && "bg-accent text-accent-foreground")}
          >
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
              <FileThumb
                id={txn.id}
                contentType={txn.contentType}
                hasThumbnail={txn.hasThumbnail}
                source="attachment"
                glyphClass="size-3"
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{txn.name}</span>
            <RowMenu
              target={{ kind: "txn", txn }}
              handlers={handlers}
              visible={txn.id === selectedItemId}
            />
          </div>
        </VaultContextMenu>
      ))}
      {empty && !parent?.system ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">Empty folder</p>
      ) : null}
    </div>
  );
}

function FolderColumnRow({
  folder,
  active,
  handlers,
  onOpen,
}: {
  folder: FolderDTO;
  active: boolean;
  handlers: VaultHandlers;
  onOpen: () => void;
}) {
  const { over, dropProps } = useFolderDrop(folder.id, handlers, folder.system);
  return (
    <VaultContextMenu target={{ kind: "folder", folder }} handlers={handlers}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        className={cn(
          ROW,
          active && "bg-accent text-accent-foreground",
          over && "ring-2 ring-ring",
        )}
        {...dragSourceProps(
          { kind: "folder", id: folder.id },
          handlers.canWrite && !folder.system,
        )}
        {...dropProps}
      >
        <FolderGlyph folder={folder} className="size-4" />
        <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
        {handlers.allProfiles && handlers.profileLabel(folder.profileId) ? (
          <Badge variant="outline" className="max-w-20 truncate px-1 py-0 text-[10px] font-normal">
            {handlers.profileLabel(folder.profileId)}
          </Badge>
        ) : null}
        <RowMenu target={{ kind: "folder", folder }} handlers={handlers} visible={active} />
      </div>
    </VaultContextMenu>
  );
}

function DetailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-64 shrink-0 space-y-3 overflow-y-auto border-l bg-muted/20 p-3">
      {children}
    </div>
  );
}

function FileDetail({ file, handlers }: { file: FileDTO; handlers: VaultHandlers }) {
  return (
    <DetailShell>
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-background">
        <FileThumb
          id={file.id}
          contentType={file.contentType}
          hasThumbnail={file.hasThumbnail}
          source="file"
          glyphClass="size-10"
        />
      </div>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {fileTypeLabel(file.contentType)} · {formatFileSize(file.sizeBytes)}
          </p>
        </div>
        <VaultItemMenu target={{ kind: "file", file }} handlers={handlers} />
      </div>
      <dl className="space-y-1 text-xs text-muted-foreground">
        <div>Added {formatVaultDate(file.createdAt, handlers.locale)}</div>
        {file.uploaderName ? <div>By {file.uploaderName}</div> : null}
        {file.category ? <div>{FILE_CATEGORY_LABELS[file.category]}</div> : null}
      </dl>
      <TagChips tagIds={file.tagIds} handlers={handlers} max={5} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => handlers.previewFile(file)}>
          <Eye className="size-4" /> Preview
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={fileDownloadUrl(file.id)}>
            <Download className="size-4" /> Download
          </a>
        </Button>
      </div>
    </DetailShell>
  );
}

function TxnDetail({ txn, handlers }: { txn: TxnFileDTO; handlers: VaultHandlers }) {
  return (
    <DetailShell>
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-background">
        <FileThumb
          id={txn.id}
          contentType={txn.contentType}
          hasThumbnail={txn.hasThumbnail}
          source="attachment"
          glyphClass="size-10"
        />
      </div>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{txn.name}</p>
          <p className="text-xs text-muted-foreground">
            {fileTypeLabel(txn.contentType)} · {formatFileSize(txn.sizeBytes)}
          </p>
        </div>
        <VaultItemMenu target={{ kind: "txn", txn }} handlers={handlers} />
      </div>
      <dl className="space-y-1 text-xs text-muted-foreground">
        <div>
          {txn.txnTitle || "Transaction"} · <TxnAmount txn={txn} handlers={handlers} />
        </div>
        <div>{formatVaultDate(txn.txnOccurredOn, handlers.locale)}</div>
      </dl>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => handlers.previewTxn(txn)}>
          <Eye className="size-4" /> Preview
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={attachmentDownloadUrl(txn.id)}>
            <Download className="size-4" /> Download
          </a>
        </Button>
      </div>
    </DetailShell>
  );
}
