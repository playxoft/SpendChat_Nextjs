import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq, inArray } from "drizzle-orm";
import { deleteObjects } from "@/lib/r2";
import { profileAccess, profiles, transactionAttachments, transactions } from "@/db/schema";
import { deleteTransaction, deleteTransactions, updateTransactions } from "@/services/transactions";
import { createTxnTag } from "@/services/tags";
import { TAGS_PER_TRANSACTION_MAX } from "@/lib/validation";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, categoryId, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";

/**
 * The multi-select's two writes. Both act on rows the user picked by hand from
 * a list, so the dangerous shapes are the ones where the selection carries
 * something it shouldn't: a row from another workspace, a row on a profile the
 * user can only view. Those must be left exactly as they were — and counted, so
 * the UI can say so — while the rest of the selection still goes through.
 */

const swept = () => vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => keys ?? []);

const expense = { type: "expense" as const, amountMinor: 500, occurredOn: "2026-06-01" };
const income = { type: "income" as const, amountMinor: 900, occurredOn: "2026-06-01" };

async function owner(alias = "a") {
  await bootstrapUser(alias);
  return { userId: uid(alias), ws: await workspaceIdOf(alias), pid: await firstProfileId(alias) };
}

async function addProfile(alias: string, ws: string, name: string) {
  const [row] = await getTestDb()
    .insert(profiles)
    .values({ userId: uid(alias), workspaceId: ws, name, icon: "💼", sortOrder: 5 })
    .returning({ id: profiles.id });
  return row!.id;
}

