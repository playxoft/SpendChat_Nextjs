import { describe, it, expect, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  budgetAlertEmails,
  budgetAlerts,
  budgets,
  emailSendLog,
  profiles,
  spaceMembers,
  workspaceMembers,
} from "@/db/schema";
import {
  addBulkTransactions,
  addTransaction,
  updateTransaction,
  updateTransactions,
} from "@/actions/transactions";
import { POST as postTxn } from "@/app/api/v1/transactions/route";
import { PATCH as patchTxn } from "@/app/api/v1/transactions/[id]/route";
import { POST as postBulk } from "@/app/api/v1/transactions/bulk/route";
import { utcMonthKey } from "@/lib/budgets";
import { settleDeferred } from "@/lib/defer";
import { sendEmail } from "@/lib/email";
import {
  BUDGET_ALERT_EMAILS_PER_MONTH,
  EMAIL_SENDS_PER_HOUR,
  reserveBudgetAlertEmails,
} from "@/lib/email-quota";
import { checkBudgetAlerts, scheduleBudgetCheck } from "@/services/budget-alerts";
import { createBudget, deleteBudget, updateBudget } from "@/services/budgets";
import { deleteProfile, moveProfileTransactions } from "@/services/profiles";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  categoryId,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  workspaceIdOf,
} from "./helpers/seed";
import { apiReq, ctx, jsonBody } from "./api/helpers";

// The pool is real; wrapping it lets one test make a reservation fail.
vi.mock("@/lib/email-quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email-quota")>();
  return { ...actual, reserveBudgetAlertEmails: vi.fn(actual.reserveBudgetAlertEmails) };
});

/**
 * Budget alerts: once per budget × threshold × month, after the response, to
 * the workspace's admins and the budget's creator — and every write path that
 * can raise spending triggers the check. `sendEmail` is the suite's spy; the
 * deferred check runs when `settleDeferred()` drains the queue (outside a
 * request, `after()` can't).
 */

const db = () => getTestDb();
const MONTH = utcMonthKey();
const DAY1 = `${MONTH}-01`;

function monthsBack(n: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15)).toISOString().slice(0, 10);
}

/** Every budget email sent so far: who, and the subject. */
async function budgetMail() {
  await settleDeferred();
  return vi
    .mocked(sendEmail)
    .mock.calls.map(([m]) => m)
    .filter((m) => /budget/i.test(m.subject))
    .map((m) => ({ to: m.to, subject: m.subject, text: m.text ?? "" }));
}

async function claims() {
  return (await db().select().from(budgetAlerts)).map((a) => a.threshold).sort((x, y) => x - y);
}

/**
 * `adm` owns the workspace (admin); `ed` edits space 1 (Personal) and sets a
 * budget there; `ad2` is a second admin. Kids sits in a second space.
 */
async function build() {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const s1 = await defaultSpaceIdOf(W);
  const p1 = await firstProfileId("adm");
  const [kids] = await db()
    .insert(profiles)
    .values({ userId: uid("adm"), workspaceId: W, spaceId: s1, name: "Kids", sortOrder: 1 })
    .returning({ id: profiles.id });
  for (const alias of ["ed", "ad2"]) await registerUser(alias);
  await db().insert(workspaceMembers).values([
    { workspaceId: W, userId: uid("ed"), role: "editor" },
    { workspaceId: W, userId: uid("ad2"), role: "admin" },
  ]);
  await db().insert(spaceMembers).values({ spaceId: s1, userId: uid("ed"), role: "editor" });
  vi.mocked(sendEmail).mockClear(); // the welcome email
  return { W, s1, p1, p2: kids!.id, groceries: await categoryId("adm", "Groceries", "expense") };
}

