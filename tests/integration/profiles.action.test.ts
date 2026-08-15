import { describe, it, expect, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";

// Only the R2 edge is mocked — a profile delete sweeps the objects behind the
// rows it removes, and that call is what these tests assert on.
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { deleteObject, deleteObjects } from "@/lib/r2";
import {
  fileShares,
  fileTags,
  files,
  folders,
  profiles,
  transactionAttachments,
  transactions,
} from "@/db/schema";
import {
  addProfile,
  updateProfile,
  deleteProfile,
  getProfileDeletionImpact,
  moveProfileTransactions,
  reorderProfiles,
  listProfiles,
} from "@/actions/profiles";
import { updateTransaction } from "@/actions/transactions";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";

/**
 * Every object key the code asked R2 to delete, however it asked: the sweep
 * batches (`deleteObjects`), single deletes go through `deleteObject`. Tests
 * assert on what left the bucket, not on which call shape carried it.
 */
function sweptKeys(): (string | null | undefined)[] {
  return [
    ...vi.mocked(deleteObject).mock.calls.map(([key]) => key),
    ...vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => [...(keys ?? [])]),
  ];
}

function clearSweeps() {
  vi.mocked(deleteObject).mockClear();
  vi.mocked(deleteObjects).mockClear();
}

/** Attach a stored file to a transaction, as `createAttachments` would. */
async function attach(userId: string, txnId: string, profileId: string, key: string) {
  await getTestDb()
    .insert(transactionAttachments)
    .values({
      transactionId: txnId,
      profileId,
      workspaceId: await workspaceIdOf(userId),
      userId: uid(userId),
      r2Key: key,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
}

/** Put a file in a profile's vault (the part a delete always takes with it). */
async function vaultFile(
  userId: string,
  profileId: string,
  key: string,
  opts: { folderId?: string; tagIds?: string[] } = {},
): Promise<string> {
  const [row] = await getTestDb()
    .insert(files)
    .values({
      workspaceId: await workspaceIdOf(userId),
      profileId,
      folderId: opts.folderId ?? null,
      tagIds: opts.tagIds ?? [],
      userId: uid(userId),
      r2Key: key,
      name: "notes.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    })
    .returning({ id: files.id });
  return row.id;
}

async function vaultFolder(
  userId: string,
  profileId: string,
  name: string,
  tagIds: string[] = [],
  systemKey: string | null = null,
): Promise<string> {
  const [row] = await getTestDb()
    .insert(folders)
    .values({
      workspaceId: await workspaceIdOf(userId),
      profileId,
      userId: uid(userId),
      name,
      tagIds,
      systemKey,
    })
    .returning({ id: folders.id });
  return row.id;
}

async function vaultTag(userId: string, profileId: string, name: string): Promise<string> {
  const [row] = await getTestDb()
    .insert(fileTags)
    .values({
      workspaceId: await workspaceIdOf(userId),
      profileId,
      userId: uid(userId),
      name,
      color: "#64748b",
    })
    .returning({ id: fileTags.id });
  return row.id;
}

async function vaultShare(userId: string, profileId: string, fileId: string, token: string) {
  await getTestDb()
    .insert(fileShares)
    .values({
      workspaceId: await workspaceIdOf(userId),
      profileId,
      fileId,
      userId: uid(userId),
      token,
    });
}

const profileByName = (userId: string, name: string) =>
  getTestDb()
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, uid(userId)), eq(profiles.name, name)))
    .limit(1)
    .then((r) => r[0]);

describe("addProfile", () => {
  it("appends with an incrementing sortOrder and returns the new id", async () => {
    signInAs("a");
    await bootstrapUser("a"); // Personal @ sortOrder 0

    const r1 = await addProfile({ name: "Work", icon: "💼", color: "" });
    const r2 = await addProfile({ name: "Home" });
    expect(r1.ok && r1.id).toBeTruthy();
    expect(r2.ok).toBe(true);

    expect((await profileByName("a", "Work")).sortOrder).toBe(1);
    expect((await profileByName("a", "Home")).sortOrder).toBe(2);
    expect((await profileByName("a", "Work")).color).toBeNull(); // "" → null
  });

  it("rejects invalid input and duplicate names", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await addProfile({ name: "" })).ok).toBe(false);
    await addProfile({ name: "Work" });
    expect(await addProfile({ name: "Work" })).toEqual({
      ok: false,
      error: "A profile with that name already exists",
    });
  });
});

