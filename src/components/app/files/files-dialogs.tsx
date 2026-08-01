"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  updateFile,
  updateFolder,
} from "@/actions/files";
import {
  FILE_CATEGORY_LABELS,
  SYSTEM_FOLDER_NOTICE,
  VAULT_DEFAULT_FOLDER_COLOR,
  folderColor,
  type FolderDTO,
  type TagDTO,
} from "@/lib/files";
import {
  FILE_CATEGORIES,
  FOLDER_NAME_MAX,
  FILE_NAME_MAX,
  type FileCategory,
} from "@/lib/validation";
import type { VaultTarget } from "./files-views";
import { ColorSwatch, TagPicker } from "./vault-tags";

/* ----------------------------- New folder --------------------------------- */

export function NewFolderDialog({
  open,
  onOpenChange,
  profileId,
  parentId,
  tags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile the folder is created in (the active one). */
  profileId: string | null;
  /** Current folder → the new folder nests inside it; null = root. */
  parentId: string | null;
  tags: TagDTO[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(VAULT_DEFAULT_FOLDER_COLOR);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!profileId || !name.trim()) return;
    startTransition(async () => {
      const res = await createFolder({
        profileId,
        parentId,
        name: name.trim(),
        color,
        tagIds,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Folder created");
      setName("");
      setColor(VAULT_DEFAULT_FOLDER_COLOR);
      setTagIds([]);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            {parentId ? "Created inside the current folder." : "Created at the top level."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-folder-name">Name</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {name.length}/{FOLDER_NAME_MAX}
              </span>
            </div>
            <Input
              id="new-folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={FOLDER_NAME_MAX}
              placeholder="Land documents"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorSwatch value={color} onChange={setColor} />
          </div>
          {profileId ? (
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagPicker profileId={profileId} tags={tags} value={tagIds} onChange={setTagIds} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !profileId}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Edit --------------------------------------- */

export function EditVaultItemDialog({
  target,
  tags,
  onOpenChange,
}: {
  target: VaultTarget | null;
  tags: TagDTO[];
  onOpenChange: (open: boolean) => void;
}) {
  const editable = target && target.kind !== "txn" ? target : null;
  return (
    <Dialog open={editable !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {editable ? (
          <EditForm
            key={editable.kind === "file" ? editable.file.id : editable.folder.id}
            target={editable}
            tags={tags}
            close={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  target,
  tags,
  close,
}: {
  target: Exclude<VaultTarget, { kind: "txn" }>;
  tags: TagDTO[];
  close: () => void;
}) {
  const router = useRouter();
  const isFile = target.kind === "file";
  const system = !isFile && target.folder.system;
  const profileId = isFile ? target.file.profileId : target.folder.profileId;
  const [name, setName] = useState(isFile ? target.file.name : target.folder.name);
  const [color, setColor] = useState<string>(
    isFile ? VAULT_DEFAULT_FOLDER_COLOR : folderColor(target.folder),
  );
  const [tagIds, setTagIds] = useState<string[]>(
    isFile ? target.file.tagIds : target.folder.tagIds,
  );
  const [category, setCategory] = useState<string>(
    isFile ? (target.file.category ?? "none") : "none",
  );
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!system && !name.trim()) return;
    startTransition(async () => {
      const res = isFile
        ? await updateFile({
            id: target.file.id,
            name: name.trim(),
            tagIds,
            category: category === "none" ? null : (category as FileCategory),
          })
        : system
          ? await updateFolder({ id: target.folder.id, color, tagIds })
          : await updateFolder({ id: target.folder.id, name: name.trim(), color, tagIds });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      close();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isFile ? "Edit file" : system ? "Folder color & tags" : "Edit folder"}
        </DialogTitle>
        <DialogDescription>
          {isFile ? "Rename, categorize, and tag." : system ? target.folder.name : "Rename, color, and tag."}
        </DialogDescription>
      </DialogHeader>
      {system ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {SYSTEM_FOLDER_NOTICE}
        </p>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!system ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-item-name">Name</Label>
              {!isFile ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {name.length}/{FOLDER_NAME_MAX}
                </span>
              ) : null}
            </div>
            <Input
              id="edit-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={isFile ? FILE_NAME_MAX : FOLDER_NAME_MAX}
              autoFocus
            />
          </div>
        ) : null}
        {!isFile ? (
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorSwatch value={color} onChange={setColor} />
          </div>
        ) : null}
        {isFile ? (
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {FILE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {FILE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagPicker profileId={profileId} tags={tags} value={tagIds} onChange={setTagIds} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending || (!system && !name.trim())}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/* ----------------------------- Move --------------------------------------- */

export function MoveVaultItemDialog({
  target,
  folders,
  onOpenChange,
}: {
  target: VaultTarget | null;
  folders: FolderDTO[];
  onOpenChange: (open: boolean) => void;
}) {
  const movable = target && target.kind !== "txn" ? target : null;
  return (
    <Dialog open={movable !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {movable ? (
          <MoveForm
            key={movable.kind === "file" ? movable.file.id : movable.folder.id}
            target={movable}
            folders={folders}
            close={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const ROOT = "__root__";

function MoveForm({
  target,
  folders,
  close,
}: {
  target: Exclude<VaultTarget, { kind: "txn" }>;
  folders: FolderDTO[];
  close: () => void;
}) {
  const router = useRouter();
  const isFile = target.kind === "file";
  const profileId = isFile ? target.file.profileId : target.folder.profileId;
  const currentLocation = isFile ? target.file.folderId : target.folder.parentId;
  const [destination, setDestination] = useState<string>(currentLocation ?? ROOT);
  const [pending, startTransition] = useTransition();

  /** Same-profile, non-system folders only, excluding a moved folder's own
   * subtree, with "A / B / C" path labels so nesting is legible. */
  const options = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const excluded = new Set<string>();
    if (!isFile) {
      const stack = [target.folder.id];
      while (stack.length) {
        const id = stack.pop()!;
        excluded.add(id);
        for (const f of folders) if (f.parentId === id) stack.push(f.id);
      }
    }
    const pathOf = (folder: FolderDTO): string => {
      const parts = [folder.name];
      let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
      let guard = 0;
      while (parent && guard++ < 20) {
        parts.unshift(parent.name);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return parts.join(" / ");
    };
    return folders
      .filter((f) => f.profileId === profileId && !f.system && !excluded.has(f.id))
      .map((f) => ({ id: f.id, label: pathOf(f) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folders, isFile, profileId, target]);

  const submit = () => {
    const folderId = destination === ROOT ? null : destination;
    startTransition(async () => {
      const res = isFile
        ? await updateFile({ id: target.file.id, folderId })
        : await updateFolder({ id: target.folder.id, parentId: folderId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Moved");
      close();
      router.refresh();
    });
  };

  const unchanged = (destination === ROOT ? null : destination) === currentLocation;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move {isFile ? "file" : "folder"}</DialogTitle>
        <DialogDescription>
          Pick where “{isFile ? target.file.name : target.folder.name}” should live. You can also
          drag items onto a folder to move them.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROOT}>Files (top level)</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || unchanged}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Move
          </Button>
        </DialogFooter>
      </div>
    </>
  );
}

/* ----------------------------- Delete ------------------------------------- */

export function DeleteVaultItemDialog({
  target,
  onOpenChange,
}: {
  target: VaultTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const deletable = target && target.kind !== "txn" ? target : null;
  const isFile = deletable?.kind === "file";
  const name = deletable
    ? deletable.kind === "file"
      ? deletable.file.name
      : deletable.folder.name
    : "";

  const confirm = () => {
    if (!deletable) return;
    startTransition(async () => {
      const res =
        deletable.kind === "file"
          ? await deleteFile(deletable.file.id)
          : await deleteFolder(deletable.folder.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(deletable.kind === "file" ? "File deleted" : "Folder deleted");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={deletable !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {isFile
              ? "The file is removed for everyone with access, along with any share links to it. This can't be undone."
              : "The folder, everything inside it (including nested folders), and any share links to it are removed for everyone. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