describe("checkBudgetAlerts — once per budget × threshold × month", () => {
  it("80% emails the admins and the creator once; 100% later emails again", async () => {
    const f = await build();
    await createBudget(uid("ed"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });

    await insertTxn("ed", { type: "expense", amountMinor: 8000, occurredOn: DAY1, profileId: f.p1 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("ed"), months: [MONTH] })).toEqual({
      claimed: 1,
      emailed: 3,
    });
    const first = await budgetMail();
    expect(first.map((m) => m.to).sort()).toEqual(["ad2@example.com", "adm@example.com", "ed@example.com"]);
    expect(first[0]!.subject).toMatch(/^Personal: 80% of the .+ budget used$/);
    expect(first.find((m) => m.to === "ed@example.com")!.text).toContain("you set this budget");
    expect(first.find((m) => m.to === "adm@example.com")!.text).toContain("you're an admin");

    // More spending under 100%: nothing new to say.
    await insertTxn("ed", { type: "expense", amountMinor: 1000, occurredOn: DAY1, profileId: f.p1 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("ed"), months: [MONTH] })).toEqual({
      claimed: 0,
      emailed: 0,
    });

    await insertTxn("ed", { type: "expense", amountMinor: 1500, occurredOn: DAY1, profileId: f.p1 });
    await checkBudgetAlerts({ workspaceId: f.W, userId: uid("ed"), months: [MONTH] });
    const all = await budgetMail();
    expect(all).toHaveLength(6);
    expect(all[3]!.subject).toMatch(/^Personal is over budget for /);
    expect(await claims()).toEqual([80, 100]);
  });

  it("jumping from 50% to 120% claims both thresholds and sends one email about 100%", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 5000, occurredOn: DAY1 });
    await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    await insertTxn("adm", { type: "expense", amountMinor: 7000, occurredOn: DAY1 });
    const result = await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    expect(result.claimed).toBe(2);
    expect(await claims()).toEqual([80, 100]);
    const mail = await budgetMail();
    // Two admins, one email each, both about going over.
    expect(mail).toHaveLength(2);
    for (const m of mail) expect(m.subject).toMatch(/over budget/);
  });

  it("several budgets crossed at once become one digest per person", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await createBudget(uid("adm"), f.W, { scope: "category", categoryId: f.groceries, amount: 50 });
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, categoryId: f.groceries });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 3,
      emailed: 2,
    });
    const mail = await budgetMail();
    expect(mail[0]!.subject).toMatch(/^2 budgets in .+ need a look$/);
  });

  it("a new month alerts afresh — the month is part of the key", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    const old = monthsBack(2);
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: old });
    await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    expect((await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [old.slice(0, 7)] })).claimed).toBe(1);
    expect(await claims()).toEqual([80, 80]);
  });

  it("racing checks claim each crossing once", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 8500, occurredOn: DAY1 });
    const run = () => checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    const results = await Promise.all([run(), run(), run()]);
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(1);
    expect(await budgetMail()).toHaveLength(2);
  });

  it("email alerts off: claimed, not emailed", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100, emailAlerts: false });
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 1,
      emailed: 0,
    });
    expect(await budgetMail()).toEqual([]);
  });

  it("a creator who can no longer see the budget isn't emailed; the admins still are", async () => {
    const f = await build();
    await createBudget(uid("ed"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });
    await db().delete(spaceMembers).where(eq(spaceMembers.userId, uid("ed")));
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    expect((await budgetMail()).map((m) => m.to).sort()).toEqual(["ad2@example.com", "adm@example.com"]);
  });

  it("alerts use the workspace's own pool — a writer whose hourly email allowance is spent still triggers them", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await db()
      .insert(emailSendLog)
      .values(Array.from({ length: EMAIL_SENDS_PER_HOUR }, () => ({ userId: uid("ed"), kind: "member_invite" })));
    await insertTxn("ed", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("ed"), months: [MONTH] })).toEqual({
      claimed: 1,
      emailed: 2,
    });
    // Nothing taken from the writer; two from the workspace's pool.
    expect(await db().select().from(emailSendLog).where(eq(emailSendLog.kind, "budget_alert"))).toEqual([]);
    expect(await db().select().from(budgetAlertEmails).where(eq(budgetAlertEmails.workspaceId, f.W))).toHaveLength(2);
  });

  it("the workspace's monthly cap: past it the emails wait (claims stay unsent), and go when there's room", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    // One place left; this check needs two (two admins).
    await db()
      .insert(budgetAlertEmails)
      .values(Array.from({ length: BUDGET_ALERT_EMAILS_PER_MONTH - 1 }, () => ({ workspaceId: f.W })));
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 1,
      emailed: 0,
    });
    expect(await budgetMail()).toEqual([]);
    expect(await db().select().from(budgetAlerts).where(isNull(budgetAlerts.notifiedAt))).toHaveLength(1);
    // All or nothing: the one free place wasn't half-used.
    expect(await db().select().from(budgetAlertEmails)).toHaveLength(BUDGET_ALERT_EMAILS_PER_MONTH - 1);

    // A new month's pool (rows from before the 1st don't count): the waiting alert goes out.
    await db().update(budgetAlertEmails).set({ createdAt: new Date(Date.UTC(2000, 0, 1)) });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 0,
      emailed: 2,
    });
    expect(await db().select().from(budgetAlerts).where(isNull(budgetAlerts.notifiedAt))).toEqual([]);
  });

  it("a reservation that fails (lock or connection) loses nothing — the next check sends it", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    vi.mocked(reserveBudgetAlertEmails).mockRejectedValueOnce(new Error("lock wait aborted"));
    await expect(checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).rejects.toThrow(
      "lock wait aborted",
    );
    // Rolled back: still claimed, still unsent, nothing reserved.
    expect(await db().select().from(budgetAlerts).where(isNull(budgetAlerts.notifiedAt))).toHaveLength(1);
    expect(await db().select().from(budgetAlertEmails)).toEqual([]);
    expect(await budgetMail()).toEqual([]);

    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 0,
      emailed: 2,
    });
  });

  it("the pool blocks rather than fails: a waiting reservation goes through once the first commits", async () => {
    const f = await build();
    const tx = (fn: (t: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]) => Promise<boolean>) =>
      db().transaction(fn);
    const results = await Promise.all([
      tx((t) => reserveBudgetAlertEmails(t, f.W, 10)),
      tx((t) => reserveBudgetAlertEmails(t, f.W, 10)),
      tx((t) => reserveBudgetAlertEmails(t, f.W, BUDGET_ALERT_EMAILS_PER_MONTH)),
    ]);
    expect(results).toEqual([true, true, false]);
    expect(await db().select().from(budgetAlertEmails)).toHaveLength(20);
    expect(await tx((t) => reserveBudgetAlertEmails(t, f.W, 0))).toBe(true);
  });

  it("does nothing for a workspace without budgets, or with nothing to say", async () => {
    const f = await build();
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 0,
      emailed: 0,
    });
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [] })).toEqual({
      claimed: 0,
      emailed: 0,
    });
    expect(await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] })).toEqual({
      claimed: 0,
      emailed: 0,
    });
  });
});

