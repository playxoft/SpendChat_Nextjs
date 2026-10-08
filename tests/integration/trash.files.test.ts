import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq, sql } from "drizzle-orm";
import { deleteObject, deleteObjects, uploadObject } from "@/lib/r2";
import { files, folders } from "@/db/schema";
import { deleteFile, deleteFolder, updateFolder, uploadVaultFiles } from "@/services/files";
import { lockFolderAncestors, lockFolderSubtree, retryOnDeadlock, type Tx } from "@/services/vault-tree";
import { deleteFromTrash, listTrashVault, restoreFromTrash } from "@/services/trash";
import { getVaultFile, getVaultFolder } from "@/lib/queries";
import { signInAs, uid } from "./helpers/session";
import { captureSql, getTestDb } from "./helpers/test-db";
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

  /**
   * S1: something live found under a trashed folder — a move that raced the
   * trashing, or older data — is never destroyed with it: delete-for-good and
   * the purge move it to the top level first, and sweep only the bytes of rows
   * they actually deleted.
   */
  it("deleting a folder for good moves anything live under it to the top level instead", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const sub = await seedFolder("a", P, "2025", top);
    await seedFile("a", P, { folderId: sub, key: "vault/deep.pdf" });
    await deleteFolder(U, W, top);
    // A file and a folder that landed inside after the folder went to the trash.
    const racedFile = await seedFile("a", P, { folderId: sub, key: "vault/raced.pdf" });
    const racedFolder = await seedFolder("a", P, "Deeds", sub);
    const inRaced = await seedFile("a", P, { folderId: racedFolder, key: "vault/in-deeds.pdf" });

    const res = await deleteFromTrash(U, W, { folderIds: [top] });
    expect(res.counts.folders).toBe(1);
    expect(await folderRow(top)).toBeUndefined();
    expect(await folderRow(sub)).toBeUndefined();
    // The live ones survive, at the top level, with their own contents.
    expect((await fileRow(racedFile))?.folderId).toBeNull();
    expect((await folderRow(racedFolder))?.parentId).toBeNull();
    expect((await fileRow(inRaced))?.folderId).toBe(racedFolder);
    expect(swept()).toContain("vault/deep.pdf");
    expect(swept()).not.toContain("vault/raced.pdf");
    expect(swept()).not.toContain("vault/in-deeds.pdf");
  });

  /**
   * S1, the race itself: B moves "Deeds" into Taxes/2025 while A deletes
   * Taxes. The subtree used to be read before the delete's transaction, so a
   * move that committed in between left Deeds live under a trashed folder. It's
   * now read inside the transaction, after the root is locked — reproduced
   * here by a trigger that performs B's move at exactly that moment.
   */
  it("a folder moved into the subtree while it goes to the trash goes with it", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const sub = await seedFolder("a", P, "2025", top);
    const deeds = await seedFolder("a", P, "Deeds");
    const inDeeds = await seedFile("a", P, { folderId: deeds });
    await getTestDb().execute(sql.raw(`
      CREATE OR REPLACE FUNCTION pg_temp.race_move() RETURNS trigger AS $$
        BEGIN
          IF NEW.id = '${top}'::uuid AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
            UPDATE folders SET parent_id = '${sub}'::uuid WHERE id = '${deeds}'::uuid;
          END IF;
          RETURN NEW;
        END;
      $$ LANGUAGE plpgsql`));
    await getTestDb().execute(sql.raw(`
      CREATE TRIGGER race_move AFTER UPDATE ON folders
        FOR EACH ROW EXECUTE FUNCTION pg_temp.race_move()`));
    try {
      expect(await deleteFolder(U, W, top)).toBe("trashed");
    } finally {
      await getTestDb().execute(sql.raw(`DROP TRIGGER race_move ON folders`));
    }
    const stamp = (await folderRow(top))!.deletedAt!.getTime();
    expect((await folderRow(deeds))!.deletedAt?.getTime()).toBe(stamp);
    expect((await fileRow(inDeeds))!.deletedAt?.getTime()).toBe(stamp);
    // And a restore brings it back with the rest.
    await restoreFromTrash(U, W, { folderIds: [top] });
    expect((await folderRow(deeds))!.deletedAt).toBeNull();
    expect((await fileRow(inDeeds))!.deletedAt).toBeNull();
  });

  /**
   * S1: a file restored into its folder is part of that folder from then on —
   * trashing the folder afterwards takes it along (the trash reads the subtree
   * inside its transaction), so it's never left live inside a trashed folder.
   * (The `FOR SHARE` the restore takes on the folder covers the concurrent
   * version, which a single-connection test database can't stage.)
   */
  it("a file restored into its folder goes to the trash with that folder", async () => {
    const top = await seedFolder("a", P, "Taxes");
    const file = await seedFile("a", P, { folderId: top });
    await deleteFile(U, W, file);
    await restoreFromTrash(U, W, { fileIds: [file] });
    expect((await fileRow(file))!.folderId).toBe(top);
    await deleteFolder(U, W, top);
    expect((await fileRow(file))!.deletedAt?.getTime()).toBe((await folderRow(top))!.deletedAt!.getTime());
  });
});

/**
 * Round 2 of the review. Folder writers lock rows in different orders — a
 * delete locks the subtree top-down, a move share-locks its destination then
 * updates the folder, a restore locks the child then its parent — so two of
 * them can deadlock, and Postgres aborts one with 40P01. Each folder
 * transaction runs once more when that happens. A single-connection test
 * database can't deadlock, so a trigger raises 40P01 at the first folder
 * update instead (a sequence counts the attempts — it isn't rolled back).
 */
