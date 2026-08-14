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
  Tag as TagIcon,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/components/app/permissions";
import { useAttachmentViewer } from "@/components/app/attachments/attachment-viewer";
import { updateFile, updateFolder } from "@/actions/files";
import {
  FILE_CATEGORY_LABELS,
  SYSTEM_FOLDER_NOTICE,
  type FileDTO,
  type FolderDTO,
  type TagDTO,
  type TxnFileDTO,
} from "@/lib/files";
import { cn } from "@/lib/utils";
import { useFilesView, type FilesView } from "./files-view-store";
import { pickVaultFiles, uploadVaultFilesRequest } from "./upload-files-client";
import {
  FileGrid,
  FileListTable,
  VAULT_DRAG_MIME,
  useFolderDrop,
  type DragPayload,
  type VaultAction,
  type VaultHandlers,
  type VaultTarget,
} from "./files-views";
import { FilesColumnView } from "./files-column-view";
import { TagChip } from "./vault-tags";
import {
  DeleteVaultItemDialog,
  EditVaultItemDialog,
  MoveVaultItemDialog,
  NewFolderDialog,
} from "./files-dialogs";
import { ShareVaultItemDialog } from "./files-share-dialog";

const VIEW_OPTIONS: { view: FilesView; label: string; icon: typeof LayoutGrid }[] = [
  { view: "grid", label: "Grid", icon: LayoutGrid },
  { view: "list", label: "List", icon: List },
  { view: "column", label: "Columns", icon: Columns3 },
];

type VaultSortKey = "time" | "name" | "size" | "category" | "tags";

const SORT_OPTIONS: { value: VaultSortKey; label: string }[] = [
  { value: "time", label: "Date added" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "category", label: "Category" },
  { value: "tags", label: "Tags" },
];