describe("re-arming — no loop can re-send an alert", () => {
  const unsent = async () =>
    (await db().select().from(budgetAlerts).where(isNull(budgetAlerts.notifiedAt))).length;

  it("raising and lowering the amount, and re-saving spending, re-sends nothing", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 8500, occurredOn: DAY1 });
    const check = () => checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    await check();
    expect(await budgetMail()).toHaveLength(2);

    // Down (now over 100% of 50 — a new threshold, so 100% fires once)…
    await updateBudget(uid("adm"), f.W, id, { amount: 50 });
    await check();
    expect(await budgetMail()).toHaveLength(4);
    // …then up and down between amounts it already fired at, checking each
    // time as a re-saved expense would: nothing new.
    for (const amount of [100, 50, 100, 50, 100, 50]) {
      await updateBudget(uid("adm"), f.W, id, { amount });
      await check();
    }
    expect(await budgetMail()).toHaveLength(4);
    expect(await unsent()).toBe(0);

    // Above the amount 100% last fired at (50), and still over: that's news, once.
    await updateBudget(uid("adm"), f.W, id, { amount: 60 });
    await check();
    await check();
    expect(await budgetMail()).toHaveLength(6);
  });

  it("a higher amount than the one it fired at fires again — once — when spending catches up", async () => {
    const f = await build();
    const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    await insertTxn("adm", { type: "expense", amountMinor: 8500, occurredOn: DAY1 });
    const check = () => checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    await check();
    await updateBudget(uid("adm"), f.W, id, { amount: 200 });
    // 85 of 200: under 80% of the new amount — nothing yet.
    expect((await check()).claimed).toBe(0);
    await insertTxn("adm", { type: "expense", amountMinor: 8000, occurredOn: DAY1 });
    // 165 of 200: 80% of a higher amount than it fired at.
    expect(await check()).toEqual({ claimed: 1, emailed: 2 });
    const [row] = await db()
      .select()
      .from(budgetAlerts)
      .where(and(eq(budgetAlerts.budgetId, id), eq(budgetAlerts.threshold, 80)));
    expect(row!.amountMinor).toBe(20000);
    expect(await check()).toEqual({ claimed: 0, emailed: 0 });
    expect(await budgetMail()).toHaveLength(4);
  });

  it("deleting and re-creating a budget is held to the workspace's monthly pool", async () => {
    const f = await build();
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    for (let i = 0; i < BUDGET_ALERT_EMAILS_PER_MONTH; i++) {
      const { id } = await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
      await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
      await deleteBudget(uid("adm"), f.W, id);
    }
    // Two admins: the pool of 30 ran out after 15 loops; nothing past it.
    expect(await budgetMail()).toHaveLength(BUDGET_ALERT_EMAILS_PER_MONTH);
    expect(await db().select().from(budgetAlertEmails)).toHaveLength(BUDGET_ALERT_EMAILS_PER_MONTH);
    expect(await db().select().from(budgets).where(eq(budgets.workspaceId, f.W))).toEqual([]);
  });

  it("a creator who can only read the budget no longer gets its emails", async () => {
    const f = await build();
    await createBudget(uid("ed"), f.W, { scope: "profile", profileId: f.p1, amount: 100 });
    // Still sees Personal, can't change it any more.
    await db().update(spaceMembers).set({ role: "viewer" }).where(eq(spaceMembers.userId, uid("ed")));
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    await checkBudgetAlerts({ workspaceId: f.W, userId: uid("adm"), months: [MONTH] });
    expect((await budgetMail()).map((m) => m.to).sort()).toEqual(["ad2@example.com", "adm@example.com"]);
  });
});

