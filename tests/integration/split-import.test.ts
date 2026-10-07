import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { splitExpenses, splitGroups, splitMembers, splitRateLog, splitShares, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { computeLedger, importOrder, buildImportInput, type DraftExpense, type SplitDraft } from "@/lib/tools/split-bill";
import { importSplitDraft } from "@/actions/split-import";
import * as actions from "@/actions/split";
import * as split from "@/services/split";
import * as ledger from "@/services/split-ledger";
import { SPLIT_GROUPS_PER_DAY, SPLIT_PENDING_PER_INVITEE } from "@/services/split-rate";
import { setSession, signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser } from "./helpers/seed";

/**
 * The free split calculator's hand-off: a draft built in the browser, by name
 * only, becomes a real group through `importSplitDraft` — with the creator,
 * caps, invitations and share maths of a group built in the app.
 */

const db = () => getTestDb();
const TODAY = "2026-10-01";

function ok<T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(`action failed: ${(res as unknown as { error: string }).error}`);
  return res as Extract<T, { ok: true }>;
}

function expense(patch: Partial<DraftExpense> & Pick<DraftExpense, "id">): DraftExpense {
  return {
    title: "Dinner",
    amountMinor: 100_000,
    paidBy: "p0001",
    on: TODAY,
    split: { type: "equal", ids: ["p0001", "p0002", "p0003"] },
    ...patch,
  };
}

/** A trip with one expense of each kind and a leftover paisa or two to place. */
function tripDraft(): SplitDraft {
  return {
    v: 1,
    name: "Goa trip",
    currency: "INR",
    people: [
      { id: "p0001", name: "Me" },
      { id: "p0002", name: "Asha" },
      { id: "p0003", name: "Zoe" },
    ],
    expenses: [
      expense({ id: "e0001", title: "Cabin", amountMinor: 100_000 }),
      expense({
        id: "e0002",
        title: "Groceries",
        amountMinor: 9_001,
        paidBy: "p0002",
        split: { type: "exact", shares: [{ id: "p0001", minor: 4_000 }, { id: "p0002", minor: 5_001 }] },
      }),
      expense({
        id: "e0003",
        title: "Fuel",
        amountMinor: 1_001,
        paidBy: "p0003",
        split: {
          type: "percent",
          shares: [
            { id: "p0001", bp: 3_333 },
            { id: "p0002", bp: 3_333 },
            { id: "p0003", bp: 3_334 },
          ],
        },
      }),
    ],
  };
}

const EMAILS = { p0002: "asha@example.com", p0003: "zoe@example.com" };

/** "o" signs in (with an account) and imports `draft`; Asha has an account, Zoe doesn't. */
async function importAs(draft = tripDraft(), meId = "p0001", emails: Record<string, string> = EMAILS) {
  await bootstrapUser("o");
  await bootstrapUser("asha");
  signInAs("o");
  return importSplitDraft(buildImportInput({ draft, name: draft.name, meId, emails }));
}

async function groupCount(): Promise<number> {
  return (await db().select({ id: splitGroups.id }).from(splitGroups)).length;
}