describe("updateProfile", () => {
  it("updates supplied fields only", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await firstProfileId("a");
    expect((await updateProfile({ id, name: "Me", icon: "🙂", color: "" })).ok).toBe(true);
    let row = await profileByName("a", "Me");
    expect(row.icon).toBe("🙂");
    expect(row.color).toBeNull();

    // a blank icon is also cleared to null
    await updateProfile({ id, icon: "" });
    row = await profileByName("a", "Me");
    expect(row.icon).toBeNull();
  });

  it("rejects an invalid id and a colliding rename", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    expect((await updateProfile({ id: "bad" })).ok).toBe(false);
    expect(await updateProfile({ id: work.id, name: "Personal" })).toEqual({
      ok: false,
      error: "A profile with that name already exists",
    });
  });
});

describe("deleteProfile", () => {
  it("rejects an invalid id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await deleteProfile("nope")).toEqual({ ok: false, error: "Invalid profile" });
  });

  it("refuses to delete the only profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await firstProfileId("a");
    expect(await deleteProfile(id)).toEqual({
      ok: false,
      error: "You need at least one profile",
    });
  });

  it("refuses to delete a profile that still has transactions", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    expect(await deleteProfile(work.id)).toEqual({
      ok: false,
      error: "Move this profile's transactions to another profile first",
    });
  });

  it("deletes an empty, non-last profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    expect((await deleteProfile(work.id)).ok).toBe(true);
    expect(await profileByName("a", "Work")).toBeUndefined();
  });

  it("deletes the transactions (and their R2 objects) when asked to", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await attach("a", txn, work.id, "att/gone.pdf");

    expect((await deleteProfile(work.id, { transactions: "delete" })).ok).toBe(true);
    expect(await profileByName("a", "Work")).toBeUndefined();
    expect(
      await getTestDb().select().from(transactions).where(eq(transactions.id, txn)),
    ).toHaveLength(0);
    expect(sweptKeys()).toContain("att/gone.pdf");
  });

  it("moves the transactions and their attachments when asked to", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await attach("a", txn, work.id, "att/kept.pdf");

    expect(
      (await deleteProfile(work.id, { transactions: "move", toProfileId: personal })).ok,
    ).toBe(true);
    expect(await profileByName("a", "Work")).toBeUndefined();

    const [moved] = await getTestDb()
      .select()
      .from(transactions)
      .where(eq(transactions.id, txn));
    expect(moved.profileId).toBe(personal);
    // The attachment rides along: its denormalized profile_id is re-pointed, so
    // the profile's cascade can't take it (and its object is never swept).
    const [kept] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(kept.profileId).toBe(personal);
    expect(sweptKeys()).not.toContain("att/kept.pdf");
  });

  it("rejects a move with no destination", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    expect((await deleteProfile(work.id, { transactions: "move" })).ok).toBe(false);
  });

  it("deletes the profile's vault when its contents are deleted", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    await vaultFile("a", work.id, "vault/doc.pdf");

    expect((await deleteProfile(work.id, { transactions: "delete" })).ok).toBe(true);
    expect(
      await getTestDb().select().from(files).where(eq(files.profileId, work.id)),
    ).toHaveLength(0);
    expect(sweptKeys()).toContain("vault/doc.pdf");
  });

  /**
   * Deleting a profile isn't a decision to discard its documents. `move` used to
   * carry only the transactions, so the vault — folders, files, tags and share
   * links — was cascaded away and its objects swept, even though the user had
   * just said where everything should go.
   */
  it("moves the whole vault to the destination instead of deleting it", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const tag = await vaultTag("a", work.id, "Receipts");
    const folder = await vaultFolder("a", work.id, "Invoices", [tag]);
    const file = await vaultFile("a", work.id, "vault/doc.pdf", { folderId: folder, tagIds: [tag] });
    await vaultShare("a", work.id, file, "tok-move");

    expect(
      (await deleteProfile(work.id, { transactions: "move", toProfileId: personal })).ok,
    ).toBe(true);
    expect(await profileByName("a", "Work")).toBeUndefined();

    const db = getTestDb();
    const [movedFile] = await db.select().from(files).where(eq(files.id, file));
    expect(movedFile.profileId).toBe(personal);
    // The tree moves whole: the file is still inside the folder it was in.
    expect(movedFile.folderId).toBe(folder);
    const [movedFolder] = await db.select().from(folders).where(eq(folders.id, folder));
    expect(movedFolder.profileId).toBe(personal);
    const [movedTag] = await db.select().from(fileTags).where(eq(fileTags.id, tag));
    expect(movedTag.profileId).toBe(personal);
    const [movedShare] = await db.select().from(fileShares).where(eq(fileShares.fileId, file));
    expect(movedShare.profileId).toBe(personal);
    // Nothing was orphaned, so nothing may leave the bucket.
    expect(sweptKeys()).not.toContain("vault/doc.pdf");
  });

  /**
   * `file_tags` is unique on (profile_id, lower(name)), so a tag whose name is
   * already taken in the destination can't just be re-pointed — the move would
   * fail outright. It merges instead, and the file keeps the tag it was given.
   */
  it("merges a vault tag whose name already exists in the destination", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const mine = await vaultTag("a", personal, "Receipts");
    const theirs = await vaultTag("a", work.id, "receipts");
    const file = await vaultFile("a", work.id, "vault/tagged.pdf", { tagIds: [theirs] });

    expect(
      (await deleteProfile(work.id, { transactions: "move", toProfileId: personal })).ok,
    ).toBe(true);

    const db = getTestDb();
    const [moved] = await db.select().from(files).where(eq(files.id, file));
    expect(moved.tagIds).toEqual([mine]);
    // The duplicate is gone rather than sitting alongside its twin.
    expect(await db.select().from(fileTags).where(eq(fileTags.id, theirs))).toHaveLength(0);
  });

  /**
   * The predefined "Transaction attachments" folder is unique per profile, so
   * the source's can't move into a destination that already has one. It's
   * dropped — but `files.folder_id` is ON DELETE cascade, so anything still
   * under it has to be re-parented first or the drop destroys it.
   */
  it("re-parents out of the predefined folder rather than cascading it away", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const mine = await vaultFolder("a", personal, "Transaction attachments", [], "transactions");
    const theirs = await vaultFolder("a", work.id, "Transaction attachments", [], "transactions");
    const file = await vaultFile("a", work.id, "vault/inside.pdf", { folderId: theirs });

    expect(
      (await deleteProfile(work.id, { transactions: "move", toProfileId: personal })).ok,
    ).toBe(true);

    const db = getTestDb();
    const [moved] = await db.select().from(files).where(eq(files.id, file));
    expect(moved).toBeDefined();
    expect(moved.profileId).toBe(personal);
    expect(moved.folderId).toBe(mine);
    expect(await db.select().from(folders).where(eq(folders.id, theirs))).toHaveLength(0);
    expect(sweptKeys()).not.toContain("vault/inside.pdf");
  });

  /**
   * The single-transaction profile change (the transaction dialog's profile
   * <Select>, PATCH /transactions/{id}) used to leave the attachment row's
   * denormalized profile_id on the old profile. Deleting that now-empty profile
   * passed even in the default `reject` mode, cascaded the row away and swept
   * the object — so a transaction that is alive in another profile lost its
   * receipt from both the database and storage, unrecoverably.
   */
  it("keeps a re-filed transaction's receipt when its old profile is deleted", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await attach("a", txn, work.id, "att/receipt.pdf");

    // Re-file just this transaction, the way the transaction dialog does.
    expect(
      (
        await updateTransaction({
          id: txn,
          type: "expense",
          amount: 1,
          occurredOn: "2026-06-01",
          profileId: personal,
        })
      ).ok,
    ).toBe(true);

    const [moved] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(moved.profileId).toBe(personal);

    // "Work" now holds nothing, so the default (refusing) delete goes through.
    expect((await deleteProfile(work.id)).ok).toBe(true);

    const [survivor] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(survivor).toBeDefined();
    expect(survivor.profileId).toBe(personal);
    expect(sweptKeys()).not.toContain("att/receipt.pdf");
  });

  /**
   * Same loss, reached through a row that went stale before the fix above
   * existed. The delete heals it instead of destroying it, so no backfill is
   * required for the data to be safe.
   */
  it("rescues an attachment row stranded on the profile by an older move", async () => {
    signInAs("a");
    await bootstrapUser("a");
    clearSweeps();
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: personal,
    });
    // The transaction lives in Personal; its attachment still claims Work.
    await attach("a", txn, work.id, "att/stranded.pdf");

    expect((await deleteProfile(work.id)).ok).toBe(true);

    const [survivor] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(survivor).toBeDefined();
    expect(survivor.profileId).toBe(personal);
    expect(sweptKeys()).not.toContain("att/stranded.pdf");
  });

  /**
   * The database half is one transaction, so a failure at the last statement
   * undoes the disposal that ran before it. Without that, the transactions were
   * already moved (or deleted) when the profile delete failed: the user was
   * told the delete failed while their rows had silently gone somewhere else.
   *
   * A real concurrent insert can't be staged against a single-connection
   * PGlite, so the failure is injected as the error that race produces — a
   * foreign-key violation raised as the profile row is deleted.
   */
  it("rolls the move back when the profile delete fails, and says to retry", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await attach("a", txn, work.id, "att/kept.pdf");
    clearSweeps();

    await getTestDb().execute(sql`
      CREATE OR REPLACE FUNCTION pg_temp.fk_boom() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'referenced' USING ERRCODE = '23503'; END;
      $$ LANGUAGE plpgsql`);
    await getTestDb().execute(sql`
      CREATE TRIGGER fk_boom BEFORE DELETE ON profiles
        FOR EACH ROW EXECUTE FUNCTION pg_temp.fk_boom()`);
    let result;
    try {
      result = await deleteProfile(work.id, { transactions: "move", toProfileId: personal });
    } finally {
      await getTestDb().execute(sql`DROP TRIGGER fk_boom ON profiles`);
    }

    expect(result).toEqual({
      ok: false,
      error: "Something was added to this profile while it was being deleted — try again",
    });
    // Everything is exactly as it was: the profile, its transaction, and the
    // receipt — and nothing was swept out of the bucket.
    expect(await profileByName("a", "Work")).toBeDefined();
    const [stayed] = await getTestDb()
      .select()
      .from(transactions)
      .where(eq(transactions.id, txn));
    expect(stayed.profileId).toBe(work.id);
    const [receipt] = await getTestDb()
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, txn));
    expect(receipt.profileId).toBe(work.id);
    expect(sweptKeys()).toHaveLength(0);
  });
});

