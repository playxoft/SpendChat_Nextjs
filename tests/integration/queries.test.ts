import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import {
  listTransactions,
  listTransactionsAsc,
  listFeedPage,
  listVaultFiles,
  listTransactionFilesForVault,
  getTransactionById,
  countTransactions,
  getSummary,
  getCategoryBreakdown,
  getMonthlyTrend,
  getCategories,
  getProfiles,
  getWorkspaceStorageUsage,
} from "@/lib/queries";
import { addProfile } from "@/actions/profiles";
import { files, transactionAttachments, transactions } from "@/db/schema";
import { signInAs, uid } from "./helpers/session";
import {
  bootstrapUser,
  firstProfileId,
  categoryId,
  insertTxn,
  workspaceIdOf,
} from "./helpers/seed";
import { captureSql, getTestClient, getTestDb } from "./helpers/test-db";

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

  // Rows written in one statement share `occurred_on` *and* `created_at` to the
  // microsecond, which is what `addBulkTransactions` does. Without `id` as a
  // final tiebreaker the order between them is undefined, so the boundary
  // between two pages can land differently for each page and a row comes back
  // twice or not at all. Both profiles are represented, so this runs through
  // the merge-append shape rather than a single scan.
  describe("rows tied on both timestamps", () => {
    const DAY = "2026-07-04";
    const range = { from: DAY, to: DAY };

    beforeEach(async () => {
      await getTestDb()
        .insert(transactions)
        .values(
          Array.from({ length: 6 }, (_, i) => ({
            userId: U,
            type: "expense" as const,
            amountMinor: 100 + i,
            occurredOn: DAY,
            profileId: i % 2 === 0 ? personal : work,
            title: `tie ${i}`,
          })),
        );
    });

    it("orders them by id, descending", async () => {
      const ids = (await listTransactions(U, W, range)).map((r) => r.id);
      expect(ids).toHaveLength(6);
      expect(ids).toEqual([...ids].sort().reverse());
    });

    it("pages through them without repeating or skipping one", async () => {
      const all = (await listTransactions(U, W, range)).map((r) => r.id);
      const paged: string[] = [];
      for (let offset = 0; offset < 6; offset += 2) {
        paged.push(...(await listTransactions(U, W, { ...range, limit: 2, offset })).map((r) => r.id));
      }
      expect(paged).toEqual(all);
      expect(new Set(paged).size).toBe(6);
    });
  });

  // The page is picked from `transactions` alone and the joins hang off it, so
  // a custom sort is expressed twice: once inside the subquery (category via a
  // correlated subquery, since the join isn't there yet) and once outside it
  // (via the real join). These pin the two to the same answer.
  describe("column sorts", () => {
    it("sorts by category name ascending, uncategorized last", async () => {
      const rows = await listTransactions(U, W, { sort: "category", dir: "asc" });
      expect(rows.map((r) => r.categoryName)).toEqual(["Groceries", "Groceries", "Salary", null]);
      expect(rows.map((r) => r.title)).toEqual(["snacks", "Veg apples", "June pay", "Tools"]);
    });

    it("sorts by category name descending, uncategorized first", async () => {
      const rows = await listTransactions(U, W, { sort: "category", dir: "desc" });
      expect(rows.map((r) => r.categoryName)).toEqual([null, "Salary", "Groceries", "Groceries"]);
    });

    it("sorts by signed amount, so ascending runs biggest expense → biggest income", async () => {
      const rows = await listTransactions(U, W, { sort: "amount", dir: "asc" });
      expect(rows.map((r) => r.title)).toEqual(["Tools", "Veg apples", "snacks", "June pay"]);
    });
  });
});

describe("getTransactionById", () => {
  it("returns the row with its category, profile and author joined", async () => {
    const [target] = await listTransactions(U, W, { search: "Veg apples" });
    const row = await getTransactionById(U, W, target!.id);
    expect(row).toMatchObject({
      id: target!.id,
      title: "Veg apples",
      categoryName: "Groceries",
      profileId: personal,
    });
    expect(row!.attachments).toEqual([]);
  });

  it("reads as absent from a workspace that can't see it", async () => {
    const [target] = await listTransactions(U, W, { search: "Veg apples" });
    await bootstrapUser("other");
    const otherW = await workspaceIdOf("other");
    expect(await getTransactionById(uid("other"), otherW, target!.id)).toBeNull();
  });

  it("returns null for an id that doesn't exist", async () => {
    expect(await getTransactionById(U, W, uid("nope"))).toBeNull();
  });
});

