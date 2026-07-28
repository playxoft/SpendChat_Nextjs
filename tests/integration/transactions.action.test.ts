import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { profiles, transactions, workspaces } from "@/db/schema";
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addBulkTransactions,
} from "@/actions/transactions";
import type { BulkDraft } from "@/lib/bulk-parser";
import { setSession, signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  firstProfileId,
  categoryId,
  insertTxn,
  countTxns,
} from "./helpers/seed";

const rows = (userId: string) =>
  getTestDb().select().from(transactions).where(eq(transactions.userId, uid(userId)));

describe("addTransaction", () => {
  it("inserts a transaction, converting the amount via the user's currency", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addTransaction({
      type: "expense",
      amount: 12.5,
      occurredOn: "2026-06-01",
      title: "Lunch",
    });
    expect(res.ok).toBe(true);

    const [row] = await rows("a");
    expect(row.amountMinor).toBe(1250);
    expect(row.type).toBe("expense");
    expect(row.title).toBe("Lunch");
    expect(row.description).toBeNull();
    // The action returns the created id (the optimistic UI keys off it).
    if (res.ok) expect(res.id).toBe(row.id);
  });

  it("converts using a non-USD, zero-decimal currency", async () => {
    signInAs("a");
    await bootstrapUser("a");
    // Currency is a workspace setting now.
    await getTestDb()
      .update(workspaces)
      .set({ currency: "JPY" })
      .where(eq(workspaces.ownerId, uid("a")));

    await addTransaction({ type: "income", amount: 1500, occurredOn: "2026-06-01" });
    const [row] = await rows("a");
    expect(row.amountMinor).toBe(1500); // 0-decimal → no scaling
  });

  it("rejects invalid input with the first Zod message", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addTransaction({
      type: "expense",
      amount: 0,
      occurredOn: "2026-06-01",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/greater than 0/);
    expect(await countTxns("a")).toBe(0);
  });

  it("keeps an owned category but drops a foreign one", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const ownCat = await categoryId("a", "Groceries", "expense");
    const foreignCat = await categoryId("b", "Groceries", "expense");

    await addTransaction({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
      categoryId: ownCat,
    });
    await addTransaction({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
      categoryId: foreignCat,
    });

    const all = await rows("a");
    expect(all.find((r) => r.categoryId === ownCat)).toBeTruthy();
    expect(all.find((r) => r.categoryId === foreignCat)).toBeUndefined();
    // the foreign-category txn was stored with a null category, not rejected
    expect(all.filter((r) => r.categoryId === null)).toHaveLength(1);
  });

  it("keeps an explicitly chosen owned profile and stores a description", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const ownProfile = await firstProfileId("a");
    const res = await addTransaction({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
      profileId: ownProfile,
      description: "  detailed note  ",
    });
    expect(res.ok).toBe(true);
    const [row] = await rows("a");
    expect(row.profileId).toBe(ownProfile);
    expect(row.description).toBe("detailed note"); // trimmed
  });

  it("uses an owned profile, else falls back to the default profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const ownProfile = await firstProfileId("a");
    const foreignProfile = await firstProfileId("b");

    await addTransaction({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
      profileId: foreignProfile, // not owned → falls back
    });
    const [row] = await rows("a");
    expect(row.profileId).toBe(ownProfile);
  });

  it("creates a profile when the user somehow has none", async () => {
    signInAs("a");
    await bootstrapUser("a");
    // Remove the bootstrapped profile (no txns reference it yet).
    await getTestDb().delete(profiles).where(eq(profiles.userId, uid("a")));

    const res = await addTransaction({
      type: "expense",
      amount: 5,
      occurredOn: "2026-06-01",
    });
    expect(res.ok).toBe(true);
    const [row] = await rows("a");
    expect(row.profileId).toBeTruthy();
  });

  it("falls back to the legacy `note` when no title is given, else null", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addTransaction({
      type: "expense",
      amount: 1,
      occurredOn: "2026-06-01",
      note: "from note",
    });
    await addTransaction({ type: "expense", amount: 2, occurredOn: "2026-06-01" });

    const all = await rows("a");
    expect(all.find((r) => r.amountMinor === 100)?.title).toBe("from note");
    expect(all.find((r) => r.amountMinor === 200)?.title).toBeNull();
  });

  it("redirects when signed out", async () => {
    setSession(null);
    await expect(
      addTransaction({ type: "expense", amount: 1, occurredOn: "2026-06-01" }),
    ).rejects.toMatchObject({ url: "/sign-in" });
  });
});