export function FilesPageClient({
  folders,
  files,
  txnFiles,
  tags,
  profiles,
  activeProfileId,
  currency,
  locale,
  filesCapped,
}: {
  folders: FolderDTO[];
  files: FileDTO[];
  txnFiles: TxnFileDTO[];
  tags: TagDTO[];
  profiles: { id: string; name: string; icon: string | null }[];
  /** null = "All profiles" (uploads/new folders then need a profile picked). */
  activeProfileId: string | null;
  currency: string;
  locale: string;
  filesCapped: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canWrite } = usePermissions();
  const openViewer = useAttachmentViewer();
  const [view, setView] = useFilesView();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<VaultSortKey>("time");
  // Ascending = A→Z / oldest / smallest. Default: newest first.
  const [sortAsc, setSortAsc] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
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

  const tagSortKey = (tagIds: string[]) =>
    tagIds
      .map((id) => tagMap.get(id)?.name ?? "")
      .filter(Boolean)
      .sort()
      .join(",");

  const dir = sortAsc ? 1 : -1;

  const sortedFiles = useMemo(() => {
    const LAST = "￿";
    const base: Record<VaultSortKey, (a: FileDTO, b: FileDTO) => number> = {
      time: (a, b) => a.createdAt.localeCompare(b.createdAt),
      name: (a, b) => a.name.localeCompare(b.name),
      size: (a, b) => a.sizeBytes - b.sizeBytes,
      category: (a, b) =>
        (a.category ? FILE_CATEGORY_LABELS[a.category] : LAST).localeCompare(
          b.category ? FILE_CATEGORY_LABELS[b.category] : LAST,
        ),
      tags: (a, b) => (tagSortKey(a.tagIds) || LAST).localeCompare(tagSortKey(b.tagIds) || LAST),
    };
    return [...files].sort((a, b) => dir * base[sortKey](a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, sortKey, dir, tagMap]);

  const sortedFolders = useMemo(() => {
    const base: (a: FolderDTO, b: FolderDTO) => number =
      sortKey === "time"
        ? (a, b) => a.createdAt.localeCompare(b.createdAt)
        : sortKey === "tags"
          ? (a, b) => tagSortKey(a.tagIds).localeCompare(tagSortKey(b.tagIds))
          : (a, b) => a.name.localeCompare(b.name);
    return [...folders].sort((a, b) => dir * base(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, sortKey, dir, tagMap]);

  const sortedTxnFiles = useMemo(() => {
    const base: (a: TxnFileDTO, b: TxnFileDTO) => number =
      sortKey === "name"
        ? (a, b) => a.name.localeCompare(b.name)
        : sortKey === "size"
          ? (a, b) => a.sizeBytes - b.sizeBytes
          : (a, b) => a.createdAt.localeCompare(b.createdAt);
    return [...txnFiles].sort((a, b) => dir * base(a, b));
  }, [txnFiles, sortKey, dir]);

  const query = q.trim().toLowerCase();
  const searching = query.length > 0;
  /** Search OR an active tag filter flattens results across all folders. */
  const filtering = searching || tagFilter.length > 0;
  const has = (text: string | null | undefined) =>
    (text ?? "").toLowerCase().includes(query);
  const matchesQuery = (name: string, tagIds: string[], extra?: string | null) =>
    !searching || has(name) || tagIds.some((id) => has(tagMap.get(id)?.name)) || has(extra);
  const matchesTagFilter = (tagIds: string[]) =>
    tagFilter.length === 0 || tagIds.some((id) => tagFilter.includes(id));

  const matchedFolders = useMemo(() => {
    if (filtering) {
      return sortedFolders.filter(
        (f) => matchesQuery(f.name, f.tagIds) && matchesTagFilter(f.tagIds),
      );
    }
    const children = sortedFolders.filter((f) => f.parentId === currentFolderId);
    // Predefined folders pin first at the root.
    return [...children.filter((f) => f.system), ...children.filter((f) => !f.system)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFolders, filtering, query, tagFilter, currentFolderId, tagMap]);

  const matchedFiles = useMemo(
    () =>
      filtering
        ? sortedFiles.filter(
            (f) =>
              matchesQuery(f.name, f.tagIds, f.category ? FILE_CATEGORY_LABELS[f.category] : null) &&
              matchesTagFilter(f.tagIds),
          )
        : sortedFiles.filter((f) => f.folderId === currentFolderId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedFiles, filtering, query, tagFilter, currentFolderId, tagMap],
  );

  // Transaction files live "inside" each profile's predefined folder; they
  // surface in search too, but carry no tags, so a tag filter excludes them.
  const matchedTxnFiles = useMemo(
    () =>
      filtering
        ? tagFilter.length > 0
          ? []
          : sortedTxnFiles.filter((t) => has(t.name) || has(t.txnTitle))
        : inSystemFolder
          ? sortedTxnFiles.filter((t) => t.profileId === currentFolder!.profileId)
          : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedTxnFiles, filtering, query, tagFilter, inSystemFolder, currentFolder],
  );

  /* ------------------------------ Uploads ---------------------------------- */

  const uploadProfileId = activeProfileId ?? (profiles.length === 1 ? profiles[0]!.id : null);
  const canUploadHere = canWrite && uploadProfileId !== null && !inSystemFolder;
  const [progress, setProgress] = useState<{ percent: number; count: number } | null>(null);

  /** Upload into a specific folder (OS drop on a folder) or the current one. */
  const uploadTo = async (folderId: string | null, picked: File[]) => {
    if (!canWrite || picked.length === 0) return;
    const destination = folderId ? (folderById.get(folderId) ?? null) : null;
    if (destination?.system) {
      toast.error("Files can't be added to Transaction attachments — attach them to a transaction instead");
      return;
    }
    const profileId = destination?.profileId ?? uploadProfileId;
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
      toast.error(res.error);
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

  const handlers: VaultHandlers = {
    canWrite,
    allProfiles: activeProfileId === null,
    currency,
    locale,
    profileLabel: (id) => profileNameById.get(id) ?? null,
    tagById: (id) => tagMap.get(id),
    openFolder: (id) => navigateToFolder(id),
    previewFile: (file) =>
      openViewer({ id: file.id, fileName: file.name, contentType: file.contentType, source: "file" }),
    previewTxn: (txn) =>
      openViewer({ id: txn.id, fileName: txn.name, contentType: txn.contentType }),
    onAction: (type, target) => setAction({ type, target }),
    moveItem: (payload, folderId) => void moveItem(payload, folderId),
    uploadInto: (folderId, picked) => void uploadTo(folderId, picked),
    folderHover: (over) => {
      folderHoverCount.current = Math.max(0, folderHoverCount.current + (over ? 1 : -1));
      setFolderHovered(folderHoverCount.current > 0);
    },
  };

  // "All files" / breadcrumb crumbs double as drop targets for dragged items.
  const rootDrop = useFolderDrop(null, handlers);

  // The column browser shows hierarchy itself. Search results are flat, so
  // searching falls back to the list rendering — but a tag filter keeps the
  // columns: the tree is pruned instead (see `columnData`).
  const effectiveView: FilesView = searching && view === "column" ? "list" : view;

  // What the column view browses: everything, or — under a tag filter — a
  // pruned tree of tagged folders (kept browsable with their whole subtree),
  // tagged files, and the ancestor folders needed to reach them.
  const columnData = useMemo(() => {
    if (tagFilter.length === 0) {
      return { folders: sortedFolders, files: sortedFiles, txns: sortedTxnFiles };
    }
    const childrenOf = new Map<string | null, FolderDTO[]>();
    for (const f of sortedFolders) {
      const list = childrenOf.get(f.parentId) ?? [];
      list.push(f);
      childrenOf.set(f.parentId, list);
    }
    const visible = new Set<string>();
    const addWithAncestors = (id: string | null) => {
      let cursor = id;
      let guard = 0;
      while (cursor && guard++ < 30 && !visible.has(cursor)) {
        visible.add(cursor);
        cursor = folderById.get(cursor)?.parentId ?? null;
      }
    };
    // Folders inside a tagged folder inherit its visibility.
    const inTaggedSubtree = new Set<string>();
    for (const f of sortedFolders) {
      if (!matchesTagFilter(f.tagIds)) continue;
      addWithAncestors(f.id);
      const stack = [f.id];
      while (stack.length) {
        const id = stack.pop()!;
        if (inTaggedSubtree.has(id)) continue;
        inTaggedSubtree.add(id);
        visible.add(id);
        for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
      }
    }
    const keptFiles = sortedFiles.filter(
      (f) =>
        matchesTagFilter(f.tagIds) || (f.folderId != null && inTaggedSubtree.has(f.folderId)),
    );
    for (const f of keptFiles) addWithAncestors(f.folderId);
    return {
      folders: sortedFolders.filter((f) => visible.has(f.id)),
      files: keptFiles,
      // Transaction files carry no tags, so a tag filter excludes them.
      txns: [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFolders, sortedFiles, sortedTxnFiles, tagFilter, folderById]);

  return (
    <div className="space-y-4">
      {/* Header: title + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Files</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files, tags…"
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

      {/* Second row: breadcrumbs / result count + tag filter + sort. The
          column view keeps its breadcrumbs under a tag filter — the tree is
          pruned in place, not flattened into results. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {filtering && effectiveView !== "column" ? (
          <p className="text-sm text-muted-foreground">
            {matchedFolders.length + matchedFiles.length + matchedTxnFiles.length} result
            {matchedFolders.length + matchedFiles.length + matchedTxnFiles.length === 1 ? "" : "s"}
            {searching ? <> for “{q.trim()}”</> : null}
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
              <Button variant="outline" className="h-8 px-2.5 text-sm">
                <TagIcon className="size-3.5" />
                Tags{tagFilter.length > 0 ? ` (${tagFilter.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {tags.length === 0 ? (
                <DropdownMenuItem disabled>No tags yet</DropdownMenuItem>
              ) : (
                tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={tagFilter.includes(tag.id)}
                    onCheckedChange={(checked) =>
                      setTagFilter((prev) =>
                        checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                      )
                    }
                    // Keep the menu open while multi-selecting.
                    onSelect={(e) => e.preventDefault()}
                    className="py-1.5"
                  >
                    <TagChip tag={tag} className="max-w-40 text-xs" />
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {tagFilter.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setTagFilter([])}>
                    Clear filter
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
      {!filtering && inSystemFolder && effectiveView !== "column" ? (
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
          searching={filtering}
        />
      ) : effectiveView === "list" ? (
        <FileListTable
          folders={matchedFolders}
          files={matchedFiles}
          txnFiles={matchedTxnFiles}
          handlers={handlers}
          searching={filtering}
        />
      ) : (
        <FilesColumnView
          folders={columnData.folders}
          files={columnData.files}
          txnFiles={columnData.txns}
          handlers={handlers}
          path={breadcrumbs}
          onNavigate={navigateToFolder}
          filtering={tagFilter.length > 0}
        />
      )}

      {filesCapped ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the most recent files — narrow by profile or search to find older ones.
        </p>
      ) : null}

      {/* Full-page OS-drag overlay (everything except the left nav). Hidden the
          moment a folder tile is the hovered target — the folder's own ring
          takes over as the affordance. */}
      {osDrag && !folderHovered ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-2 border-dashed border-ring bg-background/70 md:left-60">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              Drop anywhere to upload
              {currentFolder && !inSystemFolder ? <> to “{currentFolder.name}”</> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              …or drop onto a folder to upload straight into it
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
        tags={tags}
      />
      <EditVaultItemDialog
        target={action?.type === "edit" ? action.target : null}
        tags={tags}
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
