import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq } from "drizzle-orm";
import { deleteObject, deleteObjects, uploadObject } from "@/lib/r2";
import { files, folders } from "@/db/schema";
import { deleteFile, deleteFolder, uploadVaultFiles } from "@/services/files";
import { deleteFromTrash, listTrashVault, restoreFromTrash } from "@/services/trash";
import { getVaultFile, getVaultFolder } from "@/lib/queries";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { seedFile, seedFolder } from "./helpers/vault-seed";

const swept = () => [
  ...vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => [...(keys ?? [])]),
  ...vi.mocked(deleteObject).mock.calls.map(([key]) => key),
];
const fileRow = async (id: string) => (await getTestDb().select().from(files).where(eq(files.id, id)))[0];
const folderRow = async (id: string) =>
  (await getTestDb().select().from(folders).where(eq(folders.id, id)))[0];

let U: string;
let W: string;
let P: string;

beforeEach(async () => {
  vi.mocked(deleteObjects).mockClear();
  vi.mocked(deleteObject).mockClear();
  vi.mocked(uploadObject).mockClear();
  signInAs("a");
  await bootstrapUser("a");
  U = uid("a");
  W = await workspaceIdOf("a");
  P = await firstProfileId("a");
});

describe("by plan", () => {
  it("Plus moves a file to the trash and keeps its bytes", async () => {
    await setWorkspacePlan(W, "plus");
    const id = await seedFile("a", P, { key: "vault/a.pdf" });
    expect(await deleteFile(U, W, id)).toBe("trashed");
    expect((await fileRow(id))!.deletedAt).toBeInstanceOf(Date);
    expect(await getVaultFile(U, W, id)).toBeNull();
    expect(swept()).toHaveLength(0);
  });

  it("Free deletes a file for good, bytes and all", async () => {
    const id = await seedFile("a", P, { key: "vault/free.pdf" });
    expect(await deleteFile(U, W, id)).toBe("deleted");
    expect(await fileRow(id)).toBeUndefined();
    expect(swept()).toContain("vault/free.pdf");
  });

  it("Free deletes a folder tree for good", async () => {
    const top = await seedFolder("a", P, "Top");
    await seedFile("a", P, { folderId: top, key: "vault/in-top.pdf" });
    expect(await deleteFolder(U, W, top)).toBe("deleted");
    expect(await folderRow(top)).toBeUndefined();
    expect(swept()).toContain("vault/in-top.pdf");
  });

  it("after a downgrade, what is already in the trash stays restorable; new deletes are permanent", async () => {
    await setWorkspacePlan(W, "plus");
    const kept = await seedFile("a", P);
    await deleteFile(U, W, kept);
    await setWorkspacePlan(W, "free");

    const fresh = await seedFile("a", P);
    expect(await deleteFile(U, W, fresh)).toBe("deleted");
    expect((await listTrashVault(U, W)).files.map((f) => f.id)).toEqual([kept]);
    expect((await restoreFromTrash(U, W, { fileIds: [kept] })).counts.files).toBe(1);
    expect(await getVaultFile(U, W, kept)).not.toBeNull();
  });
});

describe("folder trees (Plus)", () => {
  beforeEach(async () => setWorkspacePlan(W, "plus"));

  it("trash the whole subtree with one stamp, and list it as one item", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const sub = await seedFolder("a", P, "2025", top);
    const a = await seedFile("a", P, { folderId: top, sizeBytes: 100 });
    const b = await seedFile("a", P, { folderId: sub, sizeBytes: 50 });

    expect(await deleteFolder(U, W, top)).toBe("trashed");
    const stamps = new Set(
      [await folderRow(top), await folderRow(sub), await fileRow(a), await fileRow(b)].map((r) =>
        r!.deletedAt!.getTime(),
      ),
    );
    expect(stamps.size).toBe(1);
    expect(await getVaultFolder(U, W, sub)).toBeNull();

    const trash = await listTrashVault(U, W);
    expect(trash.folders.map((f) => [f.id, f.folders, f.files, f.sizeBytes])).toEqual([[top, 1, 2, 150]]);
    expect(trash.files).toEqual([]); // inside the folder — not listed on their own
  });

  it("restoring a folder brings back what went with it — not what was trashed before", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const earlier = await seedFile("a", P, { folderId: top });
    const withIt = await seedFile("a", P, { folderId: top });
    await deleteFile(U, W, earlier);
    // A moment later — a different stamp.
    await new Promise((r) => setTimeout(r, 5));
    await deleteFolder(U, W, top);

    const listed = await listTrashVault(U, W);
    expect(listed.folders.map((f) => f.id)).toEqual([top]);
    expect(listed.files.map((f) => f.id)).toEqual([earlier]);

    const res = await restoreFromTrash(U, W, { folderIds: [top] });
    expect(res.counts).toMatchObject({ folders: 1, files: 1 });
    expect(await getVaultFile(U, W, withIt)).not.toBeNull();
    expect(await getVaultFile(U, W, earlier)).toBeNull();

    // And that one, restored now, goes back into its (live again) folder.
    await restoreFromTrash(U, W, { fileIds: [earlier] });
    expect((await fileRow(earlier))!.folderId).toBe(top);
  });

  it("a file whose folder is still in the trash comes back at the top level", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const inside = await seedFile("a", P, { folderId: top });
    await deleteFolder(U, W, top);
    expect((await restoreFromTrash(U, W, { fileIds: [inside] })).counts.files).toBe(1);
    expect((await fileRow(inside))!.folderId).toBeNull();
    expect(await getVaultFile(U, W, inside)).not.toBeNull();
  });

  it("a restored folder whose name was taken meanwhile is renamed", async () => {
    const top = await seedFolder("a", P, "Taxes");
    await deleteFolder(U, W, top);
    await seedFolder("a", P, "taxes"); // case-insensitive clash
    await restoreFromTrash(U, W, { folderIds: [top] });
    expect((await folderRow(top))!.name).toBe("Taxes (restored)");
  });

  it("uploads into a folder in the trash are refused and leave no bytes behind", async () => {
    const top = await seedFolder("a", P, "Taxes");
    await deleteFolder(U, W, top);
    await expect(
      uploadVaultFiles(U, W, { profileId: P, folderId: top }, [
        { fileName: "a.pdf", contentType: "application/pdf", bytes: new ArrayBuffer(4), size: 4 },
      ]),
    ).rejects.toMatchObject({ status: 404 });
    // Refused before anything was uploaded.
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("deleting a folder for good sweeps every file under it, even one that raced in live", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const sub = await seedFolder("a", P, "2025", top);
    await seedFile("a", P, { folderId: sub, key: "vault/deep.pdf" });
    await deleteFolder(U, W, top);
    // A file that landed inside after the folder went (the race the share lock
    // closes) — whatever its own state, the sweep must not strand it.
    await seedFile("a", P, { folderId: sub, key: "vault/raced.pdf" });

    const res = await deleteFromTrash(U, W, { folderIds: [top] });
    expect(res.counts.folders).toBe(1);
    expect(await folderRow(top)).toBeUndefined();
    expect(await folderRow(sub)).toBeUndefined();
    expect(swept()).toEqual(expect.arrayContaining(["vault/deep.pdf", "vault/raced.pdf"]));
  });
});
