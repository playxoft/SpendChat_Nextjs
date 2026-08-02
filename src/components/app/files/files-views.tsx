"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  Download,
  EllipsisVertical,
  Eye,
  Folder,
  FolderOpen,
  FolderInput,
  Link2,
  Lock,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { attachmentGlyph } from "@/components/app/attachments/attachment-icon";
import { attachmentDownloadUrl, attachmentThumbUrl, formatFileSize } from "@/lib/attachments";
import {
  FILE_CATEGORY_LABELS,
  fileDownloadUrl,
  fileThumbUrl,
  fileTypeLabel,
  folderColor,
  type FileDTO,
  type FolderDTO,
  type TagDTO,
  type TxnFileDTO,
} from "@/lib/files";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TagChip } from "./vault-tags";

/** An action the per-item menus can request; download is a plain link. */
export type VaultAction = "edit" | "move" | "share" | "delete";
export type VaultTarget =
  | { kind: "folder"; folder: FolderDTO }
  | { kind: "file"; file: FileDTO }
  | { kind: "txn"; txn: TxnFileDTO };

/** What travels in a drag: enough to identify the item being moved. */
export type DragPayload = { kind: "file" | "folder"; id: string };
export const VAULT_DRAG_MIME = "application/x-spendchat-vault";

/** Everything the presentational views need from the page orchestrator. */
export type VaultHandlers = {
  canWrite: boolean;
  /** True when "All profiles" is active — items then show their profile chip. */
  allProfiles: boolean;
  currency: string;
  locale: string;
  profileLabel: (profileId: string) => string | null;
  tagById: (id: string) => TagDTO | undefined;
  openFolder: (folderId: string) => void;
  previewFile: (file: FileDTO) => void;
  previewTxn: (txn: TxnFileDTO) => void;
  onAction: (action: VaultAction, target: VaultTarget) => void;
  /** Drop/keyboard move: relocate a dragged item into a folder (null = root). */
  moveItem: (payload: DragPayload, folderId: string | null) => void;
  /** OS files dropped onto a folder (or the root) — upload them there. */
  uploadInto: (folderId: string | null, files: File[]) => void;
  /** Signals "a folder tile is the hovered drop target right now", so the
   * page can swap its whole-page drop overlay for the folder's own highlight. */
  folderHover: (over: boolean) => void;
};

export const formatVaultDate = (iso: string, locale: string): string =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

/** Signed, tone-colored amount for a transaction file's context line. */
export function TxnAmount({
  txn,
  handlers,
}: {
  txn: TxnFileDTO;
  handlers: VaultHandlers;
}) {
  const income = txn.txnType === "income";
  return (
    <span className={cn("tabular-nums", income ? "text-emerald-600 dark:text-emerald-500" : "")}>
      {income ? "+" : "−"}
      {formatMoney(txn.txnAmountMinor, handlers.currency, handlers.locale)}
    </span>
  );
}

/** Colored tag labels resolved from the profile's tag entities. */
export function TagChips({
  tagIds,
  handlers,
  max = 2,
  oneLine = false,
}: {
  tagIds: string[];
  handlers: VaultHandlers;
  max?: number;
  /** Never wrap: clip to a single line (pair with a hover tooltip for the rest). */
  oneLine?: boolean;
}) {
  const tags = tagIds
    .map((id) => handlers.tagById(id))
    .filter((t): t is TagDTO => t != null);
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <span
      className={cn(
        "flex items-center gap-1",
        oneLine ? "min-w-0 overflow-hidden" : "flex-wrap",
      )}
    >
      {shown.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
      {tags.length > max ? (
        <span className="shrink-0 text-sm text-muted-foreground">+{tags.length - max}</span>
      ) : null}
    </span>
  );
}

function ProfileChip({ profileId, handlers }: { profileId: string; handlers: VaultHandlers }) {
  if (!handlers.allProfiles) return null;
  const label = handlers.profileLabel(profileId);
  if (!label) return null;
  return (
    <Badge variant="outline" className="max-w-28 truncate px-1.5 py-0 text-sm font-normal">
      {label}
    </Badge>
  );
}

