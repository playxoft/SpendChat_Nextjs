import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  budgetAlerts,
  budgets,
  categories,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  workspaceMembers,
  workspaces,
  type SpaceRole,
  type WorkspaceRole,
} from "@/db/schema";
import { addBudget, deleteBudget as deleteBudgetAction, updateBudget as updateBudgetAction } from "@/actions/budgets";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import { monthBounds, utcMonthKey } from "@/lib/budgets";
import { getAddLimits, getUsage } from "@/lib/entitlements";
import { ApiError } from "@/lib/errors";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  createBudget,
  deleteBudget,
  getBudgetAlertCount,
  getBudgetManagement,
  listBudgets,
  updateBudget,
} from "@/services/budgets";
import { deleteCategory } from "@/services/categories";
import { deleteProfile } from "@/services/profiles";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  categoryId,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";

/**
 * Budgets through the service layer: what each person sees and may change,
 * the plan's cap, and progress from the one spending query.
 */

const db = () => getTestDb();
const MONTH = utcMonthKey();
const DAY1 = `${MONTH}-01`;

/** Two months back — never "current" anywhere on Earth. */
function oldDate(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15));
  return d.toISOString().slice(0, 10);
}

type Fixture = {
  W: string;
  /** Space 1 holds Personal (p1); space 2 holds Kids (p2). */
  p1: string;
  p2: string;
  groceries: string;
  salary: string;
};

/**
 * The owner `adm`, plus members by access shape:
 *  - `all` — editor of both spaces (edits every profile);
 *  - `one` — editor of space 1 only (edits p1, can't read p2);
 *  - `vw`  — viewer of both spaces (reads everything, writes nothing);
 *  - `hid` — editor of both spaces, but an override hides p2.
 */
async function build(): Promise<Fixture> {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const s1 = await defaultSpaceIdOf(W);
  const p1 = await firstProfileId("adm");
  const [s2] = await db()
    .insert(spaces)
    .values({ workspaceId: W, name: "Family", position: 1 })
    .returning({ id: spaces.id });
  const [kids] = await db()
    .insert(profiles)
    .values({ userId: uid("adm"), workspaceId: W, spaceId: s2!.id, name: "Kids", sortOrder: 1 })
    .returning({ id: profiles.id });
  const p2 = kids!.id;

  const members: [string, WorkspaceRole, [string, SpaceRole][]][] = [
    ["all", "editor", [[s1, "editor"], [s2!.id, "editor"]]],
    ["one", "editor", [[s1, "editor"]]],
    ["vw", "viewer", [[s1, "viewer"], [s2!.id, "viewer"]]],
    ["hid", "editor", [[s1, "editor"], [s2!.id, "editor"]]],
  ];
  for (const [alias, role, inSpaces] of members) {
    await registerUser(alias);
    await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid(alias), role });
    for (const [spaceId, spaceRole] of inSpaces) {
      await db().insert(spaceMembers).values({ spaceId, userId: uid(alias), role: spaceRole });
    }
  }
  await db().insert(profileOverrides).values({ profileId: p2, userId: uid("hid"), access: "none" });
  // Overrides are a Plus feature; existing ones keep enforcing on any plan.
  return {
    W,
    p1,
    p2,
    groceries: await categoryId("adm", "Groceries", "expense"),
    salary: await categoryId("adm", "Salary", "income"),
  };
}

async function expectApiError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  if (code) expect((err as ApiError).code).toBe(code);
  return err as ApiError;
}

