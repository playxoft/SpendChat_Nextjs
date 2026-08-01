import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { fileShares, fileTags, files, folders } from "@/db/schema";
import { badRequest, conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/api-response";
import { setLogContext } from "@/lib/log-context";
import { rolesAtLeast } from "@/lib/rbac";
import { accessibleProfileIds, getEffectiveProfileRole } from "@/lib/workspaces";
import { deleteObject, uploadObject } from "@/lib/r2";
import {
  getVaultFile,
  getVaultFolder,
  type VaultFileRow,
} from "@/lib/queries";
import {
  serializeFile,
  serializeFileShare,
  serializeFolder,
  serializeTag,
  type FileDTO,
  type FileShareDTO,
  type FolderDTO,
  type TagDTO,
} from "@/lib/files";
import {
  FILE_MAX_BYTES,
  FILE_MAX_PER_UPLOAD,
  FILE_NAME_MAX,
  createFileShareSchema,
  createFolderSchema,
  createTagSchema,
  resolveFileType,
  updateFileSchema,
  updateFolderSchema,
  updateTagSchema,
} from "@/lib/validation";

/**
 * Files-vault business logic. Access mirrors transactions: everything belongs
 * to a profile, reading needs **viewer** on that profile in the current
 * workspace, changing anything needs **editor**. Reads are scoped in
 * `src/lib/queries.ts`; writes re-check the role here. Bytes live in R2 under
 * `vault/...` keys — DB rows are metadata, and every delete path removes the
 * R2 objects too (best-effort, `deleteObject` never throws).
 */

/** One file handed to `uploadVaultFiles` (already read into memory by the route). */
export type VaultUpload = {
  fileName: string;
  contentType: string | null;
  bytes: ArrayBuffer;
  size: number;
  /** Optional client-generated preview, stored alongside (like attachments). */
  thumbnail?: { bytes: ArrayBuffer; contentType: string };
};

/** The one predefined folder kind: mirrors a profile's transaction files. */
const SYSTEM_FOLDER_KEY = "transactions";
const SYSTEM_FOLDER_NAME = "Transaction attachments";

/**
 * Make sure each given profile has its "Transaction attachments" system
 * folder. Called from the files page load with ids that already passed access
 * scoping (`getProfiles`). Idempotent and race-safe: the partial unique index
 * on (profile_id, system_key) absorbs concurrent creates.
 */
export async function ensureSystemFolders(
  userId: string,
  workspaceId: string,
  profileIds: string[],
): Promise<void> {
  if (profileIds.length === 0) return;
  const db = getDb();
  const existing = await db
    .select({ profileId: folders.profileId })
    .from(folders)
    .where(
      and(eq(folders.systemKey, SYSTEM_FOLDER_KEY), inArray(folders.profileId, profileIds)),
    );
  const have = new Set(existing.map((r) => r.profileId));
  const missing = profileIds.filter((id) => !have.has(id));
  if (missing.length === 0) return;
  await db
    .insert(folders)
    .values(
      missing.map((profileId) => ({
        workspaceId,
        profileId,
        parentId: null,
        userId,
        name: SYSTEM_FOLDER_NAME,
        systemKey: SYSTEM_FOLDER_KEY,
      })),
    )
    .onConflictDoNothing();
}

/** Every tag id must name a tag of the same profile — no cross-profile tags. */
async function assertTagsInProfile(profileId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileTags)
    .where(and(inArray(fileTags.id, tagIds), eq(fileTags.profileId, profileId)));
  if ((row?.count ?? 0) !== tagIds.length) throw validationError("Unknown tag");
}

const isUuid = (value: string): boolean => z.string().uuid().safeParse(value).success;

/** Same hardening as attachment filenames: no path pieces, no control chars. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, FILE_NAME_MAX);
}

/** Editor-or-better on a profile in the current workspace; 404s a foreign id. */
async function assertEditorOnProfile(userId: string, workspaceId: string, profileId: string) {
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access || access.workspaceId !== workspaceId) throw notFound("Not found");
  if (!rolesAtLeast("editor").includes(access.role)) {
    throw forbidden("You don't have permission to change files here");
  }
  setLogContext({ profileId });
}

/** All folder rows of one profile — the working set for subtree/cycle math.
 * A profile's folder tree is small (it's a document vault, not a filesystem). */
async function profileFolders(profileId: string) {
  const db = getDb();
  return db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.profileId, profileId));
}