describe("getProfileDeletionImpact", () => {
  it("counts the transactions, vault files and receipts a delete would take", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await vaultFile("a", work.id, "vault/doc.pdf");
    await attach("a", txn, work.id, "att/receipt.pdf");

    expect(await getProfileDeletionImpact(work.id)).toEqual({
      ok: true,
      transactions: 1,
      files: 1,
      attachments: 1,
    });
  });

  /**
   * Receipts are counted through the parent transaction, like the sweep — a
   * profile with an empty vault and forty receipts reported `files: 0` and the
   * dialog said nothing about the documents it was about to destroy.
   */
  it("counts receipts on a profile with no vault files at all", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    const txn = await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: work.id,
    });
    await attach("a", txn, work.id, "att/a.pdf");
    await attach("a", txn, work.id, "att/b.pdf");

    expect(await getProfileDeletionImpact(work.id)).toEqual({
      ok: true,
      transactions: 1,
      files: 0,
      attachments: 2,
    });
  });

  it("rejects an invalid id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await getProfileDeletionImpact("nope")).toEqual({
      ok: false,
      error: "Invalid profile",
    });
  });
});

describe("moveProfileTransactions", () => {
  it("moves every transaction between two owned profiles", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    const work = await profileByName("a", "Work");
    await insertTxn("a", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: personal,
    });

    expect((await moveProfileTransactions(personal, work.id)).ok).toBe(true);
    const moved = await getTestDb()
      .select()
      .from(transactions)
      .where(eq(transactions.profileId, work.id));
    expect(moved).toHaveLength(1);
  });

  it("rejects bad ids and a no-op move", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    expect((await moveProfileTransactions("x", "y")).ok).toBe(false);
    expect(await moveProfileTransactions(personal, personal)).toEqual({
      ok: false,
      error: "Invalid profiles",
    });
  });

  it("rejects moving to an unowned profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const personal = await firstProfileId("a");
    const foreign = await firstProfileId("b");
    expect(await moveProfileTransactions(personal, foreign)).toEqual({
      ok: false,
      error: "Profile not found",
    });
  });
});

describe("reorderProfiles", () => {
  it("persists the given order as sortOrder", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    await addProfile({ name: "Work" });
    await addProfile({ name: "Home" });
    const work = await profileByName("a", "Work");
    const home = await profileByName("a", "Home");

    expect((await reorderProfiles([home.id, work.id, personal])).ok).toBe(true);
    const ordered = await listProfiles();
    expect(ordered.map((p) => p.name)).toEqual(["Home", "Work", "Personal"]);
  });

  it("rejects an invalid payload", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await reorderProfiles([])).ok).toBe(false);
  });
});

describe("listProfiles", () => {
  it("bootstraps and returns the user's profiles", async () => {
    signInAs("fresh");
    const list = await listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Personal");
  });
});
