import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq } from "drizzle-orm";
import { deleteObjects } from "@/lib/r2";
import {
  files,
  transactionAttachments,
  transactions,
  userSettings,
  users,
  workspaces,
} from "@/db/schema";
import { deleteAccount } from "@/services/settings";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";

/**
 * Account deletion is the erasure path a privacy policy promises, and it is
 * destructive in both directions: too little and someone's documents outlive
 * their account, too much and it reaches into a workspace that was never
 * theirs. Both halves are asserted here.
 *
 * The R2 half is the one that regressed unnoticed for months — every row went,
 * and the objects those rows pointed at stayed in the bucket, unreachable from
 * any screen and invisible to any later sweep. Nothing cascades in object
 * storage, so the keys have to be read before the delete and swept after.
 */
const swept = () => vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => keys ?? []);

async function seedFile(userId: string, profileId: string, key: string, thumb?: string) {
  await getTestDb()
    .insert(files)
    .values({
      workspaceId: await workspaceIdOf(userId),
      profileId,
      folderId: null,
      tagIds: [],
      userId: uid(userId),
      r2Key: key,
      thumbnailKey: thumb ?? null,
      name: "deed.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
}

async function seedAttachment(
  userId: string,
  txnId: string,
  profileId: string,
  key: string,
) {
  await getTestDb().insert(transactionAttachments).values({
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

describe("deleteAccount", () => {
  beforeEach(() => vi.mocked(deleteObjects).mockClear());

  it("refuses without the typed confirmation, and changes nothing", async () => {
    await bootstrapUser("a");
    await expect(deleteAccount(uid("a"), "delete")).rejects.toMatchObject({ status: 400 });
    const rows = await getTestDb().select().from(users).where(eq(users.id, uid("a")));
    expect(rows).toHaveLength(1);
    expect(swept()).toEqual([]);
  });

  it("removes the account's rows and sweeps the objects behind them", async () => {
    await bootstrapUser("a");
    const ws = await workspaceIdOf("a");
    const profile = await firstProfileId("a");
    const txn = await insertTxn("a", {
      amountMinor: 1000,
      type: "expense",
      occurredOn: "2026-09-01",
    });

    await seedFile("a", profile, "vault/deed.pdf", "vault/deed-thumb.webp");
    await seedAttachment("a", txn, profile, "attachments/receipt.pdf");

    await deleteAccount(uid("a"), "DELETE");

    const db = getTestDb();
    expect(await db.select().from(users).where(eq(users.id, uid("a")))).toHaveLength(0);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, ws))).toHaveLength(0);
    expect(
      await db.select().from(userSettings).where(eq(userSettings.userId, uid("a"))),
    ).toHaveLength(0);
    expect(await db.select().from(transactions).where(eq(transactions.id, txn))).toHaveLength(0);

    // Every key the account owned, and the thumbnail beside the original —
    // a preview is bytes in the bucket exactly like the file it previews.
    expect(swept()).toEqual(
      expect.arrayContaining([
        "vault/deed.pdf",
        "vault/deed-thumb.webp",
        "attachments/receipt.pdf",
      ]),
    );
  });

  it("leaves another account's workspace, rows and objects untouched", async () => {
    await bootstrapUser("a");
    await bootstrapUser("b");
    const otherWs = await workspaceIdOf("b");
    const otherProfile = await firstProfileId("b");
    await seedFile("b", otherProfile, "vault/not-yours.pdf");
    const otherTxn = await insertTxn("b", {
      amountMinor: 500,
      type: "income",
      occurredOn: "2026-09-01",
    });

    await deleteAccount(uid("a"), "DELETE");

    const db = getTestDb();
    expect(await db.select().from(users).where(eq(users.id, uid("b")))).toHaveLength(1);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, otherWs))).toHaveLength(1);
    expect(
      await db.select().from(transactions).where(eq(transactions.id, otherTxn)),
    ).toHaveLength(1);
    expect(await db.select().from(files).where(eq(files.profileId, otherProfile))).toHaveLength(1);
    expect(swept()).not.toContain("vault/not-yours.pdf");
  });
});
