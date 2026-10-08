import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { profiles, spaceMembers, spaces, transactions, workspaceMembers } from "@/db/schema";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { getAdvancedAnalytics } from "@/lib/insights-queries";
import { getProfiles } from "@/lib/queries";
import { createTxnTag } from "@/services/tags";
import { signInAs, uid } from "./helpers/session";
import {
  bootstrapUser,
  categoryId,
  firstProfileId,
  insertTxn,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";
import { seedProfile } from "./helpers/vault-seed";
import { captureSql, getTestClient, getTestDb } from "./helpers/test-db";

/**
 * The reads behind "Insights & trends" (`getAdvancedAnalytics`): gated to Plus
 * and Pro before anything is read, scoped to the profiles the caller can view,
 * blind to the trash, and served by the partial feed index.
 */

const A = "ins";
const TODAY = "2026-06-20";
let U: string;
let W: string;
let personal: string;
let work: string;
let old: string;
let housing: string;
let shopping: string;
let groceries: string;
let salary: string;
let tripTag: string;

const opts = (over: Partial<Parameters<typeof getAdvancedAnalytics>[2]> = {}) => ({
  today: TODAY,
  from: "2026-06-01",
  to: "2026-06-30",
  currency: "USD",
  locale: "en-US",
  ...over,
});

/** Every amount and title anywhere in the result, to prove the trash never leaks in. */
const everything = (d: unknown) => JSON.stringify(d);

beforeEach(async () => {
  signInAs(A);
  await bootstrapUser(A);
  U = uid(A);
  W = await workspaceIdOf(A);
  await setWorkspacePlan(W, "plus");
  personal = await firstProfileId(A);
  work = await seedProfile(A, "Work");
  old = await seedProfile(A, "Old");
  housing = await categoryId(A, "Housing", "expense");
  shopping = await categoryId(A, "Shopping", "expense");
  groceries = await categoryId(A, "Groceries", "expense");
  salary = await categoryId(A, "Salary", "income");
  tripTag = (await createTxnTag(U, W, { name: "Trip", color: "#64748b" })).id;

  const e = (occurredOn: string, amountMinor: number, categoryId: string, title: string | null, profileId = personal) =>
    insertTxn(A, { type: "expense", amountMinor, occurredOn, categoryId, title, profileId });

  for (const m of ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]) {
    await insertTxn(A, { type: "income", amountMinor: 500000, occurredOn: `${m}-01`, categoryId: salary, title: "Salary", profileId: personal });
    await e(`${m}-01`, 150000, housing, "Rent");
    await e(`${m}-05`, 2000, shopping, "Socks");
    await e(`${m}-12`, 8000, groceries, "Market");
  }
  await e("2026-06-10", 200000, shopping, "Laptop");
  const trip = await e("2026-06-14", 30000, groceries, "Trip food", work);
  await getTestDb().update(transactions).set({ tagIds: [tripTag] }).where(eq(transactions.id, trip));
  // After today: planned, so not "so far".
  await e("2026-06-25", 5000, groceries, "Market");

  // The trash: a trashed row in a live profile, and live rows in a trashed profile.
  const ghost = await e("2026-06-15", 999999, shopping, "Ghost");
  await getTestDb().update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, ghost));
  await getTestDb().update(transactions).set({ tagIds: [tripTag] }).where(eq(transactions.id, ghost));
  for (const m of ["2026-03", "2026-04", "2026-05", "2026-06"]) await e(`${m}-02`, 777777, housing, "Phantom", old);
  await getTestDb().update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.id, old));
});

describe("getAdvancedAnalytics — the plan gate", () => {
  it("refuses Free with plan_limit before reading a single transaction", async () => {
    await setWorkspacePlan(W, "free");
    let error: unknown;
    const statements = await captureSql(async () => {
      error = await getAdvancedAnalytics(U, W, opts()).catch((e: unknown) => e);
    });
    expect(error).toMatchObject({
      status: 403,
      code: "plan_limit",
      details: { limit: "advancedAnalytics", plan: "free", upgradeTo: "plus" },
    });
    expect(statements.length).toBeGreaterThan(0); // the plan was read…
    for (const st of statements) expect(st.text).not.toMatch(/"transactions"/); // …and nothing else
  });

  it("takes the plan the page already read — for this workspace only", async () => {
    const plus = await getWorkspaceEntitlements(W);
    await setWorkspacePlan(W, "free");
    const free = { ...plus, plan: "free" as const, limits: { ...plus.limits, advancedAnalytics: false } };
    // The page's own read decides, without reading the plan again…
    await expect(getAdvancedAnalytics(U, W, opts(), { entitlements: free })).rejects.toMatchObject({
      code: "plan_limit",
    });
    // …but one for another workspace is ignored, and the plan read afresh.
    await expect(
      getAdvancedAnalytics(U, W, opts(), { entitlements: { ...plus, workspaceId: work } }),
    ).rejects.toMatchObject({ code: "plan_limit" });
    await setWorkspacePlan(W, "plus");
    const statements = await captureSql(() => getAdvancedAnalytics(U, W, opts(), { entitlements: plus }));
    expect(statements.some((st) => /from "workspaces"/.test(st.text))).toBe(false);
  });

  it("scopes to the profiles the page passes, which are the caller's own list", async () => {
    const mine = await getProfiles(U, W);
    const d = await getAdvancedAnalytics(U, W, opts(), { profiles: mine.filter((p) => p.id === work) });
    expect(d.pace.soFar).toBe(30000);
    expect(d.breakdown.profiles).toBeNull();
  });

  it("serves Plus and Pro", async () => {
    await expect(getAdvancedAnalytics(U, W, opts())).resolves.toMatchObject({ today: TODAY });
    await setWorkspacePlan(W, "pro");
    await expect(getAdvancedAnalytics(U, W, opts())).resolves.toMatchObject({ today: TODAY });
  });
});

