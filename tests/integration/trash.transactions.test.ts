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
import { deleteObjects } from "@/lib/r2";
import { profileAccess, transactions } from "@/db/schema";
import { deleteTransaction, deleteTransactions, setTransactionTags } from "@/services/transactions";
import { deleteCategory } from "@/services/categories";
import { createTxnTag, deleteTxnTag } from "@/services/tags";
import {
  countTrash,
  deleteFromTrash,
  emptyTrash,
  listTrashTransactions,
  restoreFromTrash,
} from "@/services/trash";
import { getTransactionById } from "@/lib/queries";
import { deleteAllTransactions } from "@/services/settings";
import { restoreFromTrash as restoreAction } from "@/actions/trash";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, categoryId, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";
import { seedReceipt } from "./helpers/vault-seed";

const swept = () => vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => [...(keys ?? [])]);
const row = async (id: string) =>
  (await getTestDb().select().from(transactions).where(eq(transactions.id, id)))[0];

let U: string;
let W: string;
let P: string;

beforeEach(async () => {
  vi.mocked(deleteObjects).mockClear();
  signInAs("a");
  await bootstrapUser("a");
  U = uid("a");
  W = await workspaceIdOf("a");
  P = await firstProfileId("a");
});

const expense = (title: string) => ({
  type: "expense" as const,
  amountMinor: 100,
  occurredOn: "2026-06-01",
  title,
});

describe("restore", () => {
  it("brings a trashed transaction back exactly as it was, receipts included", async () => {
    const id = await insertTxn("a", { ...expense("lunch"), categoryId: await categoryId("a", "Groceries", "expense") });
    await seedReceipt("a", id, P, { key: "attachments/lunch.pdf" });
    expect(await deleteTransaction(U, W, id)).toBe(true);
    expect(await getTransactionById(U, W, id)).toBeNull();

    const res = await restoreFromTrash(U, W, { transactionIds: [id] });
    expect(res).toEqual({
      counts: { transactions: 1, files: 0, folders: 0, profiles: 0 },
      skipped: 0,
    });
    const back = await getTransactionById(U, W, id);
    expect(back?.title).toBe("lunch");
    expect(back?.categoryName).toBe("Groceries");
    expect(back?.attachments).toHaveLength(1);
    expect((await row(id))!.deletedBy).toBeNull();
    expect(swept()).toHaveLength(0);
  });

  it("a category or tag deleted meanwhile stays gone — the row comes back without it", async () => {
    const groceries = await categoryId("a", "Groceries", "expense");
    const tag = (await createTxnTag(U, W, { name: "Trip", color: "#64748b" })).id;
    const id = await insertTxn("a", { ...expense("taxi"), categoryId: groceries });
    await setTransactionTags(U, W, id, { tagIds: [tag] });
    await deleteTransaction(U, W, id);

    expect(await deleteCategory(U, W, groceries)).toBe(true);
    expect(await deleteTxnTag(U, W, tag)).toBe(true);
    // The tag sweep reached the trashed row too (no dead id left on it).
    expect((await row(id))!.tagIds).toEqual([]);

    await restoreFromTrash(U, W, { transactionIds: [id] });
    const back = await getTransactionById(U, W, id);
    expect(back?.categoryId).toBeNull();
    expect(back?.tags).toEqual([]);
  });

  it("skips ids that aren't in the trash, aren't ours, or don't exist", async () => {
    const liveRow = await insertTxn("a", expense("live"));
    await bootstrapUser("b");
    const theirs = await insertTxn("b", expense("theirs"));
    await deleteTransaction(uid("b"), await workspaceIdOf("b"), theirs);

    const res = await restoreFromTrash(U, W, {
      transactionIds: [liveRow, theirs, "01a1127e-e254-7fff-a0a3-0f4616068dd4"],
    });
    expect(res.counts.transactions).toBe(0);
    expect(res.skipped).toBe(3);
    expect((await row(theirs))!.deletedAt).toBeInstanceOf(Date);
  });

  it("a viewer sees the trashed row but can't restore or delete it", async () => {
    const id = await insertTxn("a", expense("shared"));
    await deleteTransaction(U, W, id);
    await bootstrapUser("v");
    await getTestDb().insert(profileAccess).values({ profileId: P, userId: uid("v"), role: "viewer" });

    const page = await listTrashTransactions(uid("v"), W);
    expect(page.rows.map((r) => [r.id, r.canRestore])).toEqual([[id, false]]);
    expect((await restoreFromTrash(uid("v"), W, { transactionIds: [id] })).counts.transactions).toBe(0);
    expect((await deleteFromTrash(uid("v"), W, { transactionIds: [id] })).counts.transactions).toBe(0);
    await expect(emptyTrash(uid("v"), W)).rejects.toMatchObject({ status: 403 });
    expect((await row(id))!.deletedAt).toBeInstanceOf(Date);
  });

  it("the web action revalidates and reports the counts", async () => {
    const id = await insertTxn("a", expense("undo me"));
    await deleteTransaction(U, W, id);
    expect(await restoreAction({ transactionIds: [id] })).toEqual({
      ok: true,
      counts: { transactions: 1, files: 0, folders: 0, profiles: 0 },
      skipped: 0,
    });
  });
});

