import { describe, it, expect, beforeEach } from "vitest";
import {
  listTransactions,
  listTransactionsAsc,
  countTransactions,
  getSummary,
  getCategoryBreakdown,
  getMonthlyTrend,
  getCategories,
  getProfiles,
} from "@/lib/queries";
import { addProfile } from "@/actions/profiles";
import { signInAs, uid } from "./helpers/session";
import {
  bootstrapUser,
  firstProfileId,
  categoryId,
  insertTxn,
  workspaceIdOf,
} from "./helpers/seed";

const U = uid("q");
let W: string;
let personal: string;
let work: string;
let groceries: string;

beforeEach(async () => {
  signInAs(U);
  await bootstrapUser(U);
  W = await workspaceIdOf(U);
  personal = await firstProfileId(U);
  await addProfile({ name: "Work" });
  work = (await getProfiles(U, W)).find((p) => p.name === "Work")!.id;
  groceries = await categoryId(U, "Groceries", "expense");
  const salary = await categoryId(U, "Salary", "income");

  await insertTxn(U, {
    type: "expense",
    amountMinor: 1000,
    occurredOn: "2026-06-01",
    categoryId: groceries,
    profileId: personal,
    title: "Veg apples",
    description: "weekly",
  });
  await insertTxn(U, {
    type: "income",
    amountMinor: 5000,
    occurredOn: "2026-06-15",
    categoryId: salary,
    profileId: personal,
    title: "June pay",
  });
  await insertTxn(U, {
    type: "expense",
    amountMinor: 2000,
    occurredOn: "2026-05-20",
    profileId: work,
    title: "Tools",
  });
  await insertTxn(U, {
    type: "expense",
    amountMinor: 300,
    occurredOn: "2026-06-10",
    categoryId: groceries,
    profileId: personal,
    title: "snacks",
    description: "coffee beans",
  });
});

describe("listTransactions", () => {
  it("returns all rows newest-first by date", async () => {
    const rows = await listTransactions(U, W);
    expect(rows.map((r) => r.occurredOn)).toEqual([
      "2026-06-15",
      "2026-06-10",
      "2026-06-01",
      "2026-05-20",
    ]);
    // joined fields resolve, and `note` aliases `title`
    const pay = rows[0];
    expect(pay.categoryName).toBe("Salary");
    expect(pay.profileName).toBe("Personal");
    expect(pay.note).toBe(pay.title);
  });

  it("filters by type", async () => {
    const rows = await listTransactions(U, W, { type: "expense" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.type === "expense")).toBe(true);
  });

  it("filters by date range", async () => {
    const rows = await listTransactions(U, W, { from: "2026-06-01", to: "2026-06-30" });
    expect(rows.map((r) => r.title).sort()).toEqual([
      "Veg apples",
      "June pay",
      "snacks",
    ].sort());
  });

  it("filters by category and by profile", async () => {
    expect(await listTransactions(U, W, { categoryId: groceries })).toHaveLength(2);
    const workRows = await listTransactions(U, W, { profileId: work });
    expect(workRows.map((r) => r.title)).toEqual(["Tools"]);
  });

  it("searches title OR description (case-insensitive)", async () => {
    expect((await listTransactions(U, W, { search: "coffee" })).map((r) => r.title)).toEqual([
      "snacks",
    ]);
    expect((await listTransactions(U, W, { search: "veg" })).map((r) => r.title)).toEqual([
      "Veg apples",
    ]);
  });

  it("paginates with limit/offset", async () => {
    const page1 = await listTransactions(U, W, { limit: 2, offset: 0 });
    const page2 = await listTransactions(U, W, { limit: 2, offset: 2 });
    expect(page1.map((r) => r.occurredOn)).toEqual(["2026-06-15", "2026-06-10"]);
    expect(page2.map((r) => r.occurredOn)).toEqual(["2026-06-01", "2026-05-20"]);
  });

  it("scopes to the given user only", async () => {
    await bootstrapUser("other");
    await insertTxn("other", {
      type: "expense",
      amountMinor: 999,
      occurredOn: "2026-06-01",
      title: "not mine",
    });
    const rows = await listTransactions(U, W);
    expect(rows.find((r) => r.title === "not mine")).toBeUndefined();
  });
});

describe("listTransactionsAsc", () => {
  it("returns oldest-first (reverse of listTransactions)", async () => {
    const rows = await listTransactionsAsc(U, W);
    expect(rows.map((r) => r.occurredOn)).toEqual([
      "2026-05-20",
      "2026-06-01",
      "2026-06-10",
      "2026-06-15",
    ]);
  });
});

describe("countTransactions", () => {
  it("counts with and without filters", async () => {
    expect(await countTransactions(U, W)).toBe(4);
    expect(await countTransactions(U, W, { type: "income" })).toBe(1);
  });
});

describe("getSummary", () => {
  it("totals income, expense, and balance", async () => {
    expect(await getSummary(U, W)).toEqual({
      income: 5000,
      expense: 3300,
      balance: 1700,
    });
  });

  it("returns zeroes for an empty set", async () => {
    // A user with no access to this workspace sees nothing in it.
    expect(await getSummary(uid("nobody"), W)).toEqual({
      income: 0,
      expense: 0,
      balance: 0,
    });
  });
});

describe("getCategoryBreakdown", () => {
  it("groups expenses by category, largest first (incl. uncategorized)", async () => {
    const rows = await getCategoryBreakdown(U, W, "expense");
    expect(rows[0]).toMatchObject({ categoryName: null, total: 2000 }); // Tools
    expect(rows.find((r) => r.categoryName === "Groceries")?.total).toBe(1300);
  });

  it("groups income by category", async () => {
    const rows = await getCategoryBreakdown(U, W, "income");
    expect(rows).toEqual([
      expect.objectContaining({ categoryName: "Salary", total: 5000 }),
    ]);
  });
});

describe("getMonthlyTrend", () => {
  it("buckets by month and type", async () => {
    const rows = await getMonthlyTrend(U, W, "2026-01-01");
    expect(rows).toContainEqual({ month: "2026-05", type: "expense", total: 2000 });
    expect(rows).toContainEqual({ month: "2026-06", type: "income", total: 5000 });
    expect(rows).toContainEqual({ month: "2026-06", type: "expense", total: 1300 });
  });

  it("can be scoped to a single profile", async () => {
    const rows = await getMonthlyTrend(U, W, "2026-01-01", work);
    expect(rows).toEqual([{ month: "2026-05", type: "expense", total: 2000 }]);
  });
});

describe("getCategories / getProfiles", () => {
  it("returns categories ordered by kind then name", async () => {
    const cats = await getCategories(U);
    expect(cats).toHaveLength(15);
    // Postgres orders the enum by its declared order: ENUM('income','expense').
    expect(cats[0].kind).toBe("income");
    const lastIncome = cats.map((c) => c.kind).lastIndexOf("income");
    const firstExpense = cats.map((c) => c.kind).indexOf("expense");
    expect(lastIncome).toBeLessThan(firstExpense); // all income before all expense
    // names sorted within the income group
    const incomeNames = cats.filter((c) => c.kind === "income").map((c) => c.name);
    expect(incomeNames).toEqual([...incomeNames].sort());
  });

  it("returns profiles in sidebar order", async () => {
    const profs = await getProfiles(U, W);
    expect(profs.map((p) => p.name)).toEqual(["Personal", "Work"]);
  });
});