describe("folder changes chosen as a deadlock victim", () => {
  beforeEach(async () => setWorkspacePlan(W, "plus"));

  async function withDeadlocks(times: number, run: () => Promise<unknown>) {
    const db = getTestDb();
    await db.execute(sql.raw(`CREATE TEMP SEQUENCE deadlock_attempts`));
    await db.execute(
      sql.raw(`
      CREATE OR REPLACE FUNCTION pg_temp.deadlock_victim() RETURNS trigger AS $$
        BEGIN
          IF nextval('deadlock_attempts') <= ${times} THEN
            RAISE EXCEPTION 'deadlock detected' USING ERRCODE = '40P01';
          END IF;
          RETURN NEW;
        END;
      $$ LANGUAGE plpgsql`),
    );
    await db.execute(
      sql.raw(`CREATE TRIGGER deadlock_victim BEFORE UPDATE ON folders
        FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.deadlock_victim()`),
    );
    try {
      return await run();
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER deadlock_victim ON folders`));
      await db.execute(sql.raw(`DROP SEQUENCE deadlock_attempts`));
    }
  }

  it("a folder delete is retried once and goes through", async () => {
    const top = await seedFolder("a", P, "Taxes");
    expect(await withDeadlocks(1, () => deleteFolder(U, W, top))).toBe("trashed");
    expect((await folderRow(top))!.deletedAt).not.toBeNull();
  });

  it("a folder move is retried once and goes through", async () => {
    const a = await seedFolder("a", P, "A");
    const b = await seedFolder("a", P, "B");
    await withDeadlocks(1, () => updateFolder(U, W, { id: a, parentId: b }));
    expect((await folderRow(a))!.parentId).toBe(b);
  });

  it("a folder restore is retried once and goes through", async () => {
    const top = await seedFolder("a", P, "Taxes");
    await deleteFolder(U, W, top);
    const res = (await withDeadlocks(1, () => restoreFromTrash(U, W, { folderIds: [top] }))) as {
      counts: { folders: number };
    };
    expect(res.counts.folders).toBe(1);
    expect((await folderRow(top))!.deletedAt).toBeNull();
  });

  it("only once: a second deadlock is reported, and nothing was half-done", async () => {
    const top = await seedFolder("a", P, "Taxes");
    await expect(withDeadlocks(2, () => deleteFolder(U, W, top))).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "40P01" }),
    });
    expect((await folderRow(top))!.deletedAt).toBeNull();
  });

  it("anything that isn't a deadlock is not retried", async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls++;
        throw Object.assign(new Error("unique"), { code: "23505" });
      }),
    ).rejects.toThrow("unique");
    expect(calls).toBe(1);
  });
});

describe("locked folder walks", () => {
  /** A transaction handle whose every walk finds one more folder than the last. */
  function growingTx(): Tx {
    let n = 0;
    return {
      execute: async () => {
        n++;
        return {
          rows: Array.from({ length: n }, (_, i) => ({
            id: `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`,
            parent_id: null,
            profile_id: P,
            deleted_at: null,
          })),
        };
      },
    } as unknown as Tx;
  }

  it("throw rather than return a set that never stopped growing", async () => {
    await expect(lockFolderSubtree(growingTx(), ["root"])).rejects.toThrow(/still growing/);
    await expect(lockFolderAncestors(growingTx(), "leaf")).rejects.toThrow(/still changing/);
  });

  it("a move's cycle check runs inside the move's transaction, under lock, before the update", async () => {
    await setWorkspacePlan(W, "plus");
    const a = await seedFolder("a", P, "A");
    const b = await seedFolder("a", P, "B");
    const sent = await captureSql(() => updateFolder(U, W, { id: a, parentId: b }));
    const walk = sent.findIndex((s) => /with recursive up/.test(s.text));
    const update = sent.findIndex((s) => /^update "folders"/.test(s.text));
    expect(walk).toBeGreaterThan(-1);
    expect(sent[walk]!.text).toMatch(/for share of f/);
    expect(sent[walk]!.tx).not.toBeNull();
    expect(sent[walk]!.tx).toBe(sent[update]!.tx);
    expect(walk).toBeLessThan(update);
  });

  it("moving a folder under its own descendant is refused", async () => {
    const a = await seedFolder("a", P, "A");
    const child = await seedFolder("a", P, "Child", a);
    const grandchild = await seedFolder("a", P, "Grandchild", child);
    await expect(updateFolder(U, W, { id: a, parentId: grandchild })).rejects.toMatchObject({ status: 400 });
    expect((await folderRow(a))!.parentId).toBeNull();
  });

  /**
   * A stored cycle (from before the check moved under lock) must not hang
   * anything: both walks use `union`, which stops at a row it has seen.
   */
  it("a stored cycle doesn't hang a restore or a move", async () => {
    await setWorkspacePlan(W, "plus");
    const a = await seedFolder("a", P, "A");
    const b = await seedFolder("a", P, "B", a);
    await deleteFolder(U, W, a);
    await getTestDb().update(folders).set({ parentId: b }).where(eq(folders.id, a));
    const res = await restoreFromTrash(U, W, { folderIds: [a] });
    expect(res.counts.folders).toBe(2);
    // Its parent was in the trash when it came back, so it's at the top now.
    expect((await folderRow(a))!.parentId).toBeNull();

    const c = await seedFolder("a", P, "C");
    const d = await seedFolder("a", P, "D", c);
    await getTestDb().update(folders).set({ parentId: d }).where(eq(folders.id, c));
    const e = await seedFolder("a", P, "E");
    await updateFolder(U, W, { id: e, parentId: c });
    expect((await folderRow(e))!.parentId).toBe(c);
  });
});