describe("listFeedPage", () => {
  it("merges every accessible profile, newest first", async () => {
    const rows = await listFeedPage(U, W, { limit: 10 });
    expect(rows.map((r) => r.occurredOn)).toEqual([
      "2026-06-15",
      "2026-06-10",
      "2026-06-01",
      "2026-05-20",
    ]);
  });

  it("pages back through history from a cursor", async () => {
    const first = await listFeedPage(U, W, { limit: 2 });
    expect(first.map((r) => r.occurredOn)).toEqual(["2026-06-15", "2026-06-10"]);
    const last = first[first.length - 1]!;
    const older = await listFeedPage(U, W, {
      limit: 2,
      before: { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id },
    });
    expect(older.map((r) => r.occurredOn)).toEqual(["2026-06-01", "2026-05-20"]);
  });

  it("can be scoped to a single profile", async () => {
    const rows = await listFeedPage(U, W, { profileId: work, limit: 10 });
    expect(rows.map((r) => r.title)).toEqual(["Tools"]);
  });

  // The cursor is a bound, not a filter, so it has to name its row exactly. A
  // `created_at` a fraction early excludes every row tied with that row — and a
  // bulk import ties its whole batch. What keeps that from happening is the
  // column being `timestamptz(3)`, which is the one thing a JavaScript `Date`
  // can carry without loss; assert it directly, because a walk seeded through
  // the app can only ever produce values the column already rounded.
  it("stores created_at at the millisecond precision the cursor round-trips", async () => {
    const { rows } = await getTestDb().execute(sql`
      select datetime_precision from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'created_at'`);
    expect(Number(rows[0]!.datetime_precision)).toBe(3);
  });

  it("walks the whole feed from a cursor without repeating or skipping a row", async () => {
    const db = getTestDb();
    // Written with sub-millisecond timestamps on purpose: the column rounds them
    // to the millisecond, which is what makes the tie survive the round trip. If
    // the column is ever widened, these land in the same millisecond with
    // different microseconds and the walk below drops the tail of the batch.
    await db.execute(sql`
      insert into transactions (user_id, type, amount_minor, occurred_on, profile_id, title, created_at)
      select ${U}::uuid, 'expense', 500 + i, date '2026-07-04',
             (array[${personal}::uuid, ${work}::uuid])[1 + (i % 2)], 'walk ' || i,
             timestamptz '2026-07-04 10:00:00.123000+00' + (i || ' microseconds')::interval
      from generate_series(0, 8) i`);
    const all = await listFeedPage(U, W, { limit: 100 });
    expect(all).toHaveLength(13);

    const walked: string[] = [];
    let before: { occurredOn: string; createdAt: Date; id: string } | undefined;
    for (;;) {
      const page = await listFeedPage(U, W, { limit: 4, before });
      if (page.length === 0) break;
      walked.push(...page.map((r) => r.id));
      const last = page[page.length - 1]!;
      before = { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id };
    }
    expect(walked).toEqual(all.map((r) => r.id));
    expect(new Set(walked).size).toBe(13);
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
    const cats = await getCategories(W);
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

describe("getWorkspaceStorageUsage", () => {
  it("is 0 for a workspace with nothing stored", async () => {
    expect(await getWorkspaceStorageUsage(W)).toBe(0);
  });

  it("sums vault files + attachments, scoped to the workspace only", async () => {
    const db = getTestDb();
    await db.insert(files).values([
      {
        workspaceId: W,
        profileId: personal,
        userId: U,
        r2Key: "vault/seed-a",
        name: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 1_000,
      },
      {
        workspaceId: W,
        profileId: work,
        userId: U,
        r2Key: "vault/seed-b",
        name: "b.pdf",
        contentType: "application/pdf",
        sizeBytes: 2_000,
      },
    ]);
    const txnId = await insertTxn(U, {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-20",
    });
    await db.insert(transactionAttachments).values({
      transactionId: txnId,
      profileId: personal,
      workspaceId: W,
      userId: U,
      r2Key: "attachments/seed",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 4_000,
    });

    // Another user's workspace must not leak into the sum, in either direction.
    await bootstrapUser("z");
    const otherWs = await workspaceIdOf("z");
    await db.insert(files).values({
      workspaceId: otherWs,
      profileId: await firstProfileId("z"),
      userId: uid("z"),
      r2Key: "vault/seed-z",
      name: "z.pdf",
      contentType: "application/pdf",
      sizeBytes: 999,
    });

    expect(await getWorkspaceStorageUsage(W)).toBe(7_000);
    expect(await getWorkspaceStorageUsage(otherWs)).toBe(999);
  });
});

/**
 * These guard a class of bug, not one instance of it.
 *
 * Postgres matches an index to a sort on pathkeys that compare the null
 * ordering **exactly** — it does not reason "the column is NOT NULL, so this
 * can't matter". Drizzle's `.desc()` emits `DESC NULLS LAST`, but `ORDER BY x
 * DESC` means `DESC NULLS FIRST`, so a `.desc()` index silently fails to serve
 * the sort it was built for: still created, still used for the leading-column
 * lookup, and `EXPLAIN` still shows the shape you expected, with the `Sort`
 * hiding one level down. It cost `transactions` 31,793 buffer reads a page
 * instead of 164 before anyone noticed, and the vault's two tables carried the
 * same mistake for months after.
 */
describe("index/sort agreement", () => {
  it("has no index whose null ordering our ORDER BYs can't use", async () => {
    // Postgres prints only *non-default* null ordering, and the default follows
    // the direction: `NULLS FIRST` for DESC, `NULLS LAST` for ASC. So anything
    // printed here — `DESC NULLS LAST`, or a bare `NULLS FIRST` on an ascending
    // column — is by definition the half no plain `ORDER BY` can match.
    const { rows } = await getTestDb().execute(sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public'
        and (indexdef like '%DESC NULLS LAST%' or indexdef like '%NULLS FIRST%')
      order by indexname`);
    expect(rows.map((r) => `${r.indexname}: ${r.indexdef}`)).toEqual([]);
  });

  it("indexes the vault's two tables by the column their reads scope to", async () => {
    const { rows } = await getTestDb().execute(sql`
      select indexname, regexp_replace(indexdef, '^.* USING ', '') as shape
      from pg_indexes
      where schemaname = 'public' and tablename in ('files', 'transaction_attachments')
      order by indexname`);
    expect(rows.map((r) => `${r.indexname}: ${r.shape}`)).toEqual([
      "files_folder_idx: btree (folder_id)",
      "files_pkey: btree (id)",
      "files_profile_created_idx: btree (profile_id, created_at DESC, id DESC)",
      "files_workspace_idx: btree (workspace_id)",
      "transaction_attachments_pkey: btree (id)",
      "txn_attachments_profile_created_idx: btree (profile_id, created_at DESC, id DESC)",
      "txn_attachments_txn_idx: btree (transaction_id, created_at)",
      "txn_attachments_workspace_idx: btree (workspace_id)",
    ]);
  });

  // The index existing proves nothing if the query stops being able to use it,
  // so this explains the listing's *own* SQL and asserts the planner sorts
  // nothing. Both halves of the vault page, since it awaits them together.
  it("plans both vault listings without a sort when scoped to one profile", async () => {
    for (const [label, run] of [
      ["files", () => listVaultFiles(U, W, personal)],
      ["attachments", () => listTransactionFilesForVault(U, W, personal)],
    ] as const) {
      const statements = await captureSql(run);
      const listing = statements.find(
        (s) => s.text.includes("order by") && s.text.includes("limit"),
      );
      expect(listing, `no listing statement captured for ${label}`).toBeTruthy();
      const explained = await getTestClient().query(
        `explain (costs off) ${listing!.text}`,
        listing!.params,
      );
      const plan = (explained.rows as { "QUERY PLAN": string }[])
        .map((r) => r["QUERY PLAN"])
        .join("\n");
      expect(plan, `${label} listing sorts:\n${plan}`).not.toMatch(/\bSort\b/);
    }
  });
});