describe("budgets — schema", () => {
  it("one budget per scope, and the scope decides which column is set", async () => {
    const f = await build();
    await db().insert(budgets).values({ workspaceId: f.W, scope: "workspace", amountMinor: 100, createdBy: uid("adm") });
    // A second whole-workspace budget collides even though both ids are null.
    await expect(
      db().insert(budgets).values({ workspaceId: f.W, scope: "workspace", amountMinor: 200, createdBy: uid("adm") }),
    ).rejects.toThrow();
    // A profile budget without a profile, or with a category too, is refused.
    await expect(
      db().insert(budgets).values({ workspaceId: f.W, scope: "profile", amountMinor: 100, createdBy: uid("adm") }),
    ).rejects.toThrow();
    await expect(
      db().insert(budgets).values({
        workspaceId: f.W,
        scope: "profile",
        profileId: f.p1,
        categoryId: f.groceries,
        amountMinor: 100,
        createdBy: uid("adm"),
      }),
    ).rejects.toThrow();
    // Amounts are positive.
    await expect(
      db().insert(budgets).values({
        workspaceId: f.W,
        scope: "profile",
        profileId: f.p1,
        amountMinor: 0,
        createdBy: uid("adm"),
      }),
    ).rejects.toThrow();
  });
});

describe("budgets — create, change, delete", () => {
  it("adds one per scope, in the workspace's currency, and lists them in order", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.groceries, amount: 300 });
    await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: "150.50" });
    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1000, emailAlerts: false });

    const list = await listBudgets(uid("adm"), f.W, MONTH);
    expect(list.map((b) => [b.scope, b.label, b.amountMinor])).toEqual([
      ["workspace", "Whole workspace", 100000],
      ["profile", "Kids", 15050],
      ["category", "Groceries", 30000],
    ]);
    expect(list[0]).toMatchObject({ id, emailAlerts: false, month: MONTH, spentMinor: 0, status: "ok", canManage: true });
    expect(list[2]!.icon).toBe("🛒");

    const dup = await expectApiError(
      createBudget(uid("adm"), f.W, { scope: "workspace", amount: 5 }),
      409,
      "conflict",
    );
    expect(dup.message).toMatch(/already has a budget/);
  });

  it("refuses an income category, and a profile or category from elsewhere", async () => {
    const f = await build();
    const income = await expectApiError(
      createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.salary, amount: 10 }),
      422,
    );
    expect(income.message).toMatch(/expense category/);

    await bootstrapUser("str");
    const theirProfile = await firstProfileId("str");
    const theirCategory = await categoryId("str", "Groceries", "expense");
    await expectApiError(createBudget(uid("adm"), f.W, { scope: "profile", profileId: theirProfile, amount: 10 }), 422);
    await expectApiError(createBudget(uid("adm"), f.W, { scope: "category", categoryId: theirCategory, amount: 10 }), 422);
    await expectApiError(createBudget(uid("adm"), f.W, { scope: "workspace", amount: -1 }), 422);
  });

  it("refuses an amount that rounds to nothing in the workspace's currency", async () => {
    const f = await build();
    const tiny = await expectApiError(createBudget(uid("adm"), f.W, { scope: "workspace", amount: 0.001 }), 422);
    expect(tiny.message).toBe("The amount must be at least 0.01 USD");
    await db().update(workspaces).set({ currency: "JPY", locale: "ja-JP" }).where(eq(workspaces.id, f.W));
    const yen = await expectApiError(createBudget(uid("adm"), f.W, { scope: "workspace", amount: 0.4 }), 422);
    expect(yen.message).toBe("The amount must be at least 1 JPY");
    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1 });
    await expectApiError(updateBudget(uid("adm"), f.W, id, { amount: 0.4 }), 422);
    expect((await db().select().from(budgets))[0]!.amountMinor).toBe(1);
  });

  it("two adds racing for the last place: one wins, the other gets plan_limit", async () => {
    const f = await build();
    const expense = await db()
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.workspaceId, f.W), eq(categories.kind, "expense")));
    for (const c of expense.slice(0, 4)) {
      await createBudget(uid("adm"), f.W, { scope: "category", categoryId: c.id, amount: 1 });
    }
    const results = await Promise.allSettled([
      createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1 }),
      createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p1, amount: 1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as ApiError).code).toBe("plan_limit");
    expect(await db().select().from(budgets).where(eq(budgets.workspaceId, f.W))).toHaveLength(5);
  });

  it("changes the amount and the email switch; the scope stays", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });
    expect(await updateBudget(uid("adm"), f.W, id, { amount: 250, emailAlerts: false })).toBe(true);
    const [row] = await db().select().from(budgets).where(eq(budgets.id, id));
    expect(row).toMatchObject({ amountMinor: 25000, emailAlerts: false, scope: "profile", profileId: f.p1 });
    await expectApiError(updateBudget(uid("adm"), f.W, id, {}), 422);
    expect(await updateBudget(uid("adm"), f.W, "not-a-uuid", { amount: 1 })).toBe(false);
    expect(await deleteBudget(uid("adm"), f.W, id)).toBe(true);
    expect(await deleteBudget(uid("adm"), f.W, id)).toBe(false);
  });

  it("goes with its profile or category when that is deleted", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.groceries, amount: 100 });
    await deleteProfile(uid("adm"), f.p2);
    await deleteCategory(uid("adm"), f.W, f.groceries);
    expect(await db().select().from(budgets).where(eq(budgets.workspaceId, f.W))).toEqual([]);
  });

  it("the web actions answer in action results", async () => {
    const f = await build();
    signInAs("adm");
    const added = await addBudget({ scope: "profile", profileId: f.p1, amount: 50 });
    expect(added.ok).toBe(true);
    const id = (added as { id: string }).id;
    expect((await updateBudgetAction(id, { amount: 75 })).ok).toBe(true);
    expect(await updateBudgetAction(id, {}).then((r) => r.ok)).toBe(false);
    expect((await deleteBudgetAction(id)).ok).toBe(true);
    const missing = await deleteBudgetAction(id);
    expect(missing).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("budgets — who sees and who manages", () => {
  async function seeded() {
    const f = await build();
    const ws = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1000 });
    const kids = await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: 100 });
    const own = await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });
    const food = await createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.groceries, amount: 100 });
    return { f, ids: { ws: ws.id, kids: kids.id, own: own.id, food: food.id } };
  }
  const labels = async (alias: string, W: string) =>
    (await listBudgets(uid(alias), W, MONTH)).map((b) => `${b.label}${b.canManage ? "*" : ""}`);

  it("admins and readers of every profile see everything; others only their profiles' budgets", async () => {
    const { f } = await seeded();
    // `*` = can change it.
    expect(await labels("adm", f.W)).toEqual(["Whole workspace*", "Kids*", "Personal*", "Groceries*"]);
    expect(await labels("all", f.W)).toEqual(["Whole workspace*", "Kids*", "Personal*", "Groceries*"]);
    expect(await labels("vw", f.W)).toEqual(["Whole workspace", "Kids", "Personal", "Groceries"]);
    // Can't read Kids → no whole-workspace or category budget either.
    expect(await labels("one", f.W)).toEqual(["Personal*"]);
    // An override hiding one profile hides every budget that covers it.
    expect(await labels("hid", f.W)).toEqual(["Personal*"]);
  });

  it("a budget someone can't see reads as not found; one they can see but not manage is forbidden", async () => {
    const { f, ids } = await seeded();
    expect(await updateBudget(uid("one"), f.W, ids.kids, { amount: 1 })).toBe(false);
    expect(await deleteBudget(uid("one"), f.W, ids.ws)).toBe(false);
    await expectApiError(updateBudget(uid("vw"), f.W, ids.ws, { amount: 1 }), 403, "forbidden");
    await expectApiError(deleteBudget(uid("vw"), f.W, ids.own), 403, "forbidden");
    expect(await updateBudget(uid("one"), f.W, ids.own, { amount: 5 })).toBe(true);
  });

  it("adding needs edit access to every profile it covers", async () => {
    const f = await build();
    await expectApiError(createBudget(uid("vw"), f.W, { scope: "profile", profileId: f.p1, amount: 1 }), 403);
    await expectApiError(createBudget(uid("one"), f.W, { scope: "workspace", amount: 1 }), 403);
    await expectApiError(createBudget(uid("one"), f.W, { scope: "category", categoryId: f.groceries, amount: 1 }), 403);
    // A profile `one` can't read is not theirs to name.
    await expectApiError(createBudget(uid("one"), f.W, { scope: "profile", profileId: f.p2, amount: 1 }), 422);
    await createBudget(uid("one"), f.W, { scope: "profile", profileId: f.p1, amount: 1 });
    await createBudget(uid("all"), f.W, { scope: "category", categoryId: f.groceries, amount: 1 });

    expect((await getBudgetManagement(uid("one"), f.W)).scopes).toEqual({
      workspace: false,
      category: false,
      profileIds: [f.p1],
    });
    expect((await getBudgetManagement(uid("vw"), f.W)).scopes.profileIds).toEqual([]);
    expect((await getBudgetManagement(uid("adm"), f.W)).scopes.workspace).toBe(true);
  });

  it("a view-only workspace can't add or change budgets, but its admin can still delete one", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 10 });
    // A second, older free workspace makes this one the extra (view-only) one.
    const [older] = await db().select().from(workspaces).where(eq(workspaces.id, f.W));
    await db().insert(workspaces).values({
      name: "Older",
      ownerId: uid("adm"),
      organizationId: older!.organizationId,
      createdAt: new Date(older!.createdAt.getTime() - 60_000),
    });
    const err = await expectApiError(createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p1, amount: 1 }), 403, "plan_limit");
    expect((err.details as { limit: string }).limit).toBe("freeWorkspaces");
    await expectApiError(updateBudget(uid("adm"), f.W, id, { amount: 1 }), 403, "plan_limit");
    expect((await listBudgets(uid("adm"), f.W, MONTH))[0]).toMatchObject({ canManage: false, canDelete: true });
    expect((await getBudgetManagement(uid("adm"), f.W)).readOnly).toBe(true);
    expect(await deleteBudget(uid("adm"), f.W, id)).toBe(true);
  });
});

