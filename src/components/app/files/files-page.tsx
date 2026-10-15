"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Columns3,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/components/app/permissions";
import { useAttachmentViewer } from "@/components/app/attachments/attachment-viewer";
import { usePlan } from "@/components/app/upgrade-dialog";
import { updateFile, updateFolder } from "@/actions/files";
import {
  SYSTEM_FOLDER_NOTICE,
  computeFolderSizes,
  normalizeVaultQuery,
  vaultTextMatches,
  type FileDTO,
  type FolderDTO,
  type TxnFileDTO,
  type VaultProfile,
} from "@/lib/files";
import { cn } from "@/lib/utils";
import { useFilesView, type FilesView } from "./files-view-store";
import { pickVaultFiles, uploadVaultFilesRequest } from "./upload-files-client";
import {
  FileGrid,
  FileListTable,
  VAULT_DRAG_MIME,
  VaultSpaceContextMenu,
  useFolderDrop,
  type DragPayload,
  type VaultAction,
  type VaultHandlers,
  type VaultTarget,
} from "./files-views";
import { FileDetails, TxnFileDetails } from "./file-details";
import { FilesColumnView } from "./files-column-view";
import { StorageRing } from "./storage-ring";
import {
  DeleteVaultItemDialog,
  EditVaultItemDialog,
  MoveVaultItemDialog,
  NewFolderDialog,
} from "./files-dialogs";
import { ShareVaultItemDialog } from "./files-share-dialog";
import { AccountControls } from "@/components/app/account-controls";

const VIEW_OPTIONS: { view: FilesView; label: string; icon: typeof LayoutGrid }[] = [
  { view: "grid", label: "Grid", icon: LayoutGrid },
  { view: "list", label: "List", icon: List },
  { view: "column", label: "Columns", icon: Columns3 },
];

type VaultSortKey = "time" | "name" | "size";