describe("importing a group from the split calculator", () => {
  it("creates the group with the caller as creator, invites everyone, and stores every expense", async () => {
    const res = ok(await importAs());
    expect(res.expenses).toBe(3);

    const detail = await split.getGroupDetail(uid("o"), res.groupId);
    expect(detail.group).toMatchObject({ name: "Goa trip", currency: "INR", icon: null });
    expect(detail.me.isCreator).toBe(true);
    expect(detail.peopleCount).toBe(3);
    // The creator goes by their account name; the others by the names typed in the tool.
    expect(detail.members.map((m) => [m.name, m.status, m.email])).toEqual([
      ["o", "joined", "o@example.com"],
      ["Asha", "invited", "asha@example.com"],
      ["Zoe", "invited", "zoe@example.com"],
    ]);

    // One invite email — Zoe has no account; Asha gets an in-app invitation
    // instead. (Sign-up's welcome emails are the other calls.)
    const invites = vi.mocked(sendEmail).mock.calls.map(([m]) => m).filter((m) => m.subject.includes("Goa trip"));
    expect(invites.map((m) => m.to)).toEqual(["zoe@example.com"]);
    const { items } = await split.listInvitations({ id: uid("asha"), email: "asha@example.com" });
    expect(items.map((i) => i.groupId)).toEqual([res.groupId]);

    const { items: expenses } = await ledger.listExpenses(uid("o"), res.groupId, { limit: 50, offset: 0 });
    expect(expenses.map((e) => [e.title, e.amountMinor, e.splitType]).sort()).toEqual(
      [
        ["Cabin", 100_000, "equal"],
        ["Fuel", 1_001, "percent"],
        ["Groceries", 9_001, "exact"],
      ].sort(),
    );
  });

  it("stores exactly the balances the calculator showed", async () => {
    const draft = tripDraft();
    const res = ok(await importAs(draft));
    const detail = await split.getGroupDetail(uid("o"), res.groupId);
    const preview = computeLedger(draft, importOrder(draft, "p0001"));

    const byName = (name: string) => detail.members.find((m) => m.name === name)!.netMinor;
    expect([byName("o"), byName("Asha"), byName("Zoe")]).toEqual(preview.balances.map((b) => b.netMinor));
    expect(detail.suggestions.map((s) => s.amountMinor)).toEqual(preview.payments.map((p) => p.amountMinor));

    // And every expense's shares add up to it, leftover paise included.
    const shares = await db().select().from(splitShares);
    const expenses = await db().select().from(splitExpenses).where(eq(splitExpenses.groupId, res.groupId));
    for (const e of expenses) {
      expect(shares.filter((s) => s.expenseId === e.id).reduce((a, s) => a + s.amountMinor, 0)).toBe(e.amountMinor);
    }
    const fuel = expenses.find((e) => e.title === "Fuel")!;
    expect(shares.filter((s) => s.expenseId === fuel.id).map((s) => s.percentBp).sort()).toEqual([3_333, 3_333, 3_334]);
  });

  it("lets you be anyone in the draft — that person becomes the creator", async () => {
    const draft = tripDraft();
    const res = ok(await importAs(draft, "p0002", { p0001: "me@example.com", p0003: "zoe@example.com" }));
    const detail = await split.getGroupDetail(uid("o"), res.groupId);
    expect(detail.members.map((m) => m.name)).toEqual(["o", "Me", "Zoe"]);
    const preview = computeLedger(draft, importOrder(draft, "p0002"));
    // "o" stands where Asha (p0002) was in the draft.
    const net = Object.fromEntries(detail.members.map((m) => [m.name, m.netMinor]));
    const previewNet = Object.fromEntries(preview.balances.map((b) => [b.id, b.netMinor]));
    expect([net.o, net.Me, net.Zoe]).toEqual([previewNet.p0002, previewNet.p0001, previewNet.p0003]);
  });

  it("the group stays invisible to the people invited until they join, then shows them the same balances", async () => {
    const res = ok(await importAs());
    await expect(split.getGroupDetail(uid("asha"), res.groupId)).rejects.toMatchObject({ status: 404 });
    await bootstrapUser("eve");
    await expect(split.getGroupDetail(uid("eve"), res.groupId)).rejects.toMatchObject({ status: 404 });

    const [row] = await db().select().from(splitMembers).where(eq(splitMembers.email, "asha@example.com"));
    signInAs("asha");
    ok(await actions.acceptSplitInvitation(row!.id));
    const mine = await split.getGroupDetail(uid("asha"), res.groupId);
    const theirs = await split.getGroupDetail(uid("o"), res.groupId);
    expect(mine.me.isCreator).toBe(false);
    expect(mine.members.map((m) => m.netMinor)).toEqual(theirs.members.map((m) => m.netMinor));
  });

  it("needs a signed-in account", async () => {
    setSession(null);
    await expect(
      importSplitDraft(buildImportInput({ draft: tripDraft(), name: "x", meId: "p0001", emails: EMAILS })),
    ).rejects.toMatchObject({ url: "/sign-in" });
    expect(await groupCount()).toBe(0);
  });

  it("records the sign-up as converted by the tool — once, and only for a new account", async () => {
    ok(await importAs());
    const [fresh] = await db().select({ a: users.acquisition }).from(users).where(eq(users.id, uid("o")));
    expect(fresh!.a).toMatchObject({ convertedFrom: "tool:split", convertedAt: expect.any(String) });
    const first = fresh!.a!.convertedAt;

    ok(await importAs());
    const [again] = await db().select({ a: users.acquisition }).from(users).where(eq(users.id, uid("o")));
    expect(again!.a!.convertedAt).toBe(first);

    // A long-standing account trying the tool isn't a sign-up it brought in.
    await bootstrapUser("old");
    await db()
      .update(users)
      .set({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
      .where(eq(users.id, uid("old")));
    signInAs("old");
    ok(await importSplitDraft(buildImportInput({ draft: tripDraft(), name: "Old", meId: "p0001", emails: EMAILS })));
    const [old] = await db().select({ a: users.acquisition }).from(users).where(eq(users.id, uid("old")));
    expect(old!.a?.convertedFrom ?? null).toBeNull();
  });
});

describe("the import keeps the app's caps and is all-or-nothing", () => {
  it(`holds up to ${SPLIT_GROUP_MAX_PEOPLE} people, you included — and refuses one more`, async () => {
    const people = Array.from({ length: SPLIT_GROUP_MAX_PEOPLE }, (_, i) => ({
      id: `p${String(i + 1).padStart(4, "0")}`,
      name: `P${i}`,
    }));
    const emails = Object.fromEntries(people.slice(1).map((p, i) => [p.id, `p${i}@example.com`]));
    const full: SplitDraft = { ...tripDraft(), people, expenses: [] };
    const res = ok(await importAs(full, "p0001", emails));
    expect((await split.getGroupDetail(uid("o"), res.groupId)).peopleCount).toBe(SPLIT_GROUP_MAX_PEOPLE);

    const tooMany = buildImportInput({ draft: full, name: "x", meId: "p0001", emails });
    tooMany.people.push({ ref: "p9999", name: "One more", email: "one-more@example.com" });
    const before = await groupCount();
    expect(await importSplitDraft(tooMany)).toMatchObject({ ok: false, code: "validation_error" });
    expect(await groupCount()).toBe(before);
  });

  it("keeps the open-invitations-per-inbox cap, and writes nothing when it bites", async () => {
    await bootstrapUser("o");
    signInAs("o");
    for (let i = 0; i < SPLIT_PENDING_PER_INVITEE; i++) {
      ok(await actions.createSplitGroup({ name: `G${i}`, currency: "INR", members: [{ email: "zoe@example.com", name: "Zoe" }] }));
    }
    const groups = await groupCount();
    const expensesBefore = (await db().select().from(splitExpenses)).length;
    const res = await importAs();
    expect(res).toMatchObject({ ok: false, code: "conflict", details: { emails: ["zoe@example.com"] } });
    expect(await groupCount()).toBe(groups);
    expect((await db().select().from(splitExpenses)).length).toBe(expensesBefore);
  });

  it("refuses to invite yourself", async () => {
    const res = await importAs(tripDraft(), "p0001", { p0002: "asha@example.com", p0003: "o@example.com" });
    expect(res).toMatchObject({ ok: false, code: "bad_request" });
    expect(await groupCount()).toBe(0);
  });

  it(`counts toward the ${SPLIT_GROUPS_PER_DAY}-groups-a-day cap, like New group`, async () => {
    await bootstrapUser("o");
    await db()
      .insert(splitRateLog)
      .values(Array.from({ length: SPLIT_GROUPS_PER_DAY }, () => ({ actorId: uid("o"), event: "group_created" })));
    expect(await importAs()).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await groupCount()).toBe(0);
  });

  it("refuses an expense that doesn't add up — and leaves no half-made group behind", async () => {
    const draft = tripDraft();
    const input = buildImportInput({ draft, name: draft.name, meId: "p0001", emails: EMAILS });
    const bad = input.expenses[1]!;
    if (bad.splitType !== "exact") throw new Error("fixture changed");
    bad.shares[0]!.amount = 1; // no longer sums to the total
    await bootstrapUser("o");
    signInAs("o");
    expect(await importSplitDraft(input)).toMatchObject({ ok: false, code: "validation_error" });
    expect(await groupCount()).toBe(0);
    expect((await db().select().from(splitMembers)).length).toBe(0);
    // The day's group allowance wasn't spent either.
    expect((await db().select().from(splitRateLog)).length).toBe(0);
  });

  it("refuses an expense naming someone who isn't in the import", async () => {
    const draft = tripDraft();
    const input = buildImportInput({ draft, name: draft.name, meId: "p0001", emails: EMAILS });
    input.expenses[0]!.paidBy = "p0042";
    await bootstrapUser("o");
    signInAs("o");
    expect(await importSplitDraft(input)).toMatchObject({ ok: false, code: "validation_error" });
    expect(await groupCount()).toBe(0);
  });

  it("holds an imported expense to the app's own rules (title length here)", async () => {
    const draft = tripDraft();
    const input = buildImportInput({ draft, name: draft.name, meId: "p0001", emails: EMAILS });
    input.expenses[0]!.title = "x".repeat(200);
    await bootstrapUser("o");
    signInAs("o");
    expect(await importSplitDraft(input)).toMatchObject({ ok: false, code: "validation_error" });
    expect(await groupCount()).toBe(0);
  });
});