/** A file's visual: its stored thumbnail when one exists, else the type glyph. */
export function FileThumb({
  id,
  contentType,
  hasThumbnail,
  source,
  glyphClass = "size-8",
}: {
  id: string;
  contentType: string;
  hasThumbnail: boolean;
  source: "file" | "attachment";
  glyphClass?: string;
}) {
  if (hasThumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source === "file" ? fileThumbUrl(id) : attachmentThumbUrl(id)}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    );
  }
  return <span className="text-muted-foreground">{attachmentGlyph(contentType, glyphClass)}</span>;
}

/** The folder glyph, painted with the folder's accent (or the default swatch). */
export function FolderGlyph({
  folder,
  className = "size-5",
}: {
  folder: Pick<FolderDTO, "color" | "system">;
  className?: string;
}) {
  const Icon = folder.system ? FolderOpen : Folder;
  const color = folderColor(folder);
  return (
    <Icon
      className={cn("shrink-0", className)}
      style={{ color }}
      fill={`${color}2e`}
      aria-hidden
    />
  );
}

/** Tint for the whole folder widget (card/row), not just the icon. */
export function folderTintStyle(folder: Pick<FolderDTO, "color">): CSSProperties {
  const color = folderColor(folder);
  return { backgroundColor: `${color}14`, borderColor: `${color}45` };
}

/* ------------------------- Drag & drop plumbing ---------------------------- */

