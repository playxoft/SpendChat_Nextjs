"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as filesService from "@/services/files";
import type { FileDTO, FileShareDTO, FolderDTO, TagDTO } from "@/lib/files";
import type {
  CreateFileShareInput,
  CreateFolderInput,
  CreateTagInput,
  UpdateFileInput,
  UpdateFolderInput,
  UpdateTagInput,
} from "@/lib/validation";

/**
 * Web server actions for the files vault. Upload (multipart) and view/download
 * (streaming/redirect) go through route handlers under `/api/files`; these are
 * the JSON-shaped operations the vault page needs. All RBAC + validation lives
 * in `src/services/files.ts`.
 */

function revalidateFiles() {
  revalidatePath("/app/files");
}

export async function createFolder(
  input: CreateFolderInput,
): Promise<ActionResult<{ folder: FolderDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "createFolder",
    async () => {
      const folder = await filesService.createFolder(user.id, workspace.id, input);
      revalidateFiles();
      return { folder };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Rename / re-tag / move a folder (editor). */
export async function updateFolder(
  input: UpdateFolderInput,
): Promise<ActionResult<{ folder: FolderDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateFolder",
    async () => {
      const folder = await filesService.updateFolder(user.id, workspace.id, input);
      revalidateFiles();
      return { folder };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete a folder, its subtree, and every contained file's bytes (editor). */
export async function deleteFolder(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteFolder",
    async () => {
      const removed = await filesService.deleteFolder(user.id, workspace.id, id);
      if (!removed) throw notFound("Folder not found");
      revalidateFiles();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Rename / re-categorize / re-tag / move a file (editor). */
export async function updateFile(
  input: UpdateFileInput,
): Promise<ActionResult<{ file: FileDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateFile",
    async () => {
      const file = await filesService.updateFile(user.id, workspace.id, input);
      revalidateFiles();
      return { file };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete a file and its stored bytes (editor). */
export async function deleteFile(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteFile",
    async () => {
      const removed = await filesService.deleteFile(user.id, workspace.id, id);
      if (!removed) throw notFound("File not found");
      revalidateFiles();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Create a tag (per-profile; editor). Only created tags can be applied. */
export async function createTag(
  input: CreateTagInput,
): Promise<ActionResult<{ tag: TagDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "createTag",
    async () => {
      const tag = await filesService.createTag(user.id, workspace.id, input);
      revalidateFiles();
      return { tag };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Rename/recolor a tag — every tagged item updates at once (editor). */
export async function updateTag(
  input: UpdateTagInput,
): Promise<ActionResult<{ tag: TagDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateTag",
    async () => {
      const tag = await filesService.updateTag(user.id, workspace.id, input);
      revalidateFiles();
      return { tag };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete a tag and detach it from every file/folder (editor). */
export async function deleteTag(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteTag",
    async () => {
      const removed = await filesService.deleteTag(user.id, workspace.id, id);
      if (!removed) throw notFound("Tag not found");
      revalidateFiles();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Create a public share link for a file or folder (editor). */
export async function createFileShare(
  input: CreateFileShareInput,
): Promise<ActionResult<{ share: FileShareDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "createFileShare",
    async () => {
      const share = await filesService.createFileShare(user.id, workspace.id, input);
      return { share };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Active links for one file or folder (editor — tokens grant public access). */
export async function listFileShares(target: {
  fileId?: string;
  folderId?: string;
}): Promise<ActionResult<{ shares: FileShareDTO[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "listFileShares",
    async () => {
      const shares = await filesService.listFileShares(user.id, workspace.id, target);
      return { shares };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Revoke a share link (editor). The URL stops working immediately. */
export async function revokeFileShare(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "revokeFileShare",
    async () => {
      const removed = await filesService.revokeFileShare(user.id, workspace.id, id);
      if (!removed) throw notFound("Share link not found");
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