/** `rootId` plus every descendant folder id, walked over the in-memory rows. */
function subtreeFolderIds(
  rows: { id: string; parentId: string | null }[],
  rootId: string,
): string[] {
  const children = new Map<string | null, string[]>();
  for (const r of rows) {
    const list = children.get(r.parentId) ?? [];
    list.push(r.id);
    children.set(r.parentId, list);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Reject a sibling folder with the same (case-insensitive) name. */
async function assertFolderNameFree(
  profileId: string,
  parentId: string | null,
  name: string,
  ignoreId?: string,
) {
  const db = getDb();
  const conds = [
    eq(folders.profileId, profileId),
    parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
    sql`lower(${folders.name}) = lower(${name})`,
  ];
  const [existing] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(...conds))
    .limit(1);
  if (existing && existing.id !== ignoreId) {
    throw conflict("A folder with that name already exists here");
  }
}

/** The parent folder for a create/move/upload, verified to live in the same
 * profile (folders never span profiles — access is per-profile). System
 * folders are never a valid destination: nothing can be created in, moved
 * into, or uploaded to "Transaction attachments". */
async function requireFolderInProfile(folderId: string, profileId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: folders.id, profileId: folders.profileId, systemKey: folders.systemKey })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  if (!row || row.profileId !== profileId) throw notFound("Folder not found");
  if (row.systemKey != null) {
    throw badRequest(
      "Transaction attachments is a predefined folder — attach files to a transaction to add them there",
    );
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Folders                                                                     */
/* -------------------------------------------------------------------------- */

export async function createFolder(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<FolderDTO> {
  const parsed = parseOrThrow(createFolderSchema, input);
  await assertEditorOnProfile(userId, workspaceId, parsed.profileId);
  if (parsed.parentId) await requireFolderInProfile(parsed.parentId, parsed.profileId);
  await assertFolderNameFree(parsed.profileId, parsed.parentId ?? null, parsed.name);
  await assertTagsInProfile(parsed.profileId, parsed.tagIds);

  const db = getDb();
  const [row] = await db
    .insert(folders)
    .values({
      workspaceId,
      profileId: parsed.profileId,
      parentId: parsed.parentId ?? null,
      userId,
      name: parsed.name,
      color: parsed.color ?? null,
      tagIds: parsed.tagIds,
    })
    .returning();
  return serializeFolder(row!);
}

/** Rename / re-tag / move a folder. Moving checks the target isn't the folder
 * itself or one of its descendants (which would orphan the subtree as a cycle). */
export async function updateFolder(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<FolderDTO> {
  const parsed = parseOrThrow(updateFolderSchema, input);
  const existing = await getVaultFolder(userId, workspaceId, parsed.id);
  if (!existing) throw notFound("Folder not found");
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  // A predefined folder accepts only cosmetic changes (color + tags).
  if (
    existing.systemKey != null &&
    ((parsed.name !== undefined && parsed.name !== existing.name) ||
      parsed.parentId !== undefined)
  ) {
    throw badRequest("This predefined folder can't be renamed or moved");
  }

  const set: Partial<typeof folders.$inferInsert> = {};
  if (parsed.name !== undefined && parsed.name !== existing.name) {
    await assertFolderNameFree(
      existing.profileId,
      parsed.parentId !== undefined ? (parsed.parentId ?? null) : existing.parentId,
      parsed.name,
      existing.id,
    );
    set.name = parsed.name;
  }
  if (parsed.color !== undefined) set.color = parsed.color ?? null;
  if (parsed.tagIds !== undefined) {
    await assertTagsInProfile(existing.profileId, parsed.tagIds);
    set.tagIds = parsed.tagIds;
  }
  if (parsed.parentId !== undefined && parsed.parentId !== existing.parentId) {
    if (parsed.parentId) {
      await requireFolderInProfile(parsed.parentId, existing.profileId);
      const rows = await profileFolders(existing.profileId);
      if (subtreeFolderIds(rows, existing.id).includes(parsed.parentId)) {
        throw badRequest("A folder can't be moved into itself");
      }
    }
    if (set.name === undefined) {
      await assertFolderNameFree(
        existing.profileId,
        parsed.parentId ?? null,
        existing.name,
        existing.id,
      );
    }
    set.parentId = parsed.parentId ?? null;
  }
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");
  set.updatedAt = new Date();

  const db = getDb();
  const [updated] = await db
    .update(folders)
    .set(set)
    .where(eq(folders.id, existing.id))
    .returning();
  return serializeFolder(updated!);
}

/**
 * Delete a folder and its whole subtree. The DB cascade removes the rows; this
 * first collects every descendant file's R2 key and deletes those objects so
 * no bytes are orphaned. Returns false when the folder isn't reachable.
 */
export async function deleteFolder(
  userId: string,
  workspaceId: string,
  folderId: string,
): Promise<boolean> {
  if (!isUuid(folderId)) throw validationError("Invalid folder");
  const existing = await getVaultFolder(userId, workspaceId, folderId);
  if (!existing) return false;
  if (existing.systemKey != null) {
    throw badRequest("This predefined folder can't be deleted");
  }
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  const db = getDb();
  const rows = await profileFolders(existing.profileId);
  const subtree = subtreeFolderIds(rows, existing.id);
  const contained = await db
    .select({ r2Key: files.r2Key })
    .from(files)
    .where(inArray(files.folderId, subtree));

  const deleted = await db
    .delete(folders)
    .where(eq(folders.id, existing.id))
    .returning({ id: folders.id });
  if (deleted.length === 0) return false;
  for (const f of contained) await deleteObject(f.r2Key);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Store a batch of uploads in the vault. Validates everything (count, sizes)
 * before touching R2, then uploads and inserts the rows in one statement; a
 * failure rolls the created objects back so nothing orphans. Unlike
 * transaction attachments there is no type allowlist — see `resolveFileType`.
 */
export async function uploadVaultFiles(
  userId: string,
  workspaceId: string,
  target: { profileId: string; folderId: string | null },
  uploads: VaultUpload[],
): Promise<FileDTO[]> {
  if (uploads.length === 0) throw badRequest("No files were provided");
  if (uploads.length > FILE_MAX_PER_UPLOAD) {
    throw badRequest(`You can upload at most ${FILE_MAX_PER_UPLOAD} files at once`);
  }
  if (!isUuid(target.profileId)) throw validationError("Invalid profile");
  if (target.folderId != null && !isUuid(target.folderId)) {
    throw validationError("Invalid folder");
  }
  await assertEditorOnProfile(userId, workspaceId, target.profileId);
  if (target.folderId) await requireFolderInProfile(target.folderId, target.profileId);

  const prepared = uploads.map((f) => {
    if (f.size === 0) throw badRequest("One of the files is empty");
    if (f.size > FILE_MAX_BYTES) throw validationError("Each file must be 5 MB or smaller");
    const resolved = resolveFileType(f.fileName, f.contentType);
    return {
      bytes: f.bytes,
      size: f.size,
      name: sanitizeFileName(f.fileName),
      contentType: resolved.contentType,
      ext: resolved.ext,
      thumbnail: f.thumbnail,
    };
  });

  const db = getDb();
  const uploaded: {
    key: string;
    thumbnailKey: string | null;
    item: (typeof prepared)[number];
  }[] = [];
  try {
    for (const item of prepared) {
      const id = crypto.randomUUID();
      const key = `vault/${workspaceId}/${target.profileId}/${id}.${item.ext}`;
      await uploadObject(key, item.bytes, item.contentType);
      let thumbnailKey: string | null = null;
      if (item.thumbnail) {
        thumbnailKey = `vault/${workspaceId}/${target.profileId}/${id}_thumb.webp`;
        await uploadObject(thumbnailKey, item.thumbnail.bytes, item.thumbnail.contentType);
      }
      uploaded.push({ key, thumbnailKey, item });
    }
    const rows = await db
      .insert(files)
      .values(
        uploaded.map(({ key, thumbnailKey, item }) => ({
          workspaceId,
          profileId: target.profileId,
          folderId: target.folderId,
          userId,
          r2Key: key,
          thumbnailKey,
          name: item.name,
          contentType: item.contentType,
          sizeBytes: item.size,
        })),
      )
      .returning();
    return rows.map((r) => serializeFile(r));
  } catch (err) {
    for (const { key, thumbnailKey } of uploaded) {
      await deleteObject(key);
      if (thumbnailKey) await deleteObject(thumbnailKey);
    }
    throw err;
  }
}

/** Rename / re-categorize / re-tag / move a file (editor). PATCH semantics. */
export async function updateFile(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<FileDTO> {
  const parsed = parseOrThrow(updateFileSchema, input);
  const existing = await getVaultFile(userId, workspaceId, parsed.id);
  if (!existing) throw notFound("File not found");
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  const set: Partial<typeof files.$inferInsert> = {};
  if (parsed.name !== undefined) set.name = sanitizeFileName(parsed.name);
  if (parsed.category !== undefined) set.category = parsed.category ?? null;
  if (parsed.tagIds !== undefined) {
    await assertTagsInProfile(existing.profileId, parsed.tagIds);
    set.tagIds = parsed.tagIds;
  }
  if (parsed.folderId !== undefined && parsed.folderId !== existing.folderId) {
    if (parsed.folderId) await requireFolderInProfile(parsed.folderId, existing.profileId);
    set.folderId = parsed.folderId ?? null;
  }
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");
  set.updatedAt = new Date();

  const db = getDb();
  const [updated] = await db.update(files).set(set).where(eq(files.id, existing.id)).returning();
  return serializeFile(updated!);
}

/** Delete a file's row and its R2 object (editor). False when unreachable. */
export async function deleteFile(
  userId: string,
  workspaceId: string,
  fileId: string,
): Promise<boolean> {
  if (!isUuid(fileId)) throw validationError("Invalid file");
  const existing = await getVaultFile(userId, workspaceId, fileId);
  if (!existing) return false;
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  const db = getDb();
  const deleted = await db
    .delete(files)
    .where(eq(files.id, existing.id))
    .returning({ id: files.id });
  if (deleted.length === 0) return false;
  await deleteObject(existing.r2Key);
  return true;
}

/** The row behind an authenticated view/download (viewer-or-better), or null. */
export async function getFileForDownload(
  userId: string,
  workspaceId: string,
  fileId: string,
): Promise<VaultFileRow | null> {
  if (!isUuid(fileId)) return null;
  return getVaultFile(userId, workspaceId, fileId);
}

/* -------------------------------------------------------------------------- */
/* Tags (per-profile entities; items reference them by id)                     */
/* -------------------------------------------------------------------------- */

/** Reject a same-profile tag with the same (case-insensitive) name. */
async function assertTagNameFree(profileId: string, name: string, ignoreId?: string) {
  const db = getDb();
  const [existing] = await db
    .select({ id: fileTags.id })
    .from(fileTags)
    .where(
      and(eq(fileTags.profileId, profileId), sql`lower(${fileTags.name}) = lower(${name})`),
    )
    .limit(1);
  if (existing && existing.id !== ignoreId) {
    throw conflict("A tag with that name already exists");
  }
}

export async function createTag(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<TagDTO> {
  const parsed = parseOrThrow(createTagSchema, input);
  await assertEditorOnProfile(userId, workspaceId, parsed.profileId);
  await assertTagNameFree(parsed.profileId, parsed.name);
  const db = getDb();
  const [row] = await db
    .insert(fileTags)
    .values({
      workspaceId,
      profileId: parsed.profileId,
      userId,
      name: parsed.name,
      color: parsed.color.toLowerCase(),
    })
    .returning();
  return serializeTag(row!);
}

/** Rename/recolor a tag — every item referencing it updates at once. */
export async function updateTag(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<TagDTO> {
  const parsed = parseOrThrow(updateTagSchema, input);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(fileTags)
    .where(
      and(
        eq(fileTags.id, parsed.id),
        inArray(fileTags.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  if (!existing) throw notFound("Tag not found");
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  const set: Partial<typeof fileTags.$inferInsert> = {};
  if (parsed.name !== undefined && parsed.name !== existing.name) {
    await assertTagNameFree(existing.profileId, parsed.name, existing.id);
    set.name = parsed.name;
  }
  if (parsed.color !== undefined) set.color = parsed.color.toLowerCase();
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");
  set.updatedAt = new Date();

  const [updated] = await db
    .update(fileTags)
    .set(set)
    .where(eq(fileTags.id, existing.id))
    .returning();
  return serializeTag(updated!);
}

/** Delete a tag and detach it from every file/folder of its profile. */
export async function deleteTag(
  userId: string,
  workspaceId: string,
  tagId: string,
): Promise<boolean> {
  if (!isUuid(tagId)) throw validationError("Invalid tag");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(fileTags)
    .where(
      and(
        eq(fileTags.id, tagId),
        inArray(fileTags.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  if (!existing) return false;
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);

  const deleted = await db
    .delete(fileTags)
    .where(eq(fileTags.id, existing.id))
    .returning({ id: fileTags.id });
  if (deleted.length === 0) return false;
  // tag_ids is a plain uuid[] (no FK), so detach by hand — scoped to the
  // profile, matching only rows that actually carry the id.
  await db
    .update(files)
    .set({ tagIds: sql`array_remove(${files.tagIds}, ${existing.id}::uuid)` })
    .where(
      and(eq(files.profileId, existing.profileId), sql`${existing.id}::uuid = any(${files.tagIds})`),
    );
  await db
    .update(folders)
    .set({ tagIds: sql`array_remove(${folders.tagIds}, ${existing.id}::uuid)` })
    .where(
      and(
        eq(folders.profileId, existing.profileId),
        sql`${existing.id}::uuid = any(${folders.tagIds})`,
      ),
    );
  return true;
}

/* -------------------------------------------------------------------------- */
/* Share links                                                                 */
/* -------------------------------------------------------------------------- */

/** 256 random bits, base64url — the token IS the capability, so it must be
 * unguessable and is never derived from an id. */
function mintShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Create a public link for one file or folder. Requires editor on the
 * target's profile — a share link exposes content outside the workspace. */
export async function createFileShare(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<FileShareDTO> {
  const parsed = parseOrThrow(createFileShareSchema, input);
  let profileId: string;
  if (parsed.fileId) {
    const file = await getVaultFile(userId, workspaceId, parsed.fileId);
    if (!file) throw notFound("File not found");
    profileId = file.profileId;
  } else {
    const folder = await getVaultFolder(userId, workspaceId, parsed.folderId!);
    if (!folder) throw notFound("Folder not found");
    if (folder.systemKey != null) {
      throw badRequest("This predefined folder can't be shared");
    }
    profileId = folder.profileId;
  }
  await assertEditorOnProfile(userId, workspaceId, profileId);

  const expiresAt = parsed.expiresInDays
    ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const db = getDb();
  const [row] = await db
    .insert(fileShares)
    .values({
      workspaceId,
      profileId,
      fileId: parsed.fileId ?? null,
      folderId: parsed.folderId ?? null,
      userId,
      token: mintShareToken(),
      allowDownload: parsed.allowDownload,
      expiresAt,
    })
    .returning();
  return serializeFileShare(row!);
}

/** Active links for one file or folder, newest first (editor — tokens grant
 * public access, so viewers don't get to read them). */
export async function listFileShares(
  userId: string,
  workspaceId: string,
  target: { fileId?: string; folderId?: string },
): Promise<FileShareDTO[]> {
  let profileId: string;
  let cond;
  if (target.fileId && isUuid(target.fileId)) {
    const file = await getVaultFile(userId, workspaceId, target.fileId);
    if (!file) throw notFound("File not found");
    profileId = file.profileId;
    cond = eq(fileShares.fileId, target.fileId);
  } else if (target.folderId && isUuid(target.folderId)) {
    const folder = await getVaultFolder(userId, workspaceId, target.folderId);
    if (!folder) throw notFound("Folder not found");
    profileId = folder.profileId;
    cond = eq(fileShares.folderId, target.folderId);
  } else {
    throw validationError("Pick a file or folder");
  }
  await assertEditorOnProfile(userId, workspaceId, profileId);

  const db = getDb();
  const rows = await db
    .select()
    .from(fileShares)
    .where(cond)
    .orderBy(desc(fileShares.createdAt));
  return rows.map(serializeFileShare);
}

/** Revoke (delete) a link. False when it isn't reachable in this workspace. */
export async function revokeFileShare(
  userId: string,
  workspaceId: string,
  shareId: string,
): Promise<boolean> {
  if (!isUuid(shareId)) throw validationError("Invalid link");
  const db = getDb();
  const [row] = await db
    .select()
    .from(fileShares)
    .where(
      and(
        eq(fileShares.id, shareId),
        inArray(fileShares.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  if (!row) return false;
  await assertEditorOnProfile(userId, workspaceId, row.profileId);
  const deleted = await db
    .delete(fileShares)
    .where(eq(fileShares.id, row.id))
    .returning({ id: fileShares.id });
  return deleted.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Public share resolution (token = the capability; no signed-in user)         */
/* -------------------------------------------------------------------------- */

/** What a share page may show for a file — display metadata only, no R2 key,
 * no profile/workspace identifiers beyond what the viewer already implies. */
export type SharedFilePublic = {
  id: string;
  folderId: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  hasThumbnail: boolean;
  tagIds: string[];
  createdAt: string;
};

/** A tag as the share page sees it: just the label + color. */
export type SharedTagPublic = { id: string; name: string; color: string };

export type SharedFolderPublic = {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  tagIds: string[];
};

export type ShareResolution =
  | {
      kind: "file";
      token: string;
      allowDownload: boolean;
      file: SharedFilePublic;
      tags: SharedTagPublic[];
    }
  | {
      kind: "folder";
      token: string;
      allowDownload: boolean;
      folder: { id: string; name: string; color: string | null };
      /** The shared folder's subtree (itself included), for nested browsing. */
      folders: SharedFolderPublic[];
      files: SharedFilePublic[];
      /** Every tag referenced by the folders/files above (names + colors). */
      tags: SharedTagPublic[];
    };

const toPublicFile = (row: VaultFileRow): SharedFilePublic => ({
  id: row.id,
  folderId: row.folderId,
  name: row.name,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  hasThumbnail: row.thumbnailKey != null,
  tagIds: row.tagIds,
  createdAt: row.createdAt.toISOString(),
});

/** The tag entities behind a set of referenced ids (names + colors only). */
async function publicTags(tagIds: string[]): Promise<SharedTagPublic[]> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: fileTags.id, name: fileTags.name, color: fileTags.color })
    .from(fileTags)
    .where(inArray(fileTags.id, unique));
  return rows;
}

/** The share row for a token, or null when unknown/expired. */
async function activeShareByToken(token: string) {
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const db = getDb();
  const [row] = await db.select().from(fileShares).where(eq(fileShares.token, token)).limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/**
 * Everything the public share page needs for a token, or null (unknown,
 * expired, or the target has since been deleted). For a folder link this loads
 * the subtree + its files — bounded by the same working-set reality as the
 * vault page (document folders, not filesystems).
 */
export async function resolveShare(token: string): Promise<ShareResolution | null> {
  const share = await activeShareByToken(token);
  if (!share) return null;
  const db = getDb();

  if (share.fileId) {
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId)).limit(1);
    if (!file) return null;
    const pub = toPublicFile(file);
    return {
      kind: "file",
      token: share.token,
      allowDownload: share.allowDownload,
      file: pub,
      tags: await publicTags(pub.tagIds),
    };
  }

  const [root] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, share.folderId!))
    .limit(1);
  if (!root) return null;
  const rows = await profileFolders(root.profileId);
  const subtree = subtreeFolderIds(rows, root.id);
  const [subFolders, subFiles] = await Promise.all([
    db
      .select({
        id: folders.id,
        parentId: folders.parentId,
        name: folders.name,
        color: folders.color,
        tagIds: folders.tagIds,
      })
      .from(folders)
      .where(inArray(folders.id, subtree))
      .orderBy(asc(folders.name)),
    db
      .select()
      .from(files)
      .where(inArray(files.folderId, subtree))
      .orderBy(asc(files.name)),
  ]);
  const pubFiles = subFiles.map(toPublicFile);
  const tags = await publicTags([
    ...subFolders.flatMap((f) => f.tagIds),
    ...pubFiles.flatMap((f) => f.tagIds),
  ]);
  return {
    kind: "folder",
    token: share.token,
    allowDownload: share.allowDownload,
    folder: { id: root.id, name: root.name, color: root.color },
    folders: subFolders,
    files: pubFiles,
    tags,
  };
}

/**
 * The file row a tokenized content request may serve, or null. A file link
 * serves exactly its file; a folder link serves any file inside the folder's
 * subtree. Also reports whether the link permits download.
 */
export async function getSharedFileForDownload(
  token: string,
  fileId: string,
): Promise<{ row: VaultFileRow; allowDownload: boolean } | null> {
  if (!isUuid(fileId)) return null;
  const share = await activeShareByToken(token);
  if (!share) return null;
  const db = getDb();
  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) return null;

  if (share.fileId) {
    if (share.fileId !== row.id) return null;
    return { row, allowDownload: share.allowDownload };
  }
  if (!row.folderId) return null;
  const rows = await profileFolders(row.profileId);
  if (!subtreeFolderIds(rows, share.folderId!).includes(row.folderId)) return null;
  return { row, allowDownload: share.allowDownload };
}