const SORT_OPTIONS: { value: VaultSortKey; label: string }[] = [
  { value: "time", label: "Date added" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

export function FilesPageClient({
  folders,
  files,
  txnFiles,
  profiles,
  activeProfileId,
  currency,
  locale,
  filesCapped,
  storageUsedBytes,
  storageLimitBytes,
  storageTrashBytes = 0,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  txnFiles: TxnFileDTO[];
  profiles: VaultProfile[];
  /** null = "All profiles" (uploads/new folders then need a profile picked). */
  activeProfileId: string | null;
  currency: string;
  locale: string;
  filesCapped: boolean;
  /** Workspace-wide (files + attachments), server-computed; refreshed by the
   * `router.refresh()` that already follows every upload/delete. */
  storageUsedBytes: number;
  storageLimitBytes: number;
  /** Bytes in the trash (part of `storageUsedBytes`). */
  storageTrashBytes?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canWrite } = usePermissions();
  const { reportFailure } = usePlan();
  const openViewer = useAttachmentViewer();
  const [view, setView] = useFilesView();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<VaultSortKey>("time");
  // Ascending = A→Z / oldest / smallest. Default: newest first.
  const [sortAsc, setSortAsc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const profileNameById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.icon ? `${p.icon} ${p.name}` : p.name])),
    [profiles],
  );

  // The open folder lives in `?folder=`. Navigation uses `history.pushState`,
  // which Next syncs into useSearchParams WITHOUT a server round-trip — folder
  // clicks (and back/forward through parents) are instant, since every item in
  // scope is already on the client. A stale id self-heals to the root.
  const folderParam = searchParams.get("folder");
  const currentFolder = folderParam ? (folderById.get(folderParam) ?? null) : null;
  const currentFolderId = currentFolder?.id ?? null;
  const inSystemFolder = currentFolder?.system ?? false;

  const navigateToFolder = (id: string | null) => {
    if (id === (folderParam ?? null)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("folder", id);
    else params.delete("folder");
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  // Breadcrumb chain, root-first (guarded so a cyclic row can't hang render).
  const breadcrumbs = useMemo(() => {
    const chain: FolderDTO[] = [];
    let cursor = currentFolder;
    let guard = 0;
    while (cursor && guard++ < 20) {
      chain.unshift(cursor);
      cursor = cursor.parentId ? (folderById.get(cursor.parentId) ?? null) : null;
    }
    return chain;
  }, [currentFolder, folderById]);

  /* ------------------------- Sorting + filtering --------------------------- */

  const dir = sortAsc ? 1 : -1;

  const sortedFiles = useMemo(() => {
    const base: Record<VaultSortKey, (a: FileDTO, b: FileDTO) => number> = {
      time: (a, b) => a.createdAt.localeCompare(b.createdAt),
      name: (a, b) => a.name.localeCompare(b.name),
      size: (a, b) => a.sizeBytes - b.sizeBytes,
    };
    return [...files].sort((a, b) => dir * base[sortKey](a, b));
  }, [files, sortKey, dir]);

  // Folder totals (descendants included) from the full working set — never the
  // filtered arrays, so a search doesn't shrink a folder's size.
  const folderSizes = useMemo(
    () => computeFolderSizes(folders, files, txnFiles),
    [folders, files, txnFiles],
  );

  const sortedFolders = useMemo(() => {
    const base: (a: FolderDTO, b: FolderDTO) => number =
      sortKey === "time"
        ? (a, b) => a.createdAt.localeCompare(b.createdAt)
        : sortKey === "size"
          ? (a, b) => (folderSizes.get(a.id) ?? 0) - (folderSizes.get(b.id) ?? 0)
          : (a, b) => a.name.localeCompare(b.name);
    return [...folders].sort((a, b) => dir * base(a, b));
  }, [folders, sortKey, dir, folderSizes]);

  const sortedTxnFiles = useMemo(() => {
    const base: (a: TxnFileDTO, b: TxnFileDTO) => number =
      sortKey === "name"
        ? (a, b) => a.name.localeCompare(b.name)
        : sortKey === "size"
          ? (a, b) => a.sizeBytes - b.sizeBytes
          : (a, b) => a.createdAt.localeCompare(b.createdAt);
    return [...txnFiles].sort((a, b) => dir * base(a, b));
  }, [txnFiles, sortKey, dir]);

  // A search flattens results across all folders. Folders and files match on
  // their name or description; transaction files on their name or their
  // transaction's title — one rule (`vaultTextMatches`) for all three.
  const query = normalizeVaultQuery(q);
  const searching = query.length > 0;

  const matchedFolders = useMemo(() => {
    if (searching) {
      return sortedFolders.filter((f) => vaultTextMatches(query, [f.name, f.description]));
    }
    const children = sortedFolders.filter((f) => f.parentId === currentFolderId);
    // Predefined folders pin first at the root.
    return [...children.filter((f) => f.system), ...children.filter((f) => !f.system)];
  }, [sortedFolders, searching, query, currentFolderId]);

  const matchedFiles = useMemo(
    () =>
      searching
        ? sortedFiles.filter((f) => vaultTextMatches(query, [f.name, f.description]))
        : sortedFiles.filter((f) => f.folderId === currentFolderId),
    [sortedFiles, searching, query, currentFolderId],
  );

  // Transaction files live "inside" each profile's predefined folder; they
  // surface in search too.
  const matchedTxnFiles = useMemo(
    () =>
      searching
        ? sortedTxnFiles.filter((t) => vaultTextMatches(query, [t.name, t.txnTitle]))
        : inSystemFolder
          ? sortedTxnFiles.filter((t) => t.profileId === currentFolder!.profileId)
          : [],
    [sortedTxnFiles, searching, query, inSystemFolder, currentFolder],
  );

  /* ------------------------------ Uploads ---------------------------------- */

  const uploadProfileId = activeProfileId ?? (profiles.length === 1 ? profiles[0]!.id : null);
  const canUploadHere = canWrite && uploadProfileId !== null && !inSystemFolder;
  const [progress, setProgress] = useState<{ percent: number; count: number } | null>(null);

  /**
   * Upload into a specific folder (OS drop on a folder) or the current one.
   * `intoProfile` names the destination profile for a root upload that isn't in
   * the current one — a drop on a profile divider in "All profiles"; a folder
   * destination still wins, since a folder already belongs to a profile.
   */
  const uploadTo = async (
    folderId: string | null,
    picked: File[],
    intoProfile?: string,
  ) => {
    if (!canWrite || picked.length === 0) return;
    const destination = folderId ? (folderById.get(folderId) ?? null) : null;
    if (destination?.system) {
      toast.error("Files can't be added to Transaction attachments — attach them to a transaction instead");
      return;
    }
    const profileId = destination?.profileId ?? intoProfile ?? uploadProfileId;
    if (!profileId) {
      toast.error("Switch to a profile to upload");
      return;
    }
    const { accepted, rejected } = pickVaultFiles(picked);
    if (rejected) toast.error(rejected);
    if (accepted.length === 0) return;
    setProgress({ percent: 0, count: accepted.length });
    const res = await uploadVaultFilesRequest(profileId, folderId, accepted, (percent) =>
      setProgress({ percent, count: accepted.length }),
    );
    setProgress(null);
    if (!res.ok) {
      // A full storage quota opens the upgrade dialog; anything else toasts.
      reportFailure(res);
      return;
    }
    toast.success(res.files.length === 1 ? "File uploaded" : `${res.files.length} files uploaded`);
    router.refresh();
  };

  /* --------------------- Whole-page OS-file drop zone ---------------------- */

  // Everything except the left nav acts as a drop zone: window-level listeners
  // (so the gutters outside this component count too) show the overlay and
  // take the drop; folder tiles claim their own drops via stopPropagation and
  // report hover through `folderHover`, which swaps the whole-page overlay for
  // just that folder's highlight.
  const [osDrag, setOsDrag] = useState(false);
  const [folderHovered, setFolderHovered] = useState(false);
  const dragDepth = useRef(0);
  const folderHoverCount = useRef(0);
  // Refs so the window listeners always see the latest target + uploader
  // (kept fresh after every commit — refs must not be written during render).
  const dropTargetRef = useRef<string | null>(null);
  const uploadToRef = useRef(uploadTo);
  useEffect(() => {
    dropTargetRef.current = inSystemFolder ? null : currentFolderId;
    uploadToRef.current = uploadTo;
  });

  useEffect(() => {
    if (!canWrite) return;
    const isOsFileDrag = (e: globalThis.DragEvent) =>
      (e.dataTransfer?.types.includes("Files") ?? false) &&
      !(e.dataTransfer?.types.includes(VAULT_DRAG_MIME) ?? false);
    const resetAll = () => {
      dragDepth.current = 0;
      folderHoverCount.current = 0;
      setOsDrag(false);
      setFolderHovered(false);
    };
    const onDragEnter = (e: globalThis.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      dragDepth.current += 1;
      setOsDrag(true);
    };
    const onDragOver = (e: globalThis.DragEvent) => {
      if (isOsFileDrag(e)) e.preventDefault();
    };
    const onDragLeave = (e: globalThis.DragEvent) => {
      if (!isOsFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) resetAll();
    };
    // Bubble-phase: only drops nobody else claimed (folder tiles stop
    // propagation) land here — they upload to the current location. The left
    // nav is exempt: the drop is swallowed (no browser navigation), no upload.
    const onDrop = (e: globalThis.DragEvent) => {
      const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
      resetAll();
      if (files.length === 0) return;
      e.preventDefault();
      if (e.target instanceof Element && e.target.closest("aside")) return;
      void uploadToRef.current(dropTargetRef.current, files);
    };
    // Capture-phase safety net: clear the overlay on ANY drop or drag end,
    // including folder-claimed drops that never reach the bubble listener.
    const onAnyDropCapture = () => {
      dragDepth.current = 0;
      setOsDrag(false);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("drop", onAnyDropCapture, true);
    window.addEventListener("dragend", onAnyDropCapture, true);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("drop", onAnyDropCapture, true);
      window.removeEventListener("dragend", onAnyDropCapture, true);
    };
  }, [canWrite]);

  /* ------------------------------ Actions ---------------------------------- */

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [action, setAction] = useState<{ type: VaultAction; target: VaultTarget } | null>(null);
  const closeAction = (open: boolean) => {
    if (!open) setAction(null);
  };

  /** Drag-and-drop (and breadcrumb-drop) move, validated client-side first so
   * obviously-invalid drops don't round-trip; the service re-checks it all. */
  const moveItem = async (payload: DragPayload, folderId: string | null) => {
    const destination = folderId ? folderById.get(folderId) : null;
    if (folderId && !destination) return;
    if (destination?.system) {
      toast.error("Items can't be moved into the Transaction attachments folder");
      return;
    }
    if (payload.kind === "file") {
      const file = files.find((f) => f.id === payload.id);
      if (!file || file.folderId === folderId) return;
      if (destination && destination.profileId !== file.profileId) {
        toast.error("Files can't move between profiles");
        return;
      }
      const res = await updateFile({ id: file.id, folderId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
    } else {
      const folder = folderById.get(payload.id);
      if (!folder || folder.system || folder.parentId === folderId || folder.id === folderId) {
        return;
      }
      if (destination && destination.profileId !== folder.profileId) {
        toast.error("Folders can't move between profiles");
        return;
      }
      // No folder into its own subtree (would orphan it as a cycle).
      let cursor = destination ?? null;
      let guard = 0;
      while (cursor && guard++ < 30) {
        if (cursor.id === folder.id) {
          toast.error("A folder can't be moved into itself");
          return;
        }
        cursor = cursor.parentId ? (folderById.get(cursor.parentId) ?? null) : null;
      }
      const res = await updateFolder({ id: folder.id, parentId: folderId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
    }
    toast.success("Moved");
    router.refresh();
  };

  const fileLocation = (file: FileDTO): string => {
    const path: string[] = [];
    let cursor = file.folderId ? (folderById.get(file.folderId) ?? null) : null;
    let guard = 0;
    while (cursor && guard++ < 30) {
      path.unshift(cursor.name);
      cursor = cursor.parentId ? (folderById.get(cursor.parentId) ?? null) : null;
    }
    const profile = profileNameById.get(file.profileId) ?? file.profileName ?? "";
    return [profile, ...path].filter(Boolean).join(" / ") || "—";
  };

  // The preview carries the file's details pane; a save there re-opens it with
  // the saved file, so the title above follows a rename.
  function previewFile(file: FileDTO) {
    openViewer({
      id: file.id,
      fileName: file.name,
      contentType: file.contentType,
      source: "file",
      details: (
        <FileDetails
          key={file.id}
          file={file}
          canWrite={canWrite}
          locale={locale}
          location={fileLocation(file)}
          onSaved={previewFile}
        />
      ),
    });
  }

  function previewTxn(txn: TxnFileDTO) {
    openViewer({
      id: txn.id,
      fileName: txn.name,
      contentType: txn.contentType,
      details: (
        <TxnFileDetails
          key={txn.id}
          txn={txn}
          canWrite={canWrite}
          locale={locale}
          currency={currency}
          onSaved={previewTxn}
        />
      ),
    });
  }

  const handlers: VaultHandlers = {
    canWrite,
    allProfiles: activeProfileId === null,
    currency,
    locale,
    profileLabel: (id) => (activeProfileId === null ? (profileNameById.get(id) ?? null) : null),
    folderSize: (id) => folderSizes.get(id) ?? 0,
    openFolder: (id) => navigateToFolder(id),
    previewFile,
    fileLocation,
    previewTxn,
    onAction: (type, target) => setAction({ type, target }),
    moveItem: (payload, folderId) => void moveItem(payload, folderId),
    uploadInto: (folderId, picked) => void uploadTo(folderId, picked),
    uploadIntoProfile: (profileId, picked) => void uploadTo(null, picked, profileId),
    folderHover: (over) => {
      folderHoverCount.current = Math.max(0, folderHoverCount.current + (over ? 1 : -1));
      setFolderHovered(folderHoverCount.current > 0);
    },
    // The toolbar's New folder and Upload, for right-click menus — same rules.
    create: canWrite
      ? {
          blocked: inSystemFolder
            ? "Files here come from transactions — nothing can be added to this folder."
            : uploadProfileId === null
              ? "Switch to a profile to add folders or files."
              : null,
          uploading: progress !== null,
          newFolder: () => setNewFolderOpen(true),
          upload: () => fileInputRef.current?.click(),
        }
      : null,
  };

  // "All files" / breadcrumb crumbs double as drop targets for dragged items.
  const rootDrop = useFolderDrop(null, handlers);

  // The column browser shows hierarchy itself. Search results are flat, so
  // searching falls back to the list rendering.
  const effectiveView: FilesView = searching && view === "column" ? "list" : view;

  // "All profiles" at the vault root: grid and list group the root items under
  // per-profile divider bars (sidebar order, empty profiles skipped). Opening a
  // folder — or searching, whose results aren't root-scoped — returns to the
  // flat rendering, where each item names its own profile again.
  const profileSections = useMemo(() => {
    if (activeProfileId !== null || searching || currentFolderId !== null) return null;
    return profiles
      .map((profile) => ({
        profile,
        folders: matchedFolders.filter((f) => f.profileId === profile.id),
        files: matchedFiles.filter((f) => f.profileId === profile.id),
      }))
      .filter((s) => s.folders.length > 0 || s.files.length > 0);
  }, [activeProfileId, searching, currentFolderId, profiles, matchedFolders, matchedFiles]);

  return (
    <div className="space-y-4">
      {/* Header: title + toolbar */}
      {/* The theme button and account menu close it on a desktop, top right
          even when the toolbar wraps. */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">Files</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StorageRing
              usedBytes={storageUsedBytes}
              limitBytes={storageLimitBytes}
              trashBytes={storageTrashBytes}
            />
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search files…"
                className="w-44 pl-8 sm:w-56"
                aria-label="Search files"
              />
            </div>
            <div className="flex rounded-lg border p-0.5">
              {VIEW_OPTIONS.map(({ view: v, label, icon: Icon }) => (
                <Button
                  key={v}
                  variant="ghost"
                  size="icon"
                  onClick={() => setView(v)}
                  aria-label={`${label} view`}
                  title={`${label} view`}
                  aria-pressed={view === v}
                  className={cn(
                    "size-8 text-muted-foreground",
                    view === v && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
            </div>
            {canWrite ? (
              <>
                {/* Icon-only, sitting beside the view toggle at the same `size-8`,
                    so the toolbar fits a phone without wrapping. The name lives in
                    `aria-label`/`title` — `title` is overridden below whenever the
                    button is disabled, which is the case worth explaining. */}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setNewFolderOpen(true)}
                  disabled={!canUploadHere}
                  aria-label="New folder"
                  title={
                    inSystemFolder
                      ? "Folders can't be created in this predefined folder"
                      : canUploadHere
                        ? "New folder"
                        : "Switch to a profile to create folders"
                  }
                >
                  <FolderPlus className="size-4" />
                </Button>
                {/* Icon-only and `size-8`, matching New folder beside it, so the
                    whole toolbar stays on one line on a phone. Keeps the default
                    (solid) variant — it's the primary action here, and the filled
                    button is what marks it as such next to the outlined ones. */}
                <Button
                  size="icon"
                  className="size-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canUploadHere || progress !== null}
                  aria-label="Upload"
                  title={
                    inSystemFolder
                      ? "Files here come from transactions"
                      : canUploadHere
                        ? "Upload"
                        : "Switch to a profile to upload"
                  }
                >
                  {progress !== null ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <AccountControls />
      </div>

      {/* Everything below the toolbar answers a right-click with New folder /
          Upload (items add their own entries first). It reaches the bottom of
          the window, so the empty space under a short list counts too. */}
      <VaultSpaceContextMenu handlers={handlers} className="min-h-[calc(100svh-7rem)] space-y-4">
      {/* Second row: breadcrumbs / result count + sort. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {searching ? (
          <p className="text-sm text-muted-foreground">
            {matchedFolders.length + matchedFiles.length + matchedTxnFiles.length} result
            {matchedFolders.length + matchedFiles.length + matchedTxnFiles.length === 1 ? "" : "s"}{" "}
            for “{q.trim()}”
          </p>
        ) : (
          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => navigateToFolder(null)}
              {...rootDrop.dropProps}
              className={cn(
                "rounded px-1 py-0.5 hover:text-foreground",
                currentFolderId === null ? "font-medium text-foreground" : "text-muted-foreground",
                rootDrop.over && "ring-2 ring-ring",
              )}
            >
              All files
            </button>
            {breadcrumbs.map((crumb, i) => (
              <Crumb
                key={crumb.id}
                crumb={crumb}
                last={i === breadcrumbs.length - 1}
                handlers={handlers}
                onNavigate={navigateToFolder}
              />
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 px-2.5 text-sm" aria-label="Sort by">
                <ArrowUpDown className="size-3.5" />
                {SORT_OPTIONS.find((o) => o.value === sortKey)!.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sortKey}
                onValueChange={(v) => setSortKey(v as VaultSortKey)}
              >
                {SORT_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setSortAsc((v) => !v)}
            aria-label={sortAsc ? "Sorted ascending — click for descending" : "Sorted descending — click for ascending"}
            title={sortAsc ? "Ascending" : "Descending"}
          >
            {sortAsc ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Predefined-folder notice */}
      {!searching && inSystemFolder && effectiveView !== "column" ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {SYSTEM_FOLDER_NOTICE}
        </p>
      ) : null}

      {/* Content */}
      {effectiveView === "grid" ? (
        <FileGrid
          folders={matchedFolders}
          files={matchedFiles}
          txnFiles={matchedTxnFiles}
          handlers={handlers}
          searching={searching}
          sections={profileSections}
        />
      ) : effectiveView === "list" ? (
        <FileListTable
          folders={matchedFolders}
          files={matchedFiles}
          txnFiles={matchedTxnFiles}
          handlers={handlers}
          searching={searching}
          sections={profileSections}
        />
      ) : (
        <FilesColumnView
          folders={sortedFolders}
          files={sortedFiles}
          txnFiles={sortedTxnFiles}
          handlers={handlers}
          path={breadcrumbs}
          onNavigate={navigateToFolder}
          rootProfiles={activeProfileId === null ? profiles : null}
        />
      )}

      {filesCapped ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the most recent files — narrow by profile or search to find older ones.
        </p>
      ) : null}
      </VaultSpaceContextMenu>

      {/* Full-page OS-drag overlay (everything except the left nav). Hidden the
          moment a folder tile is the hovered target — the folder's own ring
          takes over as the affordance. */}
      {osDrag && !folderHovered ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-2 border-dashed border-ring bg-background/70 md:left-60">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            {/* With several profiles on screen there's no "here" to drop into —
                the drop has to name a profile, so the copy points at the
                dividers and folders that can take it. */}
            <p className="text-sm font-medium">
              {uploadProfileId === null ? (
                "Drop onto a profile to upload"
              ) : (
                <>
                  Drop anywhere to upload
                  {currentFolder && !inSystemFolder ? <> to “{currentFolder.name}”</> : null}
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {uploadProfileId === null
                ? "Drop on a profile’s bar to upload into it, or onto a folder"
                : "…or drop onto a folder to upload straight into it"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Upload progress, bottom right */}
      {progress !== null ? (
        <div className="fixed right-4 bottom-4 z-50 w-72 rounded-xl border bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Uploading {progress.count} file{progress.count === 1 ? "" : "s"}…
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{progress.percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Hidden picker for the Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          void uploadTo(currentFolderId, picked);
        }}
      />

      {/* Dialogs */}
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        profileId={uploadProfileId}
        parentId={inSystemFolder ? null : currentFolderId}
      />
      <EditVaultItemDialog
        target={action?.type === "edit" ? action.target : null}
        onOpenChange={closeAction}
      />
      <MoveVaultItemDialog
        target={action?.type === "move" ? action.target : null}
        folders={folders}
        onOpenChange={closeAction}
      />
      <ShareVaultItemDialog
        target={action?.type === "share" ? action.target : null}
        locale={locale}
        onOpenChange={closeAction}
      />
      <DeleteVaultItemDialog
        target={action?.type === "delete" ? action.target : null}
        onOpenChange={closeAction}
      />
    </div>
  );
}

/** One breadcrumb: navigates on click, accepts drops to move items up-tree. */
function Crumb({
  crumb,
  last,
  handlers,
  onNavigate,
}: {
  crumb: FolderDTO;
  last: boolean;
  handlers: VaultHandlers;
  onNavigate: (id: string) => void;
}) {
  const { over, dropProps } = useFolderDrop(crumb.id, handlers, crumb.system);
  return (
    <span className="flex items-center gap-1">
      <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
      <button
        type="button"
        onClick={() => onNavigate(crumb.id)}
        {...dropProps}
        className={cn(
          "max-w-48 truncate rounded px-1 py-0.5 hover:text-foreground",
          last ? "font-medium text-foreground" : "text-muted-foreground",
          over && "ring-2 ring-ring",
        )}
      >
        {crumb.name}
      </button>
    </span>
  );
}
