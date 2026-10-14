"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as filesService from "@/services/files";
import type { FileDTO, FileShareDTO, FolderDTO } from "@/lib/files";
import type {
  CreateFileShareInput,
  CreateFolderInput,
  UpdateFileInput,
  UpdateFolderInput,
} from "@/lib/validation";

/**
 * Web server actions for the files vault. Upload (multipart) and view/download
 * (streaming/redirect) go through route handlers under `/api/files`; these are
 * the JSON-shaped operations the vault page needs. All RBAC + validation lives
 * in `src/services/files.ts`. Vault tags have no actions: the web app no longer
 * shows or edits them (only `/api/v1/file-tags` does, for API clients).
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

/** Rename / recolor / describe / move a folder (editor). */
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

/** Delete a folder and its subtree (editor): to the trash on Plus/Pro, for good
 * (bytes included) on Free. `trashed` says which happened. */
export async function deleteFolder(id: string): Promise<ActionResult<{ trashed: boolean }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteFolder",
    async () => {
      const outcome = await filesService.deleteFolder(user.id, workspace.id, id);
      if (!outcome) throw notFound("Folder not found");
      revalidateFiles();
      return { trashed: outcome === "trashed" };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Rename / describe / move a file (editor). */
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

/** Delete a file (editor): to the trash on Plus/Pro, for good on Free. */
export async function deleteFile(id: string): Promise<ActionResult<{ trashed: boolean }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteFile",
    async () => {
      const outcome = await filesService.deleteFile(user.id, workspace.id, id);
      if (!outcome) throw notFound("File not found");
      revalidateFiles();
      return { trashed: outcome === "trashed" };
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
    { userId: user.id, rateLimit: "read", workspaceId: workspace.id },
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
