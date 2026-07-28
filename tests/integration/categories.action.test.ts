import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { categories, transactions } from "@/db/schema";
import { addCategory, updateCategory, deleteCategory } from "@/actions/categories";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, categoryId, insertTxn } from "./helpers/seed";

const cat = (userId: string, name: string, kind: "income" | "expense") =>
  getTestDb()
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, uid(userId)),
        eq(categories.name, name),
        eq(categories.kind, kind),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

describe("addCategory", () => {
  it("adds a category (icon defaults to null when blank)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await addCategory({ name: "Pets", kind: "expense", icon: "🐶" })).ok).toBe(
      true,
    );
    expect((await addCategory({ name: "Tips", kind: "income", icon: "" })).ok).toBe(true);

    expect((await cat("a", "Pets", "expense")).icon).toBe("🐶");
    expect((await cat("a", "Tips", "income")).icon).toBeNull();
  });

  it("rejects invalid input", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addCategory({ name: "", kind: "expense" });
    expect(res.ok).toBe(false);
  });

  it("rejects a duplicate name within the same kind", async () => {
    signInAs("a");
    await bootstrapUser("a"); // already has "Groceries" (expense)
    const res = await addCategory({ name: "Groceries", kind: "expense" });
    expect(res).toEqual({
      ok: false,
      error: "A category with that name already exists",
    });
  });
});

describe("updateCategory", () => {
  it("updates name and icon, clearing a blank icon to null", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await categoryId("a", "Shopping", "expense");

    expect((await updateCategory({ id, name: "Retail" })).ok).toBe(true);
    expect((await cat("a", "Retail", "expense")).name).toBe("Retail");

    await updateCategory({ id, icon: "" });
    const [row] = await getTestDb().select().from(categories).where(eq(categories.id, id));
    expect(row.icon).toBeNull();
  });

  it("rejects an invalid id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await updateCategory({ id: "nope", name: "X" })).ok).toBe(false);
  });

  it("rejects a rename that collides with an existing name", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await categoryId("a", "Transport", "expense");
    const res = await updateCategory({ id, name: "Groceries" }); // already exists
    expect(res).toEqual({
      ok: false,
      error: "A category with that name already exists",
    });
  });

  it("cannot update another user's category", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const victim = await categoryId("b", "Groceries", "expense");
    await updateCategory({ id: victim, name: "Hacked" });
    const [row] = await getTestDb()
      .select()
      .from(categories)
      .where(eq(categories.id, victim));
    expect(row.name).toBe("Groceries");
  });
});

describe("deleteCategory", () => {
  it("rejects an invalid id", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect(await deleteCategory("nope")).toEqual({ ok: false, error: "Invalid category" });
  });

  it("deletes the category and nulls referencing transactions", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await categoryId("a", "Health", "expense");
    const txnId = await insertTxn("a", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
      categoryId: id,
    });

    expect((await deleteCategory(id)).ok).toBe(true);
    const [txn] = await getTestDb()
      .select()
      .from(transactions)
      .where(eq(transactions.id, txnId));
    expect(txn.categoryId).toBeNull(); // FK ON DELETE SET NULL
  });
});