describe("getAdvancedAnalytics — the numbers", () => {
  it("adds up cash flow, the month so far and the comparisons in minor units", async () => {
    const d = await getAdvancedAnalytics(U, W, opts());
    const june = d.cashFlow.months.find((m) => m.month === "2026-06")!;
    expect(june.income).toBe(500000);
    // Rent + socks + market + laptop + trip food + the planned market.
    expect(june.expense).toBe(150000 + 2000 + 8000 + 200000 + 30000 + 5000);
    expect(d.pace.soFar).toBe(150000 + 2000 + 8000 + 200000 + 30000);
    expect(d.pace.lastMonth).toEqual({ total: 160000, toDate: 160000 });
    expect(d.pace.usual).toEqual({ total: 160000, toDate: 160000, months: 3 });
    expect(d.pace.lastYear).toBeNull();
    expect(d.pace.method).toBe("history");
    expect(Number.isInteger(d.pace.projected)).toBe(true);
    expect(d.cashFlow.months.find((m) => m.month === "2026-02")!.expense).toBe(160000);
  });

  it("spots the rent as recurring, the laptop as unusual, and ranks payees, tags and profiles", async () => {
    const d = await getAdvancedAnalytics(U, W, opts());
    expect(d.recurring.items.map((r) => r.label)).toEqual(expect.arrayContaining(["Rent", "Socks", "Market"]));
    expect(d.recurring.items.find((r) => r.label === "Rent")).toMatchObject({
      typical: 150000,
      nextDate: "2026-07-01",
    });
    expect(d.anomalies[0]).toMatchObject({ title: "Laptop", amount: 200000, typical: 2000, ratio: 100 });
    expect(d.breakdown.payees[0]).toMatchObject({ label: "Laptop", total: 200000, count: 1 });
    expect(d.breakdown.tags).toEqual([
      { key: tripTag, label: "Trip", color: "#64748b", total: 30000, count: 1 },
    ]);
    expect(d.breakdown.profiles?.map((p) => p.label).sort()).toEqual(["Personal", "Work"]);
    expect(d.calendar.months.map((m) => m.month)).toEqual(["2026-06"]);
    expect(d.calendar.total).toBe(150000 + 2000 + 8000 + 200000 + 30000);
    expect(d.trends.rows[0]).toMatchObject({ name: "Housing", soFar: 150000, usualToDate: 150000 });
  });

  it("groups a payment whose title carries its month", async () => {
    const health = await categoryId(A, "Health", "expense");
    const titles = ["Gym Feb 2026", "Gym March", "Gym - Apr", "Gym May 2026", "Gym (June)"];
    for (const [i, title] of titles.entries()) {
      await insertTxn(A, {
        type: "expense",
        amountMinor: 4000,
        occurredOn: `2026-0${i + 2}-15`,
        categoryId: health,
        title,
        profileId: personal,
      });
    }
    const d = await getAdvancedAnalytics(U, W, opts());
    expect(d.recurring.items.find((r) => r.categoryId === health)).toMatchObject({
      label: "Gym",
      typical: 4000,
      occurrences: 5,
      nextDate: "2026-07-15",
    });
  });

  it("narrows to one profile, and leaves the per-profile breakdown out", async () => {
    const d = await getAdvancedAnalytics(U, W, opts({ profileId: work }));
    expect(d.cashFlow.income).toBe(0);
    expect(d.pace.soFar).toBe(30000);
    expect(d.breakdown.profiles).toBeNull();
    expect(d.recurring.items).toEqual([]);
  });

  it("covers the last 12 months for all time, and the whole range for the breakdowns", async () => {
    const d = await getAdvancedAnalytics(U, W, opts({ from: undefined, to: undefined }));
    expect(d.calendar.window).toEqual({ from: "2025-07-01", to: TODAY, clamped: true });
    expect(d.calendar.months).toHaveLength(12);
    expect(d.breakdown.payees.find((p) => p.label === "Rent")).toMatchObject({ total: 750000, count: 5 });
  });
});

