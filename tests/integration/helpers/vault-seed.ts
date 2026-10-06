import { files, folders, profiles, transactionAttachments } from "@/db/schema";
import { getTestDb } from "./test-db";
import { uid } from "./session";
import { defaultSpaceIdOf, workspaceIdOf } from "./seed";

/**
 * Direct inserts for the vault and receipts — the trash suites need rows in
 * exact shapes (sizes, folders, keys) without going through R2.
 */

export async function seedFile(
  alias: string,
  profileId: string,
  opts: { key?: string; folderId?: string | null; sizeBytes?: number; name?: string } = {},
): Promise<string> {
  const [row] = await getTestDb()
    .insert(files)
    .values({
      workspaceId: await workspaceIdOf(alias),
      profileId,
      folderId: opts.folderId ?? null,
      userId: uid(alias),
      r2Key: opts.key ?? `vault/${crypto.randomUUID()}.pdf`,
      thumbnailKey: null,
      name: opts.name ?? "doc.pdf",
      contentType: "application/pdf",
      sizeBytes: opts.sizeBytes ?? 10,
    })
    .returning({ id: files.id });
  return row!.id;
}

export async function seedFolder(
  alias: string,
  profileId: string,
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const [row] = await getTestDb()
    .insert(folders)
    .values({
      workspaceId: await workspaceIdOf(alias),
      profileId,
      parentId,
      userId: uid(alias),
      name,
    })
    .returning({ id: folders.id });
  return row!.id;
}

export async function seedReceipt(
  alias: string,
  transactionId: string,
  profileId: string,
  opts: { key?: string; sizeBytes?: number } = {},
): Promise<string> {
  const [row] = await getTestDb()
    .insert(transactionAttachments)
    .values({
      transactionId,
      profileId,
      workspaceId: await workspaceIdOf(alias),
      userId: uid(alias),
      r2Key: opts.key ?? `attachments/${crypto.randomUUID()}.pdf`,
      thumbnailKey: null,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: opts.sizeBytes ?? 10,
    })
    .returning({ id: transactionAttachments.id });
  return row!.id;
}

/** A second profile in the workspace's default space, by direct insert. */
export async function seedProfile(alias: string, name: string): Promise<string> {
  const ws = await workspaceIdOf(alias);
  const [row] = await getTestDb()
    .insert(profiles)
    .values({ userId: uid(alias), workspaceId: ws, spaceId: await defaultSpaceIdOf(ws), name, sortOrder: 9 })
    .returning({ id: profiles.id });
  return row!.id;
}