async function attach(alias: string, txnId: string, profileId: string, key: string) {
  await getTestDb()
    .insert(transactionAttachments)
    .values({
      transactionId: txnId,
      profileId,
      workspaceId: await workspaceIdOf(alias),
      userId: uid(alias),
      r2Key: key,
      thumbnailKey: `${key}_thumb`,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
}

const txnRow = async (id: string) =>
  (await getTestDb().select().from(transactions).where(eq(transactions.id, id)))[0];

describe("deleteTransactions", () => {
  beforeEach(() => vi.mocked(deleteObjects).mockClear());

  it("deletes the selected rows, leaves the rest, and sweeps their stored files", async () => {
    const { userId, ws, pid } = await owner();
    const a = await insertTxn("a", expense);
    const b = await insertTxn("a", expense);
    const keep = await insertTxn("a", expense);
    await attach("a", a, pid, "attachments/x/a/1.pdf");
    await attach("a", keep, pid, "attachments/x/keep/1.pdf");

    const res = await deleteTransactions(userId, ws, { ids: [a, b] });

    expect(res.deletedIds.sort()).toEqual([a, b].sort());
    expect(res.skipped).toBe(0);
    expect(await txnRow(a)).toBeUndefined();
    expect(await txnRow(b)).toBeUndefined();
    expect(await txnRow(keep)).toBeDefined();
    // The deleted row's original and thumbnail go; the survivor's stay.
    expect(swept()).toEqual(
      expect.arrayContaining(["attachments/x/a/1.pdf", "attachments/x/a/1.pdf_thumb"]),
    );
    expect(swept()).not.toContain("attachments/x/keep/1.pdf");
  });

  it("skips another workspace's rows and never sweeps their files", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const mine = await insertTxn("a", expense);
    const theirs = await insertTxn("b", expense);
    await attach("b", theirs, b.pid, "attachments/y/theirs/1.pdf");

    const res = await deleteTransactions(a.userId, a.ws, { ids: [mine, theirs] });

    expect(res.deletedIds).toEqual([mine]);
    expect(res.skipped).toBe(1);
    expect(await txnRow(theirs)).toBeDefined();
    expect(swept()).not.toContain("attachments/y/theirs/1.pdf");
  });

  it("skips rows on a profile the caller can only view", async () => {
    const a = await owner("a");
    await bootstrapUser("v");
    await getTestDb().insert(profileAccess).values({ profileId: a.pid, userId: uid("v"), role: "viewer" });
    const row = await insertTxn("a", expense);

    // A viewer has no profile they can write to here at all.
    await expect(deleteTransactions(uid("v"), a.ws, { ids: [row] })).rejects.toMatchObject({ status: 403 });
    expect(await txnRow(row)).toBeDefined();
  });

  it("rejects an empty selection and non-uuid ids", async () => {
    const { userId, ws } = await owner();
    await expect(deleteTransactions(userId, ws, { ids: [] })).rejects.toMatchObject({ status: 422 });
    await expect(deleteTransactions(userId, ws, { ids: ["nope"] })).rejects.toMatchObject({ status: 422 });
  });
});

/**
 * The case the per-row skipping exists for: one user, two profiles in the same
 * workspace, editor on one and only a viewer on the other, with a selection
 * spanning both. The editable rows go through; the view-only ones are left
 * exactly as they were — files included — and counted.
 */
describe("a selection across an editable and a view-only profile", () => {
  beforeEach(() => vi.mocked(deleteObjects).mockClear());

  async function mixedAccess() {
    const a = await owner("a");
    const viewOnly = await addProfile("a", a.ws, "Household");
    await bootstrapUser("e");
    await getTestDb()
      .insert(profileAccess)
      .values([
        { profileId: a.pid, userId: uid("e"), role: "editor" },
        { profileId: viewOnly, userId: uid("e"), role: "viewer" },
      ]);
    const editable = await insertTxn("a", { ...expense, profileId: a.pid });
    const readOnly = await insertTxn("a", { ...expense, profileId: viewOnly });
    await attach("a", readOnly, viewOnly, "attachments/x/readonly/1.pdf");
    return { ws: a.ws, editable, readOnly, viewOnly };
  }

  it("deletes the editable row and keeps the view-only one and its files", async () => {
    const { ws, editable, readOnly } = await mixedAccess();

    const res = await deleteTransactions(uid("e"), ws, { ids: [editable, readOnly] });

    expect(res).toEqual({ deletedIds: [editable], skipped: 1 });
    expect(await txnRow(readOnly)).toBeDefined();
    expect(swept()).not.toContain("attachments/x/readonly/1.pdf");
  });

  it("edits the editable row and reports the view-only one", async () => {
    const { ws, editable, readOnly } = await mixedAccess();
    const groceries = await categoryId("a", "Groceries", "expense");

    const res = await updateTransactions(uid("e"), ws, { ids: [editable, readOnly], categoryId: groceries });

    expect(res.rows.map((r) => r.id)).toEqual([editable]);
    expect(res.noAccess).toBe(1);
    expect((await txnRow(readOnly))!.categoryId).toBeNull();
  });

  it("refuses to move rows into the view-only profile", async () => {
    const { ws, editable, viewOnly } = await mixedAccess();

    await expect(updateTransactions(uid("e"), ws, { ids: [editable], profileId: viewOnly })).rejects.toMatchObject({
      status: 403,
    });
    expect((await txnRow(editable))!.profileId).not.toBe(viewOnly);
  });
});

describe("deleteTransaction (single)", () => {
  beforeEach(() => vi.mocked(deleteObjects).mockClear());

  it("sweeps the deleted row's stored files, and only its", async () => {
    const { userId, ws, pid } = await owner();
    const doomed = await insertTxn("a", expense);
    const keep = await insertTxn("a", expense);
    await attach("a", doomed, pid, "attachments/x/doomed/1.pdf");
    await attach("a", keep, pid, "attachments/x/keep/1.pdf");

    expect(await deleteTransaction(userId, ws, doomed)).toBe(true);

    expect(await txnRow(doomed)).toBeUndefined();
    expect(swept()).toEqual(
      expect.arrayContaining(["attachments/x/doomed/1.pdf", "attachments/x/doomed/1.pdf_thumb"]),
    );
    expect(swept()).not.toContain("attachments/x/keep/1.pdf");
  });

  it("sweeps nothing when the row isn't the caller's to delete", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const theirs = await insertTxn("b", expense);
    await attach("b", theirs, b.pid, "attachments/y/theirs/1.pdf");

    expect(await deleteTransaction(a.userId, a.ws, theirs)).toBe(false);
    expect(await txnRow(theirs)).toBeDefined();
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});

describe("updateTransactions", () => {
  it("moves rows to another profile and carries their attachments along", async () => {
    const { userId, ws, pid } = await owner();
    const business = await addProfile("a", ws, "Business");
    const row = await insertTxn("a", expense);
    await attach("a", row, pid, "attachments/x/row/1.pdf");

    const res = await updateTransactions(userId, ws, { ids: [row], profileId: business });

    expect(res.rows.map((r) => r.profileId)).toEqual([business]);
    expect((await txnRow(row))!.profileId).toBe(business);
    const [att] = await getTestDb()
      .select({ profileId: transactionAttachments.profileId })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, row));
    expect(att!.profileId).toBe(business);
  });

  it("sets a category on rows of its kind only, and reports the others", async () => {
    const { userId, ws } = await owner();
    const groceries = await categoryId("a", "Groceries", "expense");
    const spent = await insertTxn("a", expense);
    const earned = await insertTxn("a", income);

    const res = await updateTransactions(userId, ws, { ids: [spent, earned], categoryId: groceries });

    expect(res.rows.map((r) => r.id)).toEqual([spent]);
    expect(res.rows[0]!.categoryName).toBe("Groceries");
    expect(res.wrongKind).toBe(1);
    expect((await txnRow(earned))!.categoryId).toBeNull();
  });

  it("clears the category on every row with categoryId null", async () => {
    const { userId, ws } = await owner();
    const groceries = await categoryId("a", "Groceries", "expense");
    const salary = await categoryId("a", "Salary", "income");
    const spent = await insertTxn("a", { ...expense, categoryId: groceries });
    const earned = await insertTxn("a", { ...income, categoryId: salary });

    const res = await updateTransactions(userId, ws, { ids: [spent, earned], categoryId: null });

    expect(res.rows).toHaveLength(2);
    expect((await txnRow(spent))!.categoryId).toBeNull();
    expect((await txnRow(earned))!.categoryId).toBeNull();
  });

  it("adds and removes tags without disturbing the others, in pick order", async () => {
    const { userId, ws } = await owner();
    const travel = await createTxnTag(userId, ws, { name: "Travel", color: "#ef4444" });
    const work = await createTxnTag(userId, ws, { name: "Work", color: "#22c55e" });
    const food = await createTxnTag(userId, ws, { name: "Food", color: "#3b82f6" });
    const row = await insertTxn("a", expense);
    await getTestDb().update(transactions).set({ tagIds: [travel.id, work.id] }).where(eq(transactions.id, row));

    await updateTransactions(userId, ws, { ids: [row], addTagIds: [food.id, travel.id] });
    expect((await txnRow(row))!.tagIds).toEqual([travel.id, work.id, food.id]);

    await updateTransactions(userId, ws, { ids: [row], removeTagIds: [travel.id] });
    expect((await txnRow(row))!.tagIds).toEqual([work.id, food.id]);
  });

  it("leaves a row's tags alone when adding would pass the cap", async () => {
    const { userId, ws } = await owner();
    const made = [];
    for (let i = 0; i <= TAGS_PER_TRANSACTION_MAX; i++) {
      made.push(await createTxnTag(userId, ws, { name: `t${i}`, color: "#ef4444" }));
    }
    const full = made.slice(0, TAGS_PER_TRANSACTION_MAX).map((t) => t.id);
    const extra = made[TAGS_PER_TRANSACTION_MAX]!.id;
    const atCap = await insertTxn("a", expense);
    const roomy = await insertTxn("a", expense);
    await getTestDb().update(transactions).set({ tagIds: full }).where(eq(transactions.id, atCap));

    const res = await updateTransactions(userId, ws, { ids: [atCap, roomy], addTagIds: [extra] });

    expect(res.tagLimit).toBe(1);
    expect(res.rows.map((r) => r.id)).toEqual([roomy]);
    expect((await txnRow(atCap))!.tagIds).toEqual(full);
    expect((await txnRow(roomy))!.tagIds).toEqual([extra]);
  });

  it("drops a tag id from another workspace instead of storing it", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const foreign = await createTxnTag(b.userId, b.ws, { name: "Theirs", color: "#ef4444" });
    const row = await insertTxn("a", expense);

    await expect(
      updateTransactions(a.userId, a.ws, { ids: [row], addTagIds: [foreign.id] }),
    ).resolves.toMatchObject({ rows: [] });
    expect((await txnRow(row))!.tagIds).toEqual([]);
  });

  it("skips another workspace's rows and reports them", async () => {
    const a = await owner("a");
    await owner("b");
    const groceries = await categoryId("a", "Groceries", "expense");
    const mine = await insertTxn("a", expense);
    const theirs = await insertTxn("b", expense);

    const res = await updateTransactions(a.userId, a.ws, { ids: [mine, theirs], categoryId: groceries });

    expect(res.noAccess).toBe(1);
    expect(res.rows.map((r) => r.id)).toEqual([mine]);
    expect((await txnRow(theirs))!.categoryId).toBeNull();
  });

  it("refuses a move to a profile the caller can't write to", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const row = await insertTxn("a", expense);

    await expect(
      updateTransactions(a.userId, a.ws, { ids: [row], profileId: b.pid }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await txnRow(row))!.profileId).toBe(a.pid);
  });

  it("rejects a category from another workspace and writes nothing", async () => {
    const a = await owner("a");
    await owner("b");
    const theirs = await categoryId("b", "Groceries", "expense");
    const row = await insertTxn("a", expense);

    await expect(updateTransactions(a.userId, a.ws, { ids: [row], categoryId: theirs })).rejects.toMatchObject({
      status: 422,
      message: "Invalid category",
    });
    expect((await txnRow(row))!.categoryId).toBeNull();
  });

  it("moves only the rows not already in the target, and only their attachments", async () => {
    const { userId, ws, pid } = await owner();
    const business = await addProfile("a", ws, "Business");
    const moving = await insertTxn("a", { ...expense, profileId: pid });
    const already = await insertTxn("a", { ...expense, profileId: business });
    await attach("a", moving, pid, "attachments/x/moving/1.pdf");
    await attach("a", already, business, "attachments/x/already/1.pdf");

    const res = await updateTransactions(userId, ws, { ids: [moving, already], profileId: business });

    expect(res.rows.map((r) => r.id)).toEqual([moving]);
    const atts = await getTestDb()
      .select({ txn: transactionAttachments.transactionId, profileId: transactionAttachments.profileId })
      .from(transactionAttachments)
      .where(inArray(transactionAttachments.transactionId, [moving, already]));
    expect(atts.every((a) => a.profileId === business)).toBe(true);
  });

  it("applies a move, a category and tags in one call", async () => {
    const { userId, ws } = await owner();
    const business = await addProfile("a", ws, "Business");
    const groceries = await categoryId("a", "Groceries", "expense");
    const travel = await createTxnTag(userId, ws, { name: "Travel", color: "#ef4444" });
    const row = await insertTxn("a", expense);

    const res = await updateTransactions(userId, ws, {
      ids: [row],
      profileId: business,
      categoryId: groceries,
      addTagIds: [travel.id],
    });

    expect(res.rows).toHaveLength(1);
    const stored = (await txnRow(row))!;
    expect(stored.profileId).toBe(business);
    expect(stored.categoryId).toBe(groceries);
    expect(stored.tagIds).toEqual([travel.id]);
  });

  it("rejects a request that changes nothing", async () => {
    const { userId, ws } = await owner();
    const row = await insertTxn("a", expense);
    await expect(updateTransactions(userId, ws, { ids: [row] })).rejects.toMatchObject({
      status: 422,
      message: "Nothing to change",
    });
  });

  it("changes every selected row in one call", async () => {
    const { userId, ws } = await owner();
    const groceries = await categoryId("a", "Groceries", "expense");
    const ids = [];
    for (let i = 0; i < 25; i++) ids.push(await insertTxn("a", expense));

    const res = await updateTransactions(userId, ws, { ids, categoryId: groceries });

    expect(res.rows).toHaveLength(25);
    const stored = await getTestDb()
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(inArray(transactions.id, ids));
    expect(stored.every((r) => r.categoryId === groceries)).toBe(true);
  });
});