describe("scheduleBudgetCheck — only months that are current somewhere", () => {
  it("ignores backdated writes and runs nothing until the response is done", async () => {
    const f = await build();
    await createBudget(uid("adm"), f.W, { scope: "workspace", amount: 100 });
    const old = monthsBack(2);
    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: old });
    scheduleBudgetCheck({ workspaceId: f.W, userId: uid("adm"), dates: [old] });
    scheduleBudgetCheck({ workspaceId: f.W, userId: uid("adm"), dates: [] });
    expect(await budgetMail()).toEqual([]);

    await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1 });
    scheduleBudgetCheck({ workspaceId: f.W, userId: uid("adm"), dates: [old, DAY1, DAY1] });
    // Deferred: nothing has been claimed until the queue runs.
    expect(await db().select().from(budgetAlerts)).toEqual([]);
    expect(await budgetMail()).toHaveLength(2);
  });
});

describe("every write path that can raise spending triggers the check", () => {
  async function setup() {
    const f = await build();
    signInAs("adm");
    // Kids has its own budget; Personal holds the rows that move.
    await createBudget(uid("adm"), f.W, { scope: "profile", profileId: f.p2, amount: 100 });
    return f;
  }
  const subjects = async () => (await budgetMail()).map((m) => m.subject);

  it("addTransaction (the composer)", async () => {
    const f = await setup();
    const res = await addTransaction({ type: "expense", amount: 85, occurredOn: DAY1, profileId: f.p2 });
    expect(res.ok).toBe(true);
    expect(await subjects()).toHaveLength(2);
  });

  it("an income entry doesn't", async () => {
    const f = await setup();
    await addTransaction({ type: "income", amount: 500, occurredOn: DAY1, profileId: f.p2 });
    expect(await subjects()).toEqual([]);
  });

  it("updateTransaction (moving an expense into the budgeted profile)", async () => {
    const f = await setup();
    const id = await insertTxn("adm", { type: "expense", amountMinor: 9000, occurredOn: DAY1, profileId: f.p1 });
    const res = await updateTransaction({ id, type: "expense", amount: 90, occurredOn: DAY1, profileId: f.p2 });
    expect(res.ok).toBe(true);
    expect(await subjects()).toHaveLength(2);
  });

  it("updateTransactions (bulk move)", async () => {
    const f = await setup();
    const ids = [
      await insertTxn("adm", { type: "expense", amountMinor: 5000, occurredOn: DAY1, profileId: f.p1 }),
      await insertTxn("adm", { type: "expense", amountMinor: 5000, occurredOn: DAY1, profileId: f.p1 }),
    ];
    const res = await updateTransactions({ ids, profileId: f.p2 });
    expect(res.ok).toBe(true);
    expect((await subjects())[0]).toMatch(/over budget/);
  });

  it("addBulkTransactions (bulk add, CSV import, the AI's confirmed drafts)", async () => {
    const f = await setup();
    const res = await addBulkTransactions([
      { type: "expense", amount: 50, note: "", categoryName: null, occurredOn: DAY1, profileId: f.p2 },
      { type: "expense", amount: 40, note: "", categoryName: null, occurredOn: DAY1, profileId: f.p2 },
    ]);
    expect(res.ok).toBe(true);
    expect(await subjects()).toHaveLength(2);
  });

  it("POST /api/v1/transactions", async () => {
    const f = await setup();
    const res = await postTxn(
      apiReq("/api/v1/transactions", {
        method: "POST",
        body: jsonBody({ type: "expense", amount: 85, occurredOn: DAY1, profileId: f.p2 }),
      }),
    );
    expect(res.status).toBe(201);
    expect(await subjects()).toHaveLength(2);
  });

  it("PATCH /api/v1/transactions/{id}", async () => {
    const f = await setup();
    const id = await insertTxn("adm", { type: "expense", amountMinor: 1000, occurredOn: DAY1, profileId: f.p2 });
    const res = await patchTxn(
      apiReq(`/api/v1/transactions/${id}`, {
        method: "PATCH",
        body: jsonBody({ type: "expense", amount: 95, occurredOn: DAY1, profileId: f.p2 }),
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(200);
    expect(await subjects()).toHaveLength(2);
  });

  it("POST /api/v1/transactions/bulk", async () => {
    const f = await setup();
    const res = await postBulk(
      apiReq("/api/v1/transactions/bulk", {
        method: "POST",
        body: jsonBody({
          items: [
            { type: "expense", amount: 60, occurredOn: DAY1, profileId: f.p2 },
            { type: "expense", amount: 60, occurredOn: DAY1, profileId: f.p2 },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await subjects())[0]).toMatch(/over budget/);
  });

  it("moving a profile's transactions, alone or as part of deleting it", async () => {
    const f = await setup();
    await insertTxn("adm", { type: "expense", amountMinor: 8000, occurredOn: DAY1, profileId: f.p1 });
    await moveProfileTransactions(uid("adm"), f.p1, f.p2);
    expect(await subjects()).toHaveLength(2);

    // Deleting a profile and moving its transactions into Kids does the same.
    const [extra] = await db()
      .insert(profiles)
      .values({ userId: uid("adm"), workspaceId: f.W, spaceId: f.s1, name: "Extra", sortOrder: 2 })
      .returning({ id: profiles.id });
    await insertTxn("adm", { type: "expense", amountMinor: 3000, occurredOn: DAY1, profileId: extra!.id });
    vi.mocked(sendEmail).mockClear();
    await deleteProfile(uid("adm"), extra!.id, { transactions: "move", toProfileId: f.p2 });
    expect((await subjects())[0]).toMatch(/over budget/);
  });
});
