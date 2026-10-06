import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { getTrashBytes, getWorkspaceStorageUsage } from "@/lib/queries";
import { assertStorageQuota } from "@/lib/storage-quota";
import { getUsage } from "@/lib/entitlements";
import { PLAN_LIMITS } from "@/lib/plans";
import { deleteFile, deleteFolder } from "@/services/files";
import { deleteTransaction } from "@/services/transactions";
import { deleteProfile } from "@/services/profiles";
import { deleteFromTrash, emptyTrash } from "@/services/trash";
import { purgeExpiredTrash } from "@/lib/trash-purge";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, firstProfileId, insertTxn, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { seedFile, seedFolder, seedProfile, seedReceipt } from "./helpers/vault-seed";

/**
 * Abuse rule C6 — "using the trash as free storage". Trashed files, the
 * receipts of trashed transactions and everything under a trashed profile keep
 * counting toward the workspace's storage until they are purged; every upload
 * is checked against that total before it starts. Storage frees only when the
 * bytes really go: delete for good, empty trash, or the 30-day purge — or at
 * once on Free, which has no file trash.
 */

const MB = 1024 * 1024;
const DAY = 86_400_000;
let U: string;
let W: string;
let P: string;

beforeEach(async () => {
  signInAs("a");
  await bootstrapUser("a");
  U = uid("a");
  W = await workspaceIdOf("a");
  P = await firstProfileId("a");
  await setWorkspacePlan(W, "plus");
});

describe("C6 — trash counts toward storage", () => {
  it("C6: trashed vault files still count toward workspace storage until purged", async () => {
    const id = await seedFile("a", P, { sizeBytes: 3 * MB });
    const folder = await seedFolder("a", P, "Docs");
    await seedFile("a", P, { folderId: folder, sizeBytes: 2 * MB });
    expect(await getWorkspaceStorageUsage(W)).toBe(5 * MB);

    await deleteFile(U, W, id);
    await deleteFolder(U, W, folder);
    expect(await getWorkspaceStorageUsage(W)).toBe(5 * MB);
    expect(await getTrashBytes(W)).toBe(5 * MB);
    expect((await getUsage(W)).storage).toMatchObject({ usedBytes: 5 * MB, trashBytes: 5 * MB });
  });

  it("C6: receipts on trashed transactions still count toward storage", async () => {
    const txn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await seedReceipt("a", txn, P, { sizeBytes: 4 * MB });
    await deleteTransaction(U, W, txn);
    expect(await getWorkspaceStorageUsage(W)).toBe(4 * MB);
    expect(await getTrashBytes(W)).toBe(4 * MB);
  });

  it("C6: a trashed profile's files and receipts keep counting until purged", async () => {
    const work = await seedProfile("a", "Work");
    const txn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01", profileId: work });
    await seedReceipt("a", txn, work, { sizeBytes: 1 * MB });
    await seedFile("a", work, { sizeBytes: 2 * MB });
    await deleteProfile(U, work, { transactions: "delete" });
    expect(await getWorkspaceStorageUsage(W)).toBe(3 * MB);
    expect(await getTrashBytes(W)).toBe(3 * MB);
  });

  it("C6: an upload is refused when only trashed bytes keep the workspace over its limit", async () => {
    const limit = PLAN_LIMITS.plus.storageBytes;
    // Fill the workspace to 1 MB short of its limit, then put it all in the trash.
    const id = await seedFile("a", P, { sizeBytes: limit - MB });
    await deleteFile(U, W, id);
    // Without C6 a 2 MB upload would fit (live usage is zero). It must not.
    const refused = await assertStorageQuota(W, 2 * MB).catch((e: unknown) => e);
    expect(refused).toMatchObject({ status: 413, code: "storage_quota_exceeded" });
    // …and the refusal says how to get the space back.
    expect((refused as Error).message).toContain("Emptying the trash frees");
    expect((refused as { details: { trashBytes: number } }).details.trashBytes).toBe(limit - MB);
    // A small one still fits in what's left.
    await expect(assertStorageQuota(W, MB / 2)).resolves.toBeUndefined();
  });

  it("C6: delete forever, empty trash and the purge free the storage", async () => {
    const a = await seedFile("a", P, { sizeBytes: 1 * MB });
    const b = await seedFile("a", P, { sizeBytes: 2 * MB });
    const c = await seedFile("a", P, { sizeBytes: 4 * MB });
    for (const id of [a, b, c]) await deleteFile(U, W, id);
    expect(await getWorkspaceStorageUsage(W)).toBe(7 * MB);

    await deleteFromTrash(U, W, { fileIds: [a] });
    expect(await getWorkspaceStorageUsage(W)).toBe(6 * MB);

    // The purge takes only what is past 30 days.
    await purgeExpiredTrash({ now: new Date(Date.now() + 31 * DAY), batchSize: 1 });
    expect(await getWorkspaceStorageUsage(W)).toBe(0);

    const d = await seedFile("a", P, { sizeBytes: 1 * MB });
    await deleteFile(U, W, d);
    await emptyTrash(U, W);
    expect(await getWorkspaceStorageUsage(W)).toBe(0);
    expect(await getTrashBytes(W)).toBe(0);
  });

  it("C6: on Free a file delete frees storage at once (no file trash)", async () => {
    await setWorkspacePlan(W, "free");
    const id = await seedFile("a", P, { sizeBytes: 3 * MB });
    expect(await deleteFile(U, W, id)).toBe("deleted");
    expect(await getWorkspaceStorageUsage(W)).toBe(0);
  });
});