describe("updateTransaction", () => {
  it("updates an owned transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await insertTxn("a", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
    });

    const res = await updateTransaction({
      id,
      type: "income",
      amount: 9,
      occurredOn: "2026-06-02",
      title: "Refund",
      description: "store credit",
    });
    expect(res.ok).toBe(true);

    const [row] = await rows("a");
    expect(row.type).toBe("income");
    expect(row.amountMinor).toBe(900);
    expect(row.title).toBe("Refund");
    expect(row.description).toBe("store credit");
  });

  it("rejects invalid input", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await updateTransaction({
      id: "not-a-uuid",
      type: "income",
      amount: 9,
      occurredOn: "2026-06-02",
    });
    expect(res.ok).toBe(false);
  });

  it("cannot touch another user's transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const victimId = await insertTxn("b", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
      title: "B's data",
    });

    // Signed in as A, try to update B's row: not accessible in A's current
    // workspace → reads as absent.
    const res = await updateTransaction({
      id: victimId,
      type: "income",
      amount: 999,
      occurredOn: "2026-06-02",
    });
    expect(res).toEqual({ ok: false, error: "Transaction not found" });
    const [row] = await rows("b");
    expect(row.amountMinor).toBe(500); // unchanged
    expect(row.type).toBe("expense");
  });
});

describe("deleteTransaction", () => {
  it("deletes an owned transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await insertTxn("a", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
    });
    expect((await deleteTransaction(id)).ok).toBe(true);
    expect(await countTxns("a")).toBe(0);
  });

  it("rejects a non-UUID id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await deleteTransaction("nope");
    expect(res).toEqual({ ok: false, error: "Invalid transaction" });
  });

  it("cannot delete another user's transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const victimId = await insertTxn("b", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
    });
    await deleteTransaction(victimId);
    expect(await countTxns("b")).toBe(1); // still there
  });
});

describe("addBulkTransactions", () => {
  const draft = (over: Partial<BulkDraft> = {}): BulkDraft => ({
    type: "expense",
    amount: 10,
    note: "n",
    categoryName: null,
    occurredOn: "2026-06-01",
    ...over,
  });

  it("rejects an empty or non-array payload", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await addBulkTransactions([])).toEqual({
      ok: false,
      error: "Nothing to import",
    });
    // @ts-expect-error — exercising the runtime guard
    expect(await addBulkTransactions(null)).toEqual({
      ok: false,
      error: "Nothing to import",
    });
  });

  it("rejects more than 500 rows", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addBulkTransactions(Array.from({ length: 501 }, () => draft()));
    expect(res).toEqual({ ok: false, error: "Too many rows (max 500 at a time)" });
  });

  it("imports valid rows, resolving category names and skipping invalid ones", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const ownProfile = await firstProfileId("a");
    const groceries = await categoryId("a", "Groceries", "expense");

    const res = await addBulkTransactions([
      draft({ categoryName: "Groceries", title: "Veg", description: "weekly shop" }),
      draft({ categoryName: "Nonexistent" }), // no match → null category
      draft({ amount: 0 }), // invalid → skipped
      draft({ profileId: ownProfile, type: "income" }),
    ]);
    expect(res).toEqual({ ok: true, count: 3 });

    const all = await rows("a");
    expect(all).toHaveLength(3);
    const veg = all.find((r) => r.title === "Veg");
    expect(veg?.categoryId).toBe(groceries);
    expect(veg?.description).toBe("weekly shop");
    expect(all.filter((r) => r.categoryId === null)).toHaveLength(2);
    expect(all.every((r) => r.profileId === ownProfile)).toBe(true);
  });

  it("falls back to the default profile for an unowned profileId", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const ownProfile = await firstProfileId("a");
    const foreignProfile = await firstProfileId("b");

    await addBulkTransactions([draft({ profileId: foreignProfile })]);
    const [row] = await rows("a");
    expect(row.profileId).toBe(ownProfile);
  });

  it("returns an error when every row is invalid", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addBulkTransactions([draft({ amount: -1 }), draft({ amount: 0 })]);
    expect(res).toEqual({ ok: false, error: "No valid rows to import" });
  });
});

describe("tenant isolation (bulk)", () => {
  it("only ever writes rows for the signed-in user", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await addBulkTransactions([
      {
        type: "expense",
        amount: 1,
        note: "",
        categoryName: null,
        occurredOn: "2026-06-01",
      },
    ]);
    const aProfile = await firstProfileId("a");
    const [row] = await getTestDb()
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, uid("a")), eq(transactions.profileId, aProfile)));
    expect(row.userId).toBe(uid("a"));
  });
});
