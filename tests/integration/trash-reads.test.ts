import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import * as queries from "@/lib/queries";
import { createTxnTag, countTransactionsForTxnTag } from "@/services/tags";
import {
  deleteTransaction,
  setTransactionTags,
  updateTransaction,
  updateTransactions,
} from "@/services/transactions";
import { createAttachments } from "@/services/attachments";
import {
  createFileShare,
  createFolder,
  deleteFile,
  deleteFolder,
  getSharedFileForDownload,
  getVaultWorkingSet,
  resolveShare,
  updateFile,
  uploadVaultFiles,
} from "@/services/files";
import { deleteProfile, getProfileDeletionImpact } from "@/services/profiles";
import { GET as listTxnsRoute } from "@/app/api/v1/transactions/route";
import { GET as txnRoute } from "@/app/api/v1/transactions/[id]/route";
import { GET as summaryRoute } from "@/app/api/v1/analytics/summary/route";
import { GET as categoriesRoute } from "@/app/api/v1/analytics/categories/route";
import { GET as monthlyRoute } from "@/app/api/v1/analytics/monthly/route";
import { GET as filesRoute } from "@/app/api/v1/files/route";
import { GET as profilesRoute } from "@/app/api/v1/profiles/route";
import { GET as exportRoute } from "@/app/api/v1/transactions/export/route";
import { GET as webExportRoute } from "@/app/api/transactions/export/route";
import { signInAs, uid } from "./helpers/session";
import {
  bootstrapUser,
  categoryId,
  firstProfileId,
  insertTxn,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";
import { seedFile, seedFolder, seedProfile, seedReceipt } from "./helpers/vault-seed";
import { apiReq, ctx } from "./api/helpers";

/**
 * **The behavioural proof that every read excludes the trash.**
 *
 * One workspace holds, side by side, live rows and every kind of trash: a
 * trashed transaction (with a receipt, a tag and a category), a trashed
 * *profile* still holding live rows and a file, a trashed file, and a trashed
 * folder with a subtree — plus share links to each. Every exported read of
 * `lib/queries.ts` (all list shapes), every `/api/v1` GET and both exports run
 * against it; none may show a trashed id, and every total must be the
 * live-only total. Writes against trashed ids must read as "not found".
 *
 * `REGISTRY` below names every export of `queries.ts`; the last test fails if
 * the module grows an export this suite doesn't account for, so a new read
 * can't skip it. The static side is `tests/unit/trash-coverage.test.ts`.
 */

const A = "a";
let U: string;
let W: string;
let personal: string;
let work: string;
let old: string;
let groceries: string;
let tag: string;

/** Live ids, and the trash. */
const live = { txn: "", txnWork: "", file: "", folder: "", fileShare: "" };
const trashed = {
  txn: "",
  txnInProfile: "",
  receipt: "",
  receiptInProfile: "",
  file: "",
  folder: "",
  subfolder: "",
  fileInFolder: "",
  fileInProfile: "",
  shares: [] as string[],
};

beforeEach(async () => {
  signInAs(A);
  await bootstrapUser(A);
  U = uid(A);
  W = await workspaceIdOf(A);
  await setWorkspacePlan(W, "plus"); // Plus: files and folders have a trash
  personal = await firstProfileId(A);
  work = await seedProfile(A, "Work");
  old = await seedProfile(A, "Old");
  groceries = await categoryId(A, "Groceries", "expense");
  tag = (await createTxnTag(U, W, { name: "Trip", color: "#64748b" })).id;

  // Transactions: live in two profiles; one trashed; one in a profile that goes.
  live.txn = await insertTxn(A, {
    type: "expense", amountMinor: 1000, occurredOn: "2026-06-01", categoryId: groceries,
    profileId: personal, title: "apple pie",
  });
  live.txnWork = await insertTxn(A, {
    type: "income", amountMinor: 3000, occurredOn: "2026-06-03", profileId: work, title: "salary",
  });
  trashed.txn = await insertTxn(A, {
    type: "expense", amountMinor: 700, occurredOn: "2026-06-02", categoryId: groceries,
    profileId: personal, title: "apple tart",
  });
  trashed.txnInProfile = await insertTxn(A, {
    type: "expense", amountMinor: 500, occurredOn: "2026-06-02", categoryId: groceries,
    profileId: old, title: "apple crumble",
  });
  for (const id of [live.txn, trashed.txn, trashed.txnInProfile]) {
    await setTransactionTags(U, W, id, { tagIds: [tag] });
  }
  await seedReceipt(A, live.txn, personal);
  trashed.receipt = await seedReceipt(A, trashed.txn, personal);
  trashed.receiptInProfile = await seedReceipt(A, trashed.txnInProfile, old);

  // Vault: a live file and folder, a trashed file, a trashed folder tree, and a
  // file in the profile that goes to the trash.
  live.file = await seedFile(A, personal);
  live.folder = await seedFolder(A, personal, "Keep");
  trashed.file = await seedFile(A, personal);
  trashed.folder = await seedFolder(A, personal, "Taxes");
  trashed.subfolder = await seedFolder(A, personal, "2025", trashed.folder);
  trashed.fileInFolder = await seedFile(A, personal, { folderId: trashed.subfolder });
  trashed.fileInProfile = await seedFile(A, old);

  // Share links, created while everything is live.
  live.fileShare = (await createFileShare(U, W, { fileId: live.file })).token;
  trashed.shares = [
    (await createFileShare(U, W, { fileId: trashed.file })).token,
    (await createFileShare(U, W, { folderId: trashed.folder })).token,
    (await createFileShare(U, W, { fileId: trashed.fileInProfile })).token,
    (await createFileShare(U, W, { fileId: trashed.fileInFolder })).token,
  ];

  // Now the trash.
  expect(await deleteTransaction(U, W, trashed.txn)).toBe(true);
  expect(await deleteFile(U, W, trashed.file)).toBe("trashed");
  expect(await deleteFolder(U, W, trashed.folder)).toBe("trashed");
  expect(await deleteProfile(U, old, { transactions: "delete" })).toBe(true);
});

const TRASHED_TXNS = () => [trashed.txn, trashed.txnInProfile];
const TRASHED_FILES = () => [trashed.file, trashed.fileInFolder, trashed.fileInProfile];

function ids(rows: { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

/** Every export of `lib/queries.ts`, and how this suite covers it. */
const REGISTRY = {
  // Reads of transactions — each exercised below.
  listTransactions: "transactions",
  getTransactionById: "transactions",
  getTransactionsByIds: "transactions",
  listTransactionsAsc: "transactions",
  listFeedPage: "transactions",
  countTransactions: "transactions",
  listTransactionIds: "transactions",
  getSummary: "transactions",
  getMonthlyTotals: "transactions",
  getCategoryBreakdown: "transactions",
  getMonthlyTrend: "transactions",
  getTagsWithUsage: "transactions",
  getProfiles: "profiles",
  listTransactionAttachments: "receipts",
  getAttachmentById: "receipts",
  listVaultFolders: "vault",
  listVaultFiles: "vault",
  getVaultFile: "vault",
  getVaultFolder: "vault",
  listTransactionFilesForVault: "receipts",
  // The trash's own read (only trash), and storage (deliberately everything, C6).
  listTrashedTransactions: "trash",
  getWorkspaceStorageUsage: "storage",
  getWorkspaceStorageUsageCached: "storage",
  getTrashBytes: "storage",
  // Not reads of trashable rows.
  getCategories: "n/a",
  getTags: "n/a",
  listVaultTags: "n/a",
  getAccountProfile: "n/a",
  getHeardFromAnswered: "n/a",
  forgetAccessibleProfiles: "n/a",
  TRANSACTIONS_PAGE_SIZE: "n/a",
  FEED_PAGE_SIZE: "n/a",
  VAULT_FILES_LIMIT: "n/a",
  TRASH_PAGE_SIZE: "n/a",
} as const;

describe("every transaction read excludes the trash", () => {
  it("list: default, every sort, search, tag, category, single profile, all-profiles merge", async () => {
    const variants: queries.TxnFilters[] = [
      {},
      { profileId: personal },
      { search: "apple" },
      { tagIds: [tag] },
      { categoryId: groceries },
      { type: "expense" },
      { from: "2026-06-01", to: "2026-06-30" },
      ...(["date", "category", "title", "description", "amount"] as const).flatMap((sort) => [
        { sort, dir: "asc" as const },
        { sort, dir: "desc" as const },
      ]),
    ];
    for (const f of variants) {
      const rows = await queries.listTransactions(U, W, f);
      for (const id of TRASHED_TXNS()) expect(ids(rows), JSON.stringify(f)).not.toContain(id);
    }
    expect(ids(await queries.listTransactions(U, W)).sort()).toEqual([live.txn, live.txnWork].sort());
    expect(ids(await queries.listTransactions(U, W, { search: "apple" }))).toEqual([live.txn]);
    expect(ids(await queries.listTransactionsAsc(U, W))).not.toContain(trashed.txn);
  });

  it("single and multi-row reads", async () => {
    expect(await queries.getTransactionById(U, W, trashed.txn)).toBeNull();
    expect(await queries.getTransactionById(U, W, trashed.txnInProfile)).toBeNull();
    expect((await queries.getTransactionById(U, W, live.txn))?.id).toBe(live.txn);
    expect(
      ids(await queries.getTransactionsByIds(U, W, [live.txn, ...TRASHED_TXNS()])),
    ).toEqual([live.txn]);
  });

  it("feed: all profiles, one profile, and past a cursor", async () => {
    const all = await queries.listFeedPage(U, W, { limit: 40 });
    expect(ids(all).sort()).toEqual([live.txn, live.txnWork].sort());
    expect(ids(await queries.listFeedPage(U, W, { profileId: personal, limit: 40 }))).toEqual([live.txn]);
    const first = all[0]!;
    const older = await queries.listFeedPage(U, W, {
      limit: 40,
      before: { occurredOn: first.occurredOn, createdAt: first.createdAt, id: first.id },
    });
    for (const id of TRASHED_TXNS()) expect(ids(older)).not.toContain(id);
  });

  it("counts, ids and every total are live-only", async () => {
    expect(await queries.countTransactions(U, W)).toBe(2);
    expect((await queries.listTransactionIds(U, W)).sort()).toEqual([live.txn, live.txnWork].sort());
    expect(await queries.getSummary(U, W)).toEqual({ income: 3000, expense: 1000, balance: 2000 });
    expect(await queries.getMonthlyTotals(U, W)).toEqual([
      { month: "2026-06", income: 3000, expense: 1000 },
    ]);
    const breakdown = await queries.getCategoryBreakdown(U, W, "expense");
    expect(breakdown.map((r) => [r.categoryId, r.total])).toEqual([[groceries, 1000]]);
    const trend = await queries.getMonthlyTrend(U, W, "2026-01-01");
    expect(trend).toEqual(
      expect.arrayContaining([
        { month: "2026-06", type: "expense", total: 1000 },
        { month: "2026-06", type: "income", total: 3000 },
      ]),
    );
    expect(trend).toHaveLength(2);
  });

  it("tag usage counts live rows in live profiles", async () => {
    const usage = await queries.getTagsWithUsage(W);
    expect(usage.find((t) => t.id === tag)?.usage).toBe(1);
    expect(await countTransactionsForTxnTag(W, tag)).toBe(1);
  });

  it("the trashed profile is gone from the profile list", async () => {
    expect(ids(await queries.getProfiles(U, W))).not.toContain(old);
  });

  it("the trash list shows the trashed row — and not the trashed profile's rows", async () => {
    expect(ids(await queries.listTrashedTransactions(U, W))).toEqual([trashed.txn]);
  });
});

describe("receipts, vault and share links exclude the trash", () => {
  it("a trashed transaction's receipts are unreachable", async () => {
    expect(await queries.listTransactionAttachments(U, W, trashed.txn)).toEqual([]);
    expect(await queries.getAttachmentById(U, W, trashed.receipt)).toBeNull();
    expect(await queries.getAttachmentById(U, W, trashed.receiptInProfile)).toBeNull();
    const vault = await queries.listTransactionFilesForVault(U, W);
    expect(vault.map((f) => f.transactionId)).toEqual([live.txn]);
    // The single-profile branch too.
    expect(
      (await queries.listTransactionFilesForVault(U, W, personal)).map((f) => f.transactionId),
    ).toEqual([live.txn]);
  });

  it("vault listings and lookups skip trashed files, folders and their subtree", async () => {
    const folderIds = ids(await queries.listVaultFolders(U, W));
    expect(folderIds).toContain(live.folder);
    expect(folderIds).not.toContain(trashed.folder);
    expect(folderIds).not.toContain(trashed.subfolder);
    const fileIds = ids(await queries.listVaultFiles(U, W));
    expect(fileIds).toEqual([live.file]);
    expect(ids(await queries.listVaultFiles(U, W, personal))).toEqual([live.file]);
    for (const id of TRASHED_FILES()) expect(await queries.getVaultFile(U, W, id)).toBeNull();
    expect(await queries.getVaultFolder(U, W, trashed.folder)).toBeNull();
    expect(await queries.getVaultFolder(U, W, trashed.subfolder)).toBeNull();

    const set = await getVaultWorkingSet(U, W);
    expect(ids(set.files)).toEqual([live.file]);
    expect(set.transactionFiles.map((f) => f.transactionId)).toEqual([live.txn]);
  });

  it("share links to anything in the trash stop working; a live one still works", async () => {
    for (const token of trashed.shares) expect(await resolveShare(token)).toBeNull();
    expect((await resolveShare(live.fileShare))?.kind).toBe("file");
    expect(await getSharedFileForDownload(trashed.shares[0]!, trashed.file)).toBeNull();
    expect(await getSharedFileForDownload(trashed.shares[1]!, trashed.fileInFolder)).toBeNull();
    expect(await getSharedFileForDownload(live.fileShare, live.file)).not.toBeNull();
  });

  it("storage still counts all of it (C6) — the one deliberate exception", async () => {
    // 4 files + 3 receipts, 10 bytes each: nothing in the trash is free.
    expect(await queries.getWorkspaceStorageUsage(W)).toBe(70);
    // trashed file, file in the trashed folder, file in the trashed profile,
    // the trashed transaction's receipt, and the trashed profile's receipt.
    expect(await queries.getTrashBytes(W)).toBe(50);
  });
});

describe("writes against trashed ids read as not found", () => {
  it("transactions", async () => {
    const edit = { type: "expense", amount: 1, occurredOn: "2026-06-02" };
    expect(await updateTransaction(U, W, trashed.txn, edit)).toBeNull();
    expect(await setTransactionTags(U, W, trashed.txn, { tagIds: [] })).toBeNull();
    expect(await deleteTransaction(U, W, trashed.txn)).toBe(false);
    expect(await deleteTransaction(U, W, trashed.txnInProfile)).toBe(false);
    const bulk = await updateTransactions(U, W, { ids: [trashed.txn], categoryId: null });
    expect(bulk.noAccess).toBe(1);
    await expect(
      createAttachments(U, W, trashed.txn, [
        { fileName: "r.pdf", contentType: "application/pdf", bytes: new ArrayBuffer(4), size: 4 },
      ]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("files and folders", async () => {
    await expect(updateFile(U, W, { id: trashed.file, name: "x.pdf" })).rejects.toMatchObject({
      status: 404,
    });
    expect(await deleteFile(U, W, trashed.file)).toBeNull();
    expect(await deleteFolder(U, W, trashed.folder)).toBeNull();
    await expect(
      createFolder(U, W, { profileId: personal, parentId: trashed.folder, name: "Inside" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      updateFile(U, W, { id: live.file, folderId: trashed.subfolder }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      uploadVaultFiles(U, W, { profileId: personal, folderId: trashed.folder }, [
        { fileName: "a.pdf", contentType: "application/pdf", bytes: new ArrayBuffer(4), size: 4 },
      ]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("the trashed profile itself", async () => {
    await expect(getProfileDeletionImpact(U, old)).rejects.toMatchObject({ status: 404 });
    await expect(deleteProfile(U, old, { transactions: "delete" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("deletion impact counts live rows only", async () => {
    expect(await getProfileDeletionImpact(U, personal)).toEqual({
      transactions: 1,
      files: 1,
      attachments: 1,
      filesRecoverable: true,
    });
  });
});

describe("the API and both exports exclude the trash", () => {
  it("GET /transactions, /transactions/:id, analytics, files, profiles", async () => {
    const list = await (await listTxnsRoute(apiReq("/api/v1/transactions"))).json();
    expect(ids(list.data).sort()).toEqual([live.txn, live.txnWork].sort());
    expect(list.meta.total).toBe(2);
    expect((await txnRoute(apiReq(`/api/v1/transactions/${trashed.txn}`), ctx({ id: trashed.txn }))).status).toBe(404);
    const summary = await (await summaryRoute(apiReq("/api/v1/analytics/summary"))).json();
    expect(summary.data).toMatchObject({ income: 3000, expense: 1000 });
    const cats = await (await categoriesRoute(apiReq("/api/v1/analytics/categories?type=expense"))).json();
    expect(cats.data.map((c: { total: number }) => c.total)).toEqual([1000]);
    const monthly = await (await monthlyRoute(apiReq("/api/v1/analytics/monthly?from=2026-01-01"))).json();
    expect(monthly.data).toEqual([{ month: "2026-06", income: 3000, expense: 1000 }]);
    const vault = await (await filesRoute(apiReq("/api/v1/files"))).json();
    expect(ids(vault.data.files)).toEqual([live.file]);
    expect(ids(vault.data.folders)).not.toContain(trashed.folder);
    const profilesRes = await (await profilesRoute(apiReq("/api/v1/profiles"))).json();
    expect(ids(profilesRes.data)).not.toContain(old);
  });

  it("CSV exports (API and web) carry live rows only", async () => {
    for (const res of [
      await exportRoute(apiReq("/api/v1/transactions/export")),
      await webExportRoute(new Request("http://localhost/api/transactions/export")),
    ]) {
      expect(res.status).toBe(200);
      const csv = await res.text();
      expect(csv).toContain("apple pie");
      expect(csv).not.toContain("apple tart");
      expect(csv).not.toContain("apple crumble");
    }
  });
});

describe("coverage registry", () => {
  it("accounts for every export of lib/queries.ts", () => {
    const exported = Object.keys(queries).filter((k) => k !== "default").sort();
    expect(exported, "a new export in lib/queries.ts — add it to this suite and to REGISTRY").toEqual(
      Object.keys(REGISTRY).sort(),
    );
  });
});