/** Drag-source props for a movable item (files + non-system folders). */
export function dragSourceProps(
  payload: DragPayload,
  enabled: boolean,
): Pick<HTMLAttributes<HTMLElement>, "draggable" | "onDragStart"> {
  if (!enabled) return {};
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(VAULT_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

/**
 * Drop-target state + props for a folder (or the root). Accepts two kinds of
 * drags: internal item drags (→ move) and OS file drags from Finder/Explorer
 * (→ upload into that folder, highlighting it while hovered). Disabled targets
 * (system folder, viewers) accept neither.
 */
export function useFolderDrop(
  folderId: string | null,
  handlers: VaultHandlers,
  disabled = false,
) {
  const [over, setOver] = useState(false);
  const overRef = useRef(false);
  if (disabled || !handlers.canWrite) {
    return { over: false, dropProps: {} as HTMLAttributes<HTMLElement> };
  }
  const accepts = (e: DragEvent) =>
    e.dataTransfer.types.includes(VAULT_DRAG_MIME) || e.dataTransfer.types.includes("Files");
  // Ref-guarded so the page's hover counter sees exactly one transition per
  // enter/leave (dragover fires continuously; state updaters must stay pure).
  const setHover = (next: boolean) => {
    if (overRef.current !== next) {
      overRef.current = next;
      handlers.folderHover(next);
    }
    setOver(next);
  };
  const dropProps: HTMLAttributes<HTMLElement> = {
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(VAULT_DRAG_MIME)
        ? "move"
        : "copy";
      setHover(true);
    },
    onDragLeave: () => setHover(false),
    onDrop: (e: DragEvent) => {
      setHover(false);
      const raw = e.dataTransfer.getData(VAULT_DRAG_MIME);
      if (raw) {
        e.preventDefault();
        e.stopPropagation();
        try {
          handlers.moveItem(JSON.parse(raw) as DragPayload, folderId);
        } catch {
          /* malformed payload — ignore the drop */
        }
        return;
      }
      if (e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handlers.uploadInto(folderId, [...e.dataTransfer.files]);
      }
    },
  };
  return { over, dropProps };
}

/* ------------------------------ Menus -------------------------------------- */

/** The pieces of a Radix menu the shared entries render into — lets the same
 * items back both the ⋮ dropdown and the right-click context menu. */
type MenuParts = {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
};

/** One menu, three surfaces: identical entries for dropdown + context menu. */
function VaultMenuEntries({
  target,
  handlers,
  M,
}: {
  target: VaultTarget;
  handlers: VaultHandlers;
  M: MenuParts;
}) {
  if (target.kind === "txn") {
    return (
      <>
        <M.Item onSelect={() => handlers.previewTxn(target.txn)}>
          <Eye /> Preview
        </M.Item>
        <M.Item asChild>
          <a href={attachmentDownloadUrl(target.txn.id)}>
            <Download /> Download
          </a>
        </M.Item>
      </>
    );
  }

  if (target.kind === "folder") {
    const { folder } = target;
    return (
      <>
        <M.Item onSelect={() => handlers.openFolder(folder.id)}>
          <FolderOpen /> Open
        </M.Item>
        {handlers.canWrite && folder.system ? (
          <M.Item onSelect={() => handlers.onAction("edit", target)}>
            <Palette /> Color &amp; tags
          </M.Item>
        ) : null}
        {handlers.canWrite && !folder.system ? (
          <>
            <M.Item onSelect={() => handlers.onAction("share", target)}>
              <Link2 /> Share
            </M.Item>
            <M.Separator />
            <M.Item onSelect={() => handlers.onAction("edit", target)}>
              <Pencil /> Edit
            </M.Item>
            <M.Item onSelect={() => handlers.onAction("move", target)}>
              <FolderInput /> Move
            </M.Item>
            <M.Item
              className="text-destructive focus:text-destructive"
              onSelect={() => handlers.onAction("delete", target)}
            >
              <Trash2 /> Delete
            </M.Item>
          </>
        ) : null}
      </>
    );
  }

  const { file } = target;
  return (
    <>
      <M.Item onSelect={() => handlers.previewFile(file)}>
        <Eye /> Preview
      </M.Item>
      <M.Item asChild>
        <a href={fileDownloadUrl(file.id)}>
          <Download /> Download
        </a>
      </M.Item>
      {handlers.canWrite ? (
        <>
          <M.Item onSelect={() => handlers.onAction("share", target)}>
            <Link2 /> Share
          </M.Item>
          <M.Separator />
          <M.Item onSelect={() => handlers.onAction("edit", target)}>
            <Pencil /> Edit
          </M.Item>
          <M.Item onSelect={() => handlers.onAction("move", target)}>
            <FolderInput /> Move
          </M.Item>
          <M.Item
            className="text-destructive focus:text-destructive"
            onSelect={() => handlers.onAction("delete", target)}
          >
            <Trash2 /> Delete
          </M.Item>
        </>
      ) : null}
    </>
  );
}

/** The per-item ⋮ button (kept alongside the right-click menu). */
export function VaultItemMenu({
  target,
  handlers,
}: {
  target: VaultTarget;
  handlers: VaultHandlers;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-label="More actions"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <VaultMenuEntries
          target={target}
          handlers={handlers}
          M={{ Item: DropdownMenuItem, Separator: DropdownMenuSeparator }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Right-click wrapper: same entries as the ⋮ menu, on any view's item. */
export function VaultContextMenu({
  target,
  handlers,
  children,
}: {
  target: VaultTarget;
  handlers: VaultHandlers;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <VaultMenuEntries
          target={target}
          handlers={handlers}
          M={{ Item: ContextMenuItem, Separator: ContextMenuSeparator }}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function VaultEmptyState({ searching, canWrite }: { searching: boolean; canWrite: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
      <Folder className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium">{searching ? "No matches" : "No files here yet"}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {searching
          ? "Try a different name, tag, or category."
          : canWrite
            ? "Upload documents or create a folder to organize board resolutions, land papers, certificates and more."
            : "Files someone uploads to this profile will appear here."}
      </p>
    </div>
  );
}

/* ----------------------------- Grid view ---------------------------------- */

const CARD =
  "group flex w-full flex-col gap-1.5 rounded-lg border bg-card p-2 text-left transition-all hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Full folder metadata, shown instantly when a grid tile is hovered. */
function FolderMetaTooltip({ folder, handlers }: { folder: FolderDTO; handlers: VaultHandlers }) {
  const tags = folder.tagIds
    .map((id) => handlers.tagById(id))
    .filter((t): t is TagDTO => t != null);
  return (
    <TooltipContent side="bottom" align="start" sideOffset={6} className="flex-col items-start gap-1.5">
      <p className="text-xs font-medium">{folder.name}</p>
      {tags.length > 0 ? (
        <span className="flex max-w-56 flex-wrap gap-1">
          {tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </span>
      ) : null}
      <div className="space-y-0.5 text-sm opacity-80">
        {folder.createdByName ? <p>Created by {folder.createdByName}</p> : null}
        <p>Created {formatVaultDate(folder.createdAt, handlers.locale)}</p>
        <p>Updated {formatVaultDate(folder.updatedAt, handlers.locale)}</p>
      </div>
    </TooltipContent>
  );
}

function FolderCard({ folder, handlers }: { folder: FolderDTO; handlers: VaultHandlers }) {
  const { over, dropProps } = useFolderDrop(folder.id, handlers, folder.system);
  return (
    // Tooltip root outside, trigger innermost: both the context-menu trigger
    // and the tooltip trigger compose onto the same card div via asChild.
    <Tooltip delayDuration={0}>
      <VaultContextMenu target={{ kind: "folder", folder }} handlers={handlers}>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={cn(CARD, over && "ring-2 ring-ring")}
            style={folderTintStyle(folder)}
            onClick={() => handlers.openFolder(folder.id)}
            onKeyDown={(e) => e.key === "Enter" && handlers.openFolder(folder.id)}
            {...dragSourceProps(
              { kind: "folder", id: folder.id },
              handlers.canWrite && !folder.system,
            )}
            {...dropProps}
          >
            <div
              className="flex aspect-square w-full items-center justify-center rounded-md border"
              style={{ backgroundColor: `${folderColor(folder)}1f`, borderColor: `${folderColor(folder)}40` }}
            >
              <FolderGlyph folder={folder} className="size-8" />
            </div>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-medium">
                  <span className="truncate">{folder.name}</span>
                  {folder.system ? (
                    <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </div>
                {folder.createdByName ? (
                  <div className="truncate text-xs text-muted-foreground">
                    By {folder.createdByName}
                  </div>
                ) : null}
                <div className="mt-1 flex items-center gap-1 overflow-hidden">
                  {folder.system ? (
                    <span className="shrink-0 text-sm text-muted-foreground">Predefined</span>
                  ) : null}
                  <TagChips tagIds={folder.tagIds} handlers={handlers} oneLine />
                  <ProfileChip profileId={folder.profileId} handlers={handlers} />
                </div>
              </div>
              <VaultItemMenu target={{ kind: "folder", folder }} handlers={handlers} />
            </div>
          </div>
        </TooltipTrigger>
      </VaultContextMenu>
      <FolderMetaTooltip folder={folder} handlers={handlers} />
    </Tooltip>
  );
}

/** Full file metadata, shown instantly when a grid tile is hovered. */
function FileMetaTooltip({ file, handlers }: { file: FileDTO; handlers: VaultHandlers }) {
  const tags = file.tagIds
    .map((id) => handlers.tagById(id))
    .filter((t): t is TagDTO => t != null);
  return (
    <TooltipContent side="bottom" align="start" sideOffset={6} className="flex-col items-start gap-1.5">
      <p className="text-xs font-medium">{file.name}</p>
      {tags.length > 0 ? (
        <span className="flex max-w-56 flex-wrap gap-1">
          {tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </span>
      ) : null}
      <div className="space-y-0.5 text-[11px] opacity-80">
        <p>
          {fileTypeLabel(file.contentType)} · {formatFileSize(file.sizeBytes)}
        </p>
        {file.category ? <p>{FILE_CATEGORY_LABELS[file.category]}</p> : null}
        {file.uploaderName ? <p>Uploaded by {file.uploaderName}</p> : null}
        <p>Added {formatVaultDate(file.createdAt, handlers.locale)}</p>
      </div>
    </TooltipContent>
  );
}

function FileCard({ file, handlers }: { file: FileDTO; handlers: VaultHandlers }) {
  return (
    <Tooltip delayDuration={0}>
      <VaultContextMenu target={{ kind: "file", file }} handlers={handlers}>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className={CARD}
            onClick={() => handlers.previewFile(file)}
            onKeyDown={(e) => e.key === "Enter" && handlers.previewFile(file)}
            {...dragSourceProps({ kind: "file", id: file.id }, handlers.canWrite)}
          >
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40">
              <FileThumb
                id={file.id}
                contentType={file.contentType}
                hasThumbnail={file.hasThumbnail}
                source="file"
                glyphClass="size-8"
              />
            </div>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {fileTypeLabel(file.contentType)} · {formatFileSize(file.sizeBytes)}
                  {file.uploaderName ? <> · {file.uploaderName}</> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {file.category ? (
                    <Badge variant="outline" className="px-1.5 py-0 text-sm font-normal">
                      {FILE_CATEGORY_LABELS[file.category]}
                    </Badge>
                  ) : null}
                  <TagChips tagIds={file.tagIds} handlers={handlers} />
                  <ProfileChip profileId={file.profileId} handlers={handlers} />
                </div>
              </div>
              <VaultItemMenu target={{ kind: "file", file }} handlers={handlers} />
            </div>
          </div>
        </TooltipTrigger>
      </VaultContextMenu>
      <FileMetaTooltip file={file} handlers={handlers} />
    </Tooltip>
  );
}

function TxnCard({ txn, handlers }: { txn: TxnFileDTO; handlers: VaultHandlers }) {
  return (
    <VaultContextMenu target={{ kind: "txn", txn }} handlers={handlers}>
      <div
        role="button"
        tabIndex={0}
        className={CARD}
        onClick={() => handlers.previewTxn(txn)}
        onKeyDown={(e) => e.key === "Enter" && handlers.previewTxn(txn)}
      >
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          <FileThumb
            id={txn.id}
            contentType={txn.contentType}
            hasThumbnail={txn.hasThumbnail}
            source="attachment"
            glyphClass="size-8"
          />
        </div>
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{txn.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {txn.txnTitle || "Transaction"} · <TxnAmount txn={txn} handlers={handlers} />
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              {formatVaultDate(txn.txnOccurredOn, handlers.locale)}
              <ProfileChip profileId={txn.profileId} handlers={handlers} />
            </div>
          </div>
          <VaultItemMenu target={{ kind: "txn", txn }} handlers={handlers} />
        </div>
      </div>
    </VaultContextMenu>
  );
}

export function FileGrid({
  folders,
  files,
  txnFiles,
  handlers,
  searching,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  txnFiles: TxnFileDTO[];
  handlers: VaultHandlers;
  searching: boolean;
}) {
  if (folders.length === 0 && files.length === 0 && txnFiles.length === 0) {
    return <VaultEmptyState searching={searching} canWrite={handlers.canWrite} />;
  }
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
      {folders.map((folder) => (
        <FolderCard key={folder.id} folder={folder} handlers={handlers} />
      ))}
      {files.map((file) => (
        <FileCard key={file.id} file={file} handlers={handlers} />
      ))}
      {txnFiles.map((txn) => (
        <TxnCard key={txn.id} txn={txn} handlers={handlers} />
      ))}
    </div>
  );
}

/* ----------------------------- List view ---------------------------------- */

function FolderRow({ folder, handlers }: { folder: FolderDTO; handlers: VaultHandlers }) {
  const { over, dropProps } = useFolderDrop(folder.id, handlers, folder.system);
  return (
    <VaultContextMenu target={{ kind: "folder", folder }} handlers={handlers}>
      <TableRow
        className={cn("cursor-pointer", over && "bg-accent/60")}
        style={over ? undefined : { backgroundColor: `${folderColor(folder)}0f` }}
        onClick={() => handlers.openFolder(folder.id)}
        {...dragSourceProps(
          { kind: "folder", id: folder.id },
          handlers.canWrite && !folder.system,
        )}
        {...dropProps}
      >
        <TableCell className="max-w-64">
          <span className="flex items-center gap-2">
            <FolderGlyph folder={folder} className="size-4" />
            <span className="truncate font-medium">{folder.name}</span>
            {folder.system ? (
              <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {folder.system ? "Predefined" : "Folder"}
        </TableCell>
        <TableCell>
          <TagChips tagIds={folder.tagIds} handlers={handlers} max={3} />
        </TableCell>
        <TableCell className="text-right text-muted-foreground">—</TableCell>
        <TableCell className="text-muted-foreground">
          {formatVaultDate(folder.createdAt, handlers.locale)}
        </TableCell>
        <TableCell className="max-w-32 truncate text-muted-foreground">
          {folder.createdByName ?? "—"}
        </TableCell>
        {handlers.allProfiles ? (
          <TableCell className="text-muted-foreground">
            {handlers.profileLabel(folder.profileId)}
          </TableCell>
        ) : null}
        <TableCell>
          <VaultItemMenu target={{ kind: "folder", folder }} handlers={handlers} />
        </TableCell>
      </TableRow>
    </VaultContextMenu>
  );
}

function FileRow({ file, handlers }: { file: FileDTO; handlers: VaultHandlers }) {
  return (
    <VaultContextMenu target={{ kind: "file", file }} handlers={handlers}>
      <TableRow
        className="cursor-pointer"
        onClick={() => handlers.previewFile(file)}
        {...dragSourceProps({ kind: "file", id: file.id }, handlers.canWrite)}
      >
        <TableCell className="max-w-64">
          <span className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
              <FileThumb
                id={file.id}
                contentType={file.contentType}
                hasThumbnail={file.hasThumbnail}
                source="file"
                glyphClass="size-4"
              />
            </span>
            <span className="truncate font-medium">{file.name}</span>
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {file.category ? FILE_CATEGORY_LABELS[file.category] : "—"}
        </TableCell>
        <TableCell>
          <TagChips tagIds={file.tagIds} handlers={handlers} max={3} />
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular-nums">
          {formatFileSize(file.sizeBytes)}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatVaultDate(file.createdAt, handlers.locale)}
        </TableCell>
        <TableCell className="max-w-32 truncate text-muted-foreground">
          {file.uploaderName ?? "—"}
        </TableCell>
        {handlers.allProfiles ? (
          <TableCell className="text-muted-foreground">
            {handlers.profileLabel(file.profileId)}
          </TableCell>
        ) : null}
        <TableCell>
          <VaultItemMenu target={{ kind: "file", file }} handlers={handlers} />
        </TableCell>
      </TableRow>
    </VaultContextMenu>
  );
}

export function FileListTable({
  folders,
  files,
  txnFiles,
  handlers,
  searching,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  txnFiles: TxnFileDTO[];
  handlers: VaultHandlers;
  searching: boolean;
}) {
  if (folders.length === 0 && files.length === 0 && txnFiles.length === 0) {
    return <VaultEmptyState searching={searching} canWrite={handlers.canWrite} />;
  }
  return (
    <div className="space-y-6">
      {folders.length > 0 || files.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Added by</TableHead>
                {handlers.allProfiles ? <TableHead>Profile</TableHead> : null}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((folder) => (
                <FolderRow key={folder.id} folder={folder} handlers={handlers} />
              ))}
              {files.map((file) => (
                <FileRow key={file.id} file={file} handlers={handlers} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {txnFiles.length > 0 ? (
        <section>
          {folders.length > 0 || files.length > 0 ? (
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Transaction files
            </h2>
          ) : null}
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  {handlers.allProfiles ? <TableHead>Profile</TableHead> : null}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnFiles.map((txn) => (
                  <VaultContextMenu key={txn.id} target={{ kind: "txn", txn }} handlers={handlers}>
                    <TableRow className="cursor-pointer" onClick={() => handlers.previewTxn(txn)}>
                      <TableCell className="max-w-64">
                        <span className="flex items-center gap-2">
                          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                            <FileThumb
                              id={txn.id}
                              contentType={txn.contentType}
                              hasThumbnail={txn.hasThumbnail}
                              source="attachment"
                              glyphClass="size-4"
                            />
                          </span>
                          <span className="truncate font-medium">{txn.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {txn.txnTitle || "Transaction"}
                      </TableCell>
                      <TableCell className="text-right">
                        <TxnAmount txn={txn} handlers={handlers} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatVaultDate(txn.txnOccurredOn, handlers.locale)}
                      </TableCell>
                      {handlers.allProfiles ? (
                        <TableCell className="text-muted-foreground">
                          {handlers.profileLabel(txn.profileId)}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <VaultItemMenu target={{ kind: "txn", txn }} handlers={handlers} />
                      </TableCell>
                    </TableRow>
                  </VaultContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
