import { describe, it, expect, vi } from "vitest";

// Deleting a profile sweeps its stored objects; keep the edge mocked.
vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq } from "drizzle-orm";
import { budgets, profiles, spaceMembers, spaces, workspaceMembers } from "@/db/schema";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import { utcMonthKey } from "@/lib/budgets";
import { settleDeferred } from "@/lib/defer";
import { sendEmail } from "@/lib/email";
import { countBudgets, getAddLimits } from "@/lib/entitlements";
import { createBudget, deleteBudget, listBudgets, updateBudget } from "@/services/budgets";
import { deleteProfile } from "@/services/profiles";
import { deleteTransaction } from "@/services/transactions";
import { restoreAllTransactions, restoreFromTrash } from "@/services/trash";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  workspaceIdOf,
} from "./helpers/seed";

/**
 * Budgets and the trash: nothing in the trash counts toward a budget, a
 * trashed profile's budget is hidden (from admins too) until the profile is
 * restored, and every restore re-checks the budgets.
 */

const db = () => getTestDb();
const MONTH = utcMonthKey();
const DAY1 = `${MONTH}-01`;

async function budgetMail() {
  await settleDeferred();
  return vi
    .mocked(sendEmail)
    .mock.calls.map(([m]) => m)
    .filter((m) => /budget/i.test(m.subject));
}

/** `adm` owns the workspace; Personal (p1) and Kids (p2) share its one space. */
async function build() {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const s1 = await defaultSpaceIdOf(W);
  const p1 = await firstProfileId("adm");
  const [kids] = await db()
    .insert(profiles)
    .values({ userId: uid("adm"), workspaceId: W, spaceId: s1, name: "Kids", sortOrder: 1 })
    .returning({ id: profiles.id });
  vi.mocked(sendEmail).mockClear(); // the welcome email
  return { W, s1, p1, p2: kids!.id };
}

describe("budgets and the trash", () => {
  it("a trashed transaction doesn't count; restoring it does, and re-checks the budgets", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    const id = await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    await deleteTransaction(uid("adm"), f.W, id);
    expect((await listBudgets(uid("adm"), f.W, MONTH))[0]).toMatchObject({ spentMinor: 0, status: "ok" });
    expect(await getMonthExpenseMatrix(f.W, MONTH)).toEqual([]);

    await restoreFromTrash(uid("adm"), f.W, { transactionIds: [id] });
    expect((await listBudgets(uid("adm"), f.W, MONTH))[0]).toMatchObject({ spentMinor: 9000, status: "warn" });
    // The restore scheduled a check: the admin hears about 80%.
    expect((await budgetMail()).map((m) => m.to)).toEqual(["adm@example.com"]);
  });

  it("'restore all' re-checks the budgets too", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    for (const amountMinor of [6000, 6000]) {
      const id = await insertTxn("adm", { type: "expense", amountMinor, occurredOn: DAY1, profileId: f.p1 });
      await deleteTransaction(uid("adm"), f.W, id);
    }
    expect(await budgetMail()).toEqual([]);
    expect((await restoreAllTransactions(uid("adm"), f.W)).restored).toBe(2);
    expect((await budgetMail())[0]!.subject).toMatch(/over budget/);
  });

  it("a profile in the trash: its budget is hidden from everyone, spends nothing and doesn't count — until it's restored", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1000 });
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p2 });
    await insertTxn("adm", { type: "expense", amountMinor: 1000, occurredOn: DAY1, profileId: f.p1 });

    await deleteProfile(uid("adm"), f.p2, { transactions: "delete" });
    // Hidden from the admin too; the workspace total drops Kids' spending.
    const list = await listBudgets(uid("adm"), f.W, MONTH);
    expect(list.map((b) => [b.label, b.spentMinor])).toEqual([["Whole workspace", 1000]]);
    expect(await updateBudget(uid("adm"), f.W, id, { amount: 5 })).toBe(false);
    expect(await deleteBudget(uid("adm"), f.W, id)).toBe(false);
    // It doesn't take a place in the plan while hidden.
    expect(await countBudgets(f.W)).toBe(1);
    expect((await getAddLimits(f.W, uid("adm"))).budgets.used).toBe(1);
    // …but the row is kept for when the profile comes back.
    expect(await db().select().from(budgets).where(eq(budgets.id, id))).toHaveLength(1);
    expect(await budgetMail()).toEqual([]);

    const restored = await restoreFromTrash(uid("adm"), f.W, { profileIds: [f.p2] });
    expect(restored.counts.profiles).toBe(1);
    const back = await listBudgets(uid("adm"), f.W, MONTH);
    expect(back.map((b) => [b.label, b.spentMinor, b.status])).toEqual([
      ["Whole workspace", 10000, "ok"],
      ["Kids", 9000, "warn"],
    ]);
    // The restore re-checked: Kids' 80% is news.
    expect((await budgetMail())[0]!.subject).toMatch(/^Kids: 90%/);
  });

  it("a trashed profile isn't one of the 'covered' profiles: a member who reads every live one sees the workspace budget", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 1000 });
    // `vw` reads Personal only; Kids is in another space.
    const [s2] = await db()
      .insert(spaces)
      .values({ workspaceId: f.W, name: "Family", position: 1 })
      .returning();
    await db().update(profiles).set({ spaceId: s2!.id }).where(eq(profiles.id, f.p2));
    await registerUser("vw");
    await db().insert(workspaceMembers).values({ workspaceId: f.W, userId: uid("vw"), role: "viewer" });
    await db().insert(spaceMembers).values({ spaceId: f.s1, userId: uid("vw"), role: "viewer" });
    expect(await listBudgets(uid("vw"), f.W, MONTH)).toEqual([]);

    await deleteProfile(uid("adm"), f.p2, { transactions: "delete" });
    expect((await listBudgets(uid("vw"), f.W, MONTH)).map((b) => b.label)).toEqual(["Whole workspace"]);
  });
});