describe("budgets — plan limits (5 / 20 / 200)", () => {
  it("Free stops at 5 with an upgrade to Plus; Plus at 20 with Pro; Pro at 200 with 'contact us'", async () => {
    const f = await build();
    const expense = await db()
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.workspaceId, f.W), eq(categories.kind, "expense")));
    // 7 expense categories + the workspace + 2 profiles = 10 distinct scopes.
    const scopes = [
      { scope: "workspace" as const },
      { scope: "profile" as const, profileId: f.p1 },
      { scope: "profile" as const, profileId: f.p2 },
      ...expense.map((c) => ({ scope: "category" as const, categoryId: c.id })),
    ];
    for (const s of scopes.slice(0, 5)) await createBudget(uid("adm"), f.W, { ...s, amount: 1 });
    const free = await expectApiError(createBudget(uid("adm"), f.W, { ...scopes[5]!, amount: 1 }), 403, "plan_limit");
    expect(free.details).toEqual({ limit: "budgets", plan: "free", max: 5, used: 5, upgradeTo: "plus" });
    expect(free.message).toBe("This workspace's Free plan includes 5 budgets. Upgrade to Plus for 20 budgets.");

    // Over the cap after a downgrade: everything stays, adding stops.
    await setWorkspacePlan(f.W, "plus");
    for (const s of scopes.slice(5)) await createBudget(uid("adm"), f.W, { ...s, amount: 1 });
    await setWorkspacePlan(f.W, "free");
    expect(await listBudgets(uid("adm"), f.W, MONTH)).toHaveLength(10);
    const limits = await getAddLimits(f.W, uid("adm"));
    expect(limits.budgets).toEqual({ used: 10, limit: 5, reached: true, unlimited: false });
  });

  it("reports the cap and Pro's Unlimited in the usage panel and add limits", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1 });
    expect((await getUsage(f.W)).budgets).toEqual({ used: 1, limit: 5, unlimited: false });
    await setWorkspacePlan(f.W, "pro");
    expect((await getUsage(f.W)).budgets).toEqual({ used: 1, limit: PLAN_LIMITS.pro.budgets.max, unlimited: true });
    expect((await getAddLimits(f.W, uid("adm"))).budgets).toEqual({
      used: 1,
      limit: 200,
      reached: false,
      unlimited: true,
    });
  });

  it("Pro's safety cap says contact us (no plan to upgrade to)", async () => {
    const f = await build();
    await setWorkspacePlan(f.W, "pro");
    // 200 rows straight in: a category per budget, created for the occasion.
    const rows = await db()
      .insert(categories)
      .values(Array.from({ length: 200 }, (_, i) => ({ userId: uid("adm"), workspaceId: f.W, name: `C${i}`, kind: "expense" as const })))
      .returning({ id: categories.id });
    await db()
      .insert(budgets)
      .values(rows.map((r) => ({ workspaceId: f.W, scope: "category" as const, categoryId: r.id, amountMinor: 1, createdBy: uid("adm") })));
    const err = await expectApiError(createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1 }), 403, "plan_limit");
    expect(err.details).toMatchObject({ limit: "budgets", plan: "pro", max: 200, used: 200, upgradeTo: null });
    expect(err.message).toMatch(/contact us/);
  });
});