describe("getAdvancedAnalytics — the trash", () => {
  it("never counts a trashed transaction or anything in a trashed profile", async () => {
    for (const o of [opts(), opts({ from: undefined, to: undefined }), opts({ profileId: personal })]) {
      const d = await getAdvancedAnalytics(U, W, o);
      const text = everything(d);
      for (const leak of ["Ghost", "Phantom", "999999", "777777", "Old"]) expect(text).not.toContain(leak);
      expect(d.anomalies.map((a) => a.title)).not.toContain("Ghost");
    }
    // A profile in the trash can't be asked for by name either.
    const d = await getAdvancedAnalytics(U, W, opts({ profileId: old }));
    expect(d.cashFlow.expense).toBe(0);
    expect(d.breakdown.payees).toEqual([]);
  });
});

describe("getAdvancedAnalytics — access", () => {
  it("shows an outsider nothing", async () => {
    await bootstrapUser("out");
    const d = await getAdvancedAnalytics(uid("out"), W, opts());
    expect(d.cashFlow.income).toBe(0);
    expect(d.cashFlow.expense).toBe(0);
    expect(d.breakdown.payees).toEqual([]);
    expect(d.recurring.items).toEqual([]);
  });

  it("shows a member only the spaces they're in, whatever profile they name", async () => {
    const db = getTestDb();
    const [family] = await db
      .insert(spaces)
      .values({ workspaceId: W, name: "Family", position: 1 })
      .returning({ id: spaces.id });
    const [kids] = await db
      .insert(profiles)
      .values({ userId: U, workspaceId: W, spaceId: family!.id, name: "Kids", sortOrder: 5 })
      .returning({ id: profiles.id });
    await insertTxn(A, { type: "expense", amountMinor: 4200, occurredOn: "2026-06-03", categoryId: groceries, title: "Crayons", profileId: kids!.id });
    await registerUser("viewer");
    await db.insert(workspaceMembers).values({ workspaceId: W, userId: uid("viewer"), role: "viewer" });
    await db.insert(spaceMembers).values({ spaceId: family!.id, userId: uid("viewer"), role: "viewer" });

    const d = await getAdvancedAnalytics(uid("viewer"), W, opts());
    expect(d.pace.soFar).toBe(4200);
    expect(d.breakdown.payees.map((p) => p.label)).toEqual(["Crayons"]);
    expect(everything(d)).not.toContain("Laptop");
    // Naming a profile outside their spaces reads as nothing, not as that profile.
    const named = await getAdvancedAnalytics(uid("viewer"), W, opts({ profileId: personal }));
    expect(named.cashFlow.expense).toBe(0);
    expect(named.breakdown.payees).toEqual([]);
  });
});

describe("getAdvancedAnalytics — performance", () => {
  // The month aggregate is the widest read here (13 months). It must read the
  // partial `transactions_profile_date_idx` — which it can only do because
  // `notTrashed` puts the literal `deleted_at is null` in its `where` — rather
  // than scan the table. Seeded past the size where PGlite's planner prefers
  // the index (see the vault/feed plan tests in queries.test.ts).
  it("reads the month aggregate and the daily totals through the partial feed index", async () => {
    await getTestClient().query(`
      insert into transactions (user_id, type, amount_minor, profile_id, occurred_on, created_at)
      select '${U}'::uuid, 'expense', i,
             (array['${personal}'::uuid, '${work}'::uuid])[1 + (i % 2)],
             date '2018-01-01' + (i / 2),
             timestamptz '2018-01-01' + (i || ' seconds')::interval
      from generate_series(1, 6000) i`);
    await getTestDb().execute(sql`analyze transactions`);

    const statements = await captureSql(() => getAdvancedAnalytics(U, W, opts()));
    const explain = async (match: (text: string) => boolean, label: string) => {
      const st = statements.find((s) => match(s.text));
      expect(st, `no ${label} statement captured`).toBeTruthy();
      const res = await getTestClient().query(`explain (costs off) ${st!.text}`, st!.params);
      return (res.rows as { "QUERY PLAN": string }[]).map((r) => r["QUERY PLAN"]).join("\n");
    };
    const monthly = await explain((t) => t.includes("'YYYY-MM')") && t.includes("filter (where"), "month aggregate");
    expect(monthly, `the month aggregate ignores the index:\n${monthly}`).toContain("transactions_profile_date_idx");
    expect(monthly).not.toMatch(/Seq Scan on transactions/);
    const daily = await explain(
      (t) => /group by "transactions"\."occurred_on"/.test(t),
      "daily totals",
    );
    expect(daily, `the daily totals ignore the index:\n${daily}`).toContain("transactions_profile_date_idx");
  });
});