describe("the trash list", () => {
  it("says who deleted what, and when it will be purged", async () => {
    const id = await insertTxn("a", expense("coffee"));
    await deleteTransaction(U, W, id);
    const page = await listTrashTransactions(U, W);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ id, title: "coffee", deletedById: U, canRestore: true });
    expect(page.rows[0]!.deletedAt).toBeInstanceOf(Date);
    expect(page.nextCursor).toBeNull();
  });

  /**
   * The keyset-precision trap, for the trash: a bulk delete stamps every row
   * with one `deleted_at`, so a page boundary falls *inside* a tie. The cursor
   * round-trips through a JS `Date`; at microsecond precision it would name an
   * instant just before its own row and skip every row tied with it. The
   * column is `timestamptz(3)`, so ties stay ties and `id` breaks them.
   */
  it("pages through 120 rows trashed in one statement without skipping any", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) ids.push(await insertTxn("a", expense(`row ${i}`)));
    const res = await deleteTransactions(U, W, { ids });
    expect(res.deletedIds).toHaveLength(120);

    const seen = new Set<string>();
    let before: { deletedAt: Date; id: string } | undefined;
    for (let pages = 0; pages < 10; pages++) {
      const page = await listTrashTransactions(U, W, { limit: 50, before });
      for (const r of page.rows) seen.add(r.id);
      if (!page.nextCursor) break;
      before = page.nextCursor;
    }
    expect(seen.size).toBe(120);
  });

  it("stores deleted_at at millisecond precision on every trashable table", async () => {
    const { rows } = await getTestDb().execute<{ table_name: string; datetime_precision: number }>(sql`
      select table_name, datetime_precision from information_schema.columns
      where column_name = 'deleted_at' and table_schema = 'public' order by table_name`);
    expect(rows.map((r) => [r.table_name, r.datetime_precision])).toEqual([
      ["files", 3],
      ["folders", 3],
      ["profiles", 3],
      ["transactions", 3],
    ]);
  });
});

describe("delete for good", () => {
  it("destroys the row and sweeps its receipts — only its, and only after commit", async () => {
    const doomed = await insertTxn("a", expense("doomed"));
    const keep = await insertTxn("a", expense("keep"));
    await seedReceipt("a", doomed, P, { key: "attachments/doomed.pdf" });
    await seedReceipt("a", keep, P, { key: "attachments/keep.pdf" });
    await deleteTransactions(U, W, { ids: [doomed, keep] });

    const res = await deleteFromTrash(U, W, { transactionIds: [doomed] });
    expect(res.counts.transactions).toBe(1);
    expect(await row(doomed)).toBeUndefined();
    expect(swept()).toContain("attachments/doomed.pdf");
    expect(swept()).not.toContain("attachments/keep.pdf");
    expect((await row(keep))!.deletedAt).toBeInstanceOf(Date);
  });

  it("never destroys a live row, even when asked by id", async () => {
    const id = await insertTxn("a", expense("live"));
    await seedReceipt("a", id, P, { key: "attachments/live.pdf" });
    const res = await deleteFromTrash(U, W, { transactionIds: [id] });
    expect(res).toMatchObject({ counts: { transactions: 0 }, skipped: 1 });
    expect(await row(id)).toBeDefined();
    expect(swept()).toHaveLength(0);
  });

  it("rolls back, sweeping nothing, when the delete fails", async () => {
    const id = await insertTxn("a", expense("x"));
    await seedReceipt("a", id, P, { key: "attachments/x.pdf" });
    await deleteTransaction(U, W, id);
    await getTestDb().execute(sql`
      CREATE OR REPLACE FUNCTION pg_temp.del_boom() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'boom'; END;
      $$ LANGUAGE plpgsql`);
    await getTestDb().execute(sql`
      CREATE TRIGGER del_boom BEFORE DELETE ON transactions
        FOR EACH ROW EXECUTE FUNCTION pg_temp.del_boom()`);
    try {
      await expect(deleteFromTrash(U, W, { transactionIds: [id] })).rejects.toThrow();
    } finally {
      await getTestDb().execute(sql`DROP TRIGGER del_boom ON transactions`);
    }
    expect((await row(id))!.deletedAt).toBeInstanceOf(Date);
    expect(swept()).toHaveLength(0);
  });

  it("empty trash takes everything the caller can edit, and counts it first", async () => {
    const a = await insertTxn("a", expense("a"));
    const b = await insertTxn("a", expense("b"));
    await deleteTransactions(U, W, { ids: [a, b] });
    expect(await countTrash(U, W)).toEqual({ transactions: 2, files: 0, folders: 0, profiles: 0 });
    const res = await emptyTrash(U, W);
    expect(res).toEqual({ counts: { transactions: 2, files: 0, folders: 0, profiles: 0 }, remaining: 0 });
    expect(await row(a)).toBeUndefined();
  });
});

describe("clear transactions goes to the trash", () => {
  it("every live row of the chosen profiles is restorable afterwards", async () => {
    const a = await insertTxn("a", expense("a"));
    const b = await insertTxn("a", expense("b"));
    expect(await deleteAllTransactions(U, W, "DELETE", [])).toEqual({ deleted: 2 });
    const res = await restoreFromTrash(U, W, { transactionIds: [a, b] });
    expect(res.counts.transactions).toBe(2);
    expect((await getTransactionById(U, W, a))?.id).toBe(a);
  });
});