describe("budgets — progress", () => {
  it("counts this month's expenses only, across every profile, whoever is looking", async () => {
    const f = await build();
    await insertTxn("adm", { type: "expense", amountMinor: 4000, occurredOn: DAY1, profileId: f.p1, categoryId: f.groceries });
    await insertTxn("adm", { type: "expense", amountMinor: 5000, occurredOn: DAY1, profileId: f.p2, categoryId: f.groceries });
    await insertTxn("adm", { type: "expense", amountMinor: 1000, occurredOn: DAY1, profileId: f.p2 });
    // Income never offsets; other months don't count.
    await insertTxn("adm", { type: "income", amountMinor: 99999, occurredOn: DAY1, profileId: f.p1 });
    await insertTxn("adm", { type: "expense", amountMinor: 77777, occurredOn: oldDate(), profileId: f.p1 });
    // Another workspace's spending never leaks in.
    await bootstrapUser("other");
    await insertTxn("other", { type: "expense", amountMinor: 55555, occurredOn: DAY1 });

    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 125 });
    await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.groceries, amount: 100 });

    const byLabel = Object.fromEntries(
      (await listBudgets(uid("vw"), f.W, MONTH)).map((b) => [b.label, [b.spentMinor, b.percent, b.status]]),
    );
    expect(byLabel).toEqual({
      "Whole workspace": [10000, 80, "warn"],
      Kids: [6000, 60, "ok"],
      Groceries: [9000, 90, "warn"],
    });
    expect(await getBudgetAlertCount(uid("vw"), f.W, MONTH)).toEqual({ warn: 2, over: 0 });
    // `one` sees only Personal, which has no budget.
    expect(await getBudgetAlertCount(uid("one"), f.W, MONTH)).toEqual({ warn: 0, over: 0 });

    const matrix = await getMonthExpenseMatrix(f.W, MONTH);
    expect(matrix.reduce((sum, c) => sum + c.totalMinor, 0)).toBe(10000);
  });

  it("changing the amount or the email switch never touches the alert log", async () => {
    const f = await build();
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    const { id } = await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });
    const month = monthBounds(MONTH).first;
    await db().insert(budgetAlerts).values([
      { budgetId: id, month, threshold: 80, amountMinor: 10000 },
      { budgetId: id, month, threshold: 100, amountMinor: 10000 },
    ]);
    for (const amount of [110, 1000, 50, 100]) await updateBudget(uid("adm"), f.W, id, { amount });
    await updateBudget(uid("adm"), f.W, id, { emailAlerts: false });
    expect(await db().select().from(budgetAlerts)).toHaveLength(2);
  });
});
