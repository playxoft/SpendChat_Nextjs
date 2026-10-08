import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { splitGroups, splitMembers, splitShares } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { feedCursor } from "@/lib/split-display";
import * as actions from "@/actions/split";
import * as split from "@/services/split";
import * as ledger from "@/services/split-ledger";
import { deleteAccount } from "@/services/settings";
import { signInAs, uid } from "./helpers/session";
import { captureSql, getTestDb } from "./helpers/test-db";
import { bootstrapUser, registerUser } from "./helpers/seed";

const db = () => getTestDb();
const me = (alias: string) => ({ id: uid(alias), email: `${alias}@example.com` });

/** Unwrap an action result, failing the test with its message when it isn't ok. */
function ok<T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(`action failed: ${(res as unknown as { error: string }).error}`);
  return res as Extract<T, { ok: true }>;
}

/** Owner "o" creates a group; returns its id. */
async function newGroup(
  owner = "o",
  people: { email: string; name: string }[] = [],
  currency = "INR",
): Promise<string> {
  await bootstrapUser(owner);
  signInAs(owner);
  return ok(await actions.createSplitGroup({ name: "Goa trip", currency, members: people })).id;
}

/** Add `alias` (with an account) to the group and have them join. Returns their member id. */
async function joinAs(groupId: string, alias: string, owner = "o"): Promise<string> {
  await bootstrapUser(alias);
  signInAs(owner);
  const { added } = ok(
    await actions.addSplitMembers(groupId, { members: [{ email: `${alias}@example.com`, name: alias.toUpperCase() }] }),
  );
  signInAs(alias);
  ok(await actions.acceptSplitInvitation(added[0]!.memberId));
  return added[0]!.memberId;
}

async function memberIdOf(groupId: string, alias: string): Promise<string> {
  const [row] = await db()
    .select({ id: splitMembers.id })
    .from(splitMembers)
    .where(eq(splitMembers.email, `${alias}@example.com`));
  expect(row).toBeDefined();
  void groupId;
  return row!.id;
}

const today = "2026-10-01";

describe("split groups", () => {
  it("creates a group with its creator as a joined member", async () => {
    const id = await newGroup();
    const detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.group).toMatchObject({ name: "Goa trip", currency: "INR" });
    expect(detail.me.isCreator).toBe(true);
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0]).toMatchObject({ name: "o", status: "joined", isYou: true, isCreator: true });
    expect(detail.peopleCount).toBe(1);
    expect(detail.maxPeople).toBe(SPLIT_GROUP_MAX_PEOPLE);

    const groups = await split.listGroups(uid("o"));
    expect(groups).toEqual([expect.objectContaining({ id, isCreator: true, peopleCount: 1, myNetMinor: 0 })]);
  });

  it("an account holder gets an in-app invitation and no email; they can join", async () => {
    const id = await newGroup();
    await bootstrapUser("asha");
    vi.mocked(sendEmail).mockClear();
    signInAs("o");
    const res = ok(await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] }));
    expect(res.added).toEqual([{ memberId: expect.any(String), email: "asha@example.com", status: "invited" }]);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();

    // Not a member yet: the group is invisible, only the invitation shows.
    await expect(split.getGroupDetail(uid("asha"), id)).rejects.toMatchObject({ status: 404 });
    const { items: invitations, total } = await split.listInvitations(me("asha"));
    expect(total).toBe(1);
    expect(invitations).toEqual([
      expect.objectContaining({ groupId: id, groupName: "Goa trip", inviterName: "o", peopleCount: 2 }),
    ]);
    expect(await split.countInvitations(me("asha"))).toBe(1);

    signInAs("asha");
    expect(ok(await actions.acceptSplitInvitation(invitations[0]!.memberId)).groupId).toBe(id);
    expect(await split.countInvitations(me("asha"))).toBe(0);
    const detail = await split.getGroupDetail(uid("asha"), id);
    expect(detail.me.isCreator).toBe(false);

    // Accepting twice matches nothing.
    const again = await actions.acceptSplitInvitation(invitations[0]!.memberId);
    expect(again).toMatchObject({ ok: false, code: "not_found" });
  });

  it("someone without an account sees the invitation once they sign up", async () => {
    const id = await newGroup("o", [{ email: "zoe@example.com", name: "Zoe" }]);
    const [row] = await db().select().from(splitMembers).where(eq(splitMembers.email, "zoe@example.com"));
    expect(row).toMatchObject({ userId: null, status: "invited" });
    expect(row!.inviteToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    await registerUser("zoe");
    const { items: invitations } = await split.listInvitations(me("zoe"));
    expect(invitations.map((i) => i.groupId)).toEqual([id]);
    await split.acceptInvitation(me("zoe"), invitations[0]!.memberId);
    const [joined] = await db().select().from(splitMembers).where(eq(splitMembers.id, row!.id));
    expect(joined).toMatchObject({ userId: uid("zoe"), status: "joined", inviteToken: null });
  });

  it("someone else can't accept or decline your invitation", async () => {
    const id = await newGroup("o", [{ email: "zoe@example.com", name: "Zoe" }]);
    const memberId = await memberIdOf(id, "zoe");
    await bootstrapUser("eve");
    await expect(split.acceptInvitation(me("eve"), memberId)).rejects.toMatchObject({ status: 404 });
    await expect(split.declineInvitation(me("eve"), memberId)).rejects.toMatchObject({ status: 404 });
    await expect(split.acceptInvitation(me("eve"), "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    // Without a verified email only the account arm applies.
    await expect(split.acceptInvitation({ id: uid("eve"), email: null }, memberId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("declining leaves the group alone and the invitation goes away", async () => {
    const id = await newGroup();
    await bootstrapUser("asha");
    signInAs("o");
    const { added } = ok(await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] }));
    signInAs("asha");
    ok(await actions.declineSplitInvitation(added[0]!.memberId));
    expect(await split.listInvitations(me("asha"))).toEqual({ items: [], total: 0 });
    const [row] = await db().select().from(splitMembers).where(eq(splitMembers.id, added[0]!.memberId));
    expect(row).toMatchObject({ status: "left", inviteToken: null });
    // Declining starts the 30-day "don't invite me back" window.
    expect(row!.inviteCooldownUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect((await split.getGroupDetail(uid("o"), id)).peopleCount).toBe(1);
  });

  it("is invisible (404) to strangers, and a malformed id is a 404 too", async () => {
    const id = await newGroup();
    await bootstrapUser("eve");
    await expect(split.getGroupDetail(uid("eve"), id)).rejects.toMatchObject({ status: 404 });
    await expect(ledger.listExpenses(uid("eve"), id, { limit: 10, offset: 0 })).rejects.toMatchObject({
      status: 404,
    });
    await expect(split.getGroupDetail(uid("o"), "nope")).rejects.toMatchObject({ status: 404 });
    signInAs("eve");
    expect(await actions.updateSplitGroup(id, { name: "Mine" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await actions.deleteSplitGroup(id)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("only the creator manages the group (403 for members)", async () => {
    const id = await newGroup();
    const ashaId = await joinAs(id, "asha");
    signInAs("asha");
    expect(await actions.updateSplitGroup(id, { name: "Mine" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await actions.deleteSplitGroup(id)).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await actions.addSplitMembers(id, { members: [{ email: "x@example.com", name: "X" }] }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    const creatorMember = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    expect(await actions.removeSplitMember(id, creatorMember)).toMatchObject({ ok: false, code: "forbidden" });
    void ashaId;
  });

  it("shows emails only to the creator and on your own row", async () => {
    const id = await newGroup("o", [{ email: "zoe@example.com", name: "Zoe" }]);
    await joinAs(id, "asha");
    const forCreator = await split.getGroupDetail(uid("o"), id);
    expect(forCreator.members.map((m) => m.email).sort()).toEqual(
      ["asha@example.com", "o@example.com", "zoe@example.com"],
    );
    expect(forCreator.members.find((m) => m.name === "Zoe")!.inviteToken).toMatch(/.{32}/);

    const forAsha = await split.getGroupDetail(uid("asha"), id);
    for (const m of forAsha.members) {
      expect(m.email).toBe(m.isYou ? "asha@example.com" : null);
      expect(m.inviteToken).toBeNull();
    }
    const invitations = await split.listInvitations(me("asha"));
    expect(JSON.stringify(invitations)).not.toContain("@");
  });

  it("D1: a group holds at most 50 people, creator included", async () => {
    const people = Array.from({ length: SPLIT_GROUP_MAX_PEOPLE - 1 }, (_, i) => ({
      email: `p${i}@example.com`,
      name: `P${i}`,
    }));
    const id = await newGroup("o", people);
    expect((await split.getGroupDetail(uid("o"), id)).peopleCount).toBe(SPLIT_GROUP_MAX_PEOPLE);

    signInAs("o");
    const full = await actions.addSplitMembers(id, { members: [{ email: "one-more@example.com", name: "One" }] });
    expect(full).toMatchObject({
      ok: false,
      code: "split_group_full",
      details: { max: SPLIT_GROUP_MAX_PEOPLE, used: SPLIT_GROUP_MAX_PEOPLE },
    });

    // Re-adding someone already in is not an add.
    const same = ok(await actions.addSplitMembers(id, { members: [{ email: "p0@example.com", name: "P0" }] }));
    expect(same.added[0]!.status).toBe("already");
  });

  it("D1: concurrent adds can't push a group past 50", async () => {
    const people = Array.from({ length: SPLIT_GROUP_MAX_PEOPLE - 3 }, (_, i) => ({
      email: `p${i}@example.com`,
      name: `P${i}`,
    }));
    const id = await newGroup("o", people); // 48 of 50
    const batch = (tag: string) =>
      split.addMembers(uid("o"), id, {
        members: [
          { email: `${tag}1@example.com`, name: `${tag}1` },
          { email: `${tag}2@example.com`, name: `${tag}2` },
        ],
      });
    // PGlite runs one transaction at a time, so these two can't truly
    // interleave here — this proves the count logic, not the locking. The
    // locking is checked on the SQL itself: the group row is taken
    // `FOR UPDATE` before anything is counted.
    let results: PromiseSettledResult<unknown>[] = [];
    const statements = await captureSql(async () => {
      results = await Promise.allSettled([batch("x"), batch("y")]);
    });
    const lockAt = statements.findIndex((q) => /from "split_groups".*for update/is.test(q.text));
    const countAt = statements.findIndex((q) => /select count\(\*\).*from "split_members"/is.test(q.text));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(countAt).toBeGreaterThan(lockAt);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "split_group_full" },
    });
    expect((await split.getGroupDetail(uid("o"), id)).peopleCount).toBe(SPLIT_GROUP_MAX_PEOPLE);
  });

  it("refuses adding yourself, and creating with yourself in the list", async () => {
    const id = await newGroup();
    signInAs("o");
    expect(await actions.addSplitMembers(id, { members: [{ email: "o@example.com", name: "Me" }] })).toMatchObject({
      ok: false,
      code: "bad_request",
    });
    expect(
      await actions.createSplitGroup({ name: "x", currency: "INR", members: [{ email: "o@example.com", name: "Me" }] }),
    ).toMatchObject({ ok: false, code: "bad_request" });
  });

  it("renames, re-icons, and changes currency only while empty", async () => {
    const id = await newGroup();
    signInAs("o");
    ok(await actions.updateSplitGroup(id, { name: "Flat", icon: "🏠", currency: "EUR" }));
    let detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.group).toMatchObject({ name: "Flat", icon: "🏠", currency: "EUR" });
    ok(await actions.updateSplitGroup(id, { icon: "" }));
    detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.group.icon).toBeNull();

    ok(
      await actions.createSplitExpense(id, {
        title: "Rent",
        amount: 100,
        paidBy: detail.me.memberId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [detail.me.memberId],
      }),
    );
    expect(await actions.updateSplitGroup(id, { currency: "USD" })).toMatchObject({ ok: false, code: "conflict" });
    ok(await actions.updateSplitGroup(id, { currency: "EUR", name: "Flat 2" })); // same currency is fine
  });
});

describe("split expenses, balances and settling up", () => {
  async function trio() {
    const id = await newGroup();
    const ashaId = await joinAs(id, "asha");
    const raviId = await joinAs(id, "ravi");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    return { id, ownerId, ashaId, raviId };
  }

  it("splits equally, computes balances and suggests who pays whom", async () => {
    const { id, ownerId, ashaId, raviId } = await trio();
    signInAs("o");
    const { id: expenseId } = ok(
      await actions.createSplitExpense(id, {
        title: "Dinner",
        amount: 100,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId, raviId],
      }),
    );
    const detail = await split.getGroupDetail(uid("o"), id);
    const net = Object.fromEntries(detail.members.map((m) => [m.id, m.netMinor]));
    // ₹100 three ways: the payer absorbs the extra paisa.
    expect(net).toEqual({ [ownerId]: 6666, [ashaId]: -3333, [raviId]: -3333 });
    expect(detail.suggestions).toHaveLength(2);
    expect(detail.suggestions.every((s) => s.toMemberId === ownerId && s.amountMinor === 3333)).toBe(true);
    expect(detail.hasActivity).toBe(true);

    const page = await ledger.listExpenses(uid("asha"), id, { limit: 10, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.currency).toBe("INR");
    expect(page.items[0]).toMatchObject({
      id: expenseId,
      title: "Dinner",
      amountMinor: 10_000,
      paidBy: { memberId: ownerId, name: "o" },
      canEdit: false,
      myShare: { amountMinor: 3333, added: false },
    });
    expect(page.items[0]!.shares.map((s) => s.amountMinor)).toEqual([3334, 3333, 3333]);

    const groups = await split.listGroups(uid("asha"));
    expect(groups[0]!.myNetMinor).toBe(-3333);
  });

  it("exact and percent splits are computed on the server; bad sums are refused", async () => {
    const { id, ownerId, ashaId } = await trio();
    signInAs("asha");
    const exact = await actions.createSplitExpense(id, {
      title: "Taxi",
      amount: 90,
      paidBy: ashaId,
      occurredOn: today,
      splitType: "exact",
      shares: [
        { memberId: ownerId, amount: 60 },
        { memberId: ashaId, amount: 20 },
      ],
    });
    expect(exact).toMatchObject({ ok: false, code: "validation_error" });
    // Neutral wording (it's logged); the sums travel in details for the dialog.
    expect(exact).toMatchObject({
      error: "The shares don't add up to the expense",
      details: { sumMinor: 8000, totalMinor: 9000 },
    });

    ok(
      await actions.createSplitExpense(id, {
        title: "Taxi",
        amount: 90,
        paidBy: ashaId,
        occurredOn: today,
        splitType: "percent",
        shares: [
          { memberId: ownerId, percent: 66.67 },
          { memberId: ashaId, percent: 33.33 },
        ],
      }),
    );
    const { items } = await ledger.listExpenses(uid("asha"), id, { limit: 10, offset: 0 });
    expect(items[0]!.shares).toEqual([
      expect.objectContaining({ memberId: ownerId, amountMinor: 6000, percentBp: 6667 }),
      expect.objectContaining({ memberId: ashaId, amountMinor: 3000, percentBp: 3333 }),
    ]);
    expect(items[0]!.canEdit).toBe(true);
  });

  it("payer and participants must be in the group", async () => {
    const { id, ownerId } = await trio();
    const other = await newGroup("x");
    const outsider = (await split.getGroupDetail(uid("x"), other)).me.memberId;
    signInAs("o");
    const res = await actions.createSplitExpense(id, {
      title: "Sneaky",
      amount: 10,
      paidBy: outsider,
      occurredOn: today,
      splitType: "equal",
      memberIds: [ownerId],
    });
    expect(res).toMatchObject({ ok: false, code: "validation_error" });
  });

  it("an expense is edited by its author or the creator, and shares keep their ids", async () => {
    const { id, ownerId, ashaId, raviId } = await trio();
    signInAs("asha");
    const { id: expenseId } = ok(
      await actions.createSplitExpense(id, {
        title: "Snacks",
        amount: 30,
        paidBy: ashaId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ashaId, raviId],
      }),
    );
    const before = await db().select().from(splitShares).where(eq(splitShares.expenseId, expenseId));

    signInAs("ravi");
    const denied = await actions.updateSplitExpense(id, expenseId, {
      title: "Mine",
      amount: 30,
      paidBy: raviId,
      occurredOn: today,
      splitType: "equal",
      memberIds: [raviId],
    });
    expect(denied).toMatchObject({ ok: false, code: "forbidden" });
    expect(await actions.deleteSplitExpense(id, expenseId)).toMatchObject({ ok: false, code: "forbidden" });

    signInAs("o"); // the creator may edit anyone's
    ok(
      await actions.updateSplitExpense(id, expenseId, {
        title: "Snacks + drinks",
        amount: 60,
        paidBy: ashaId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ashaId, raviId, ownerId],
      }),
    );
    const after = await db().select().from(splitShares).where(eq(splitShares.expenseId, expenseId));
    expect(after).toHaveLength(3);
    for (const old of before) {
      expect(after.find((s) => s.memberId === old.memberId)!.id).toBe(old.id);
    }
    expect(after.reduce((a, s) => a + s.amountMinor, 0)).toBe(6000);

    // Dropping someone removes their share.
    signInAs("asha");
    ok(
      await actions.updateSplitExpense(id, expenseId, {
        title: "Snacks",
        amount: 60,
        paidBy: ashaId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ashaId, ownerId],
      }),
    );
    expect(await db().select().from(splitShares).where(eq(splitShares.expenseId, expenseId))).toHaveLength(2);

    const missing = await actions.updateSplitExpense(id, "0190a5c4-0000-7000-8000-000000000999", {
      title: "x",
      amount: 1,
      paidBy: ashaId,
      occurredOn: today,
      splitType: "equal",
      memberIds: [ashaId],
    });
    expect(missing).toMatchObject({ ok: false, code: "not_found" });

    ok(await actions.deleteSplitExpense(id, expenseId));
    expect((await ledger.listExpenses(uid("asha"), id, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("records payments with the right people, and undoes them", async () => {
    const { id, ownerId, ashaId, raviId } = await trio();
    signInAs("o");
    ok(
      await actions.createSplitExpense(id, {
        title: "Hotel",
        amount: 300,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId, raviId],
      }),
    );

    signInAs("asha");
    // Asha can't record a payment between two other people.
    expect(
      await actions.recordSplitSettlement(id, { fromMemberId: raviId, toMemberId: ownerId, amount: 100, settledOn: today }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    const { id: paymentId } = ok(
      await actions.recordSplitSettlement(id, { fromMemberId: ashaId, toMemberId: ownerId, amount: 100, settledOn: today }),
    );
    let detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.members.find((m) => m.id === ashaId)!.netMinor).toBe(0);
    expect(detail.suggestions).toEqual([{ fromMemberId: raviId, toMemberId: ownerId, amountMinor: 10_000 }]);

    const payments = await ledger.listSettlements(uid("ravi"), id, { limit: 10, offset: 0 });
    expect(payments.items[0]).toMatchObject({
      id: paymentId,
      from: { memberId: ashaId, name: "ASHA" },
      to: { memberId: ownerId, name: "o" },
      amountMinor: 10_000,
      canDelete: false,
    });
    const one = await ledger.getSettlement(uid("ravi"), id, paymentId);
    expect(one.settlement.id).toBe(paymentId);

    signInAs("ravi");
    expect(await actions.deleteSplitSettlement(id, paymentId)).toMatchObject({ ok: false, code: "forbidden" });
    // The creator records for anyone.
    signInAs("o");
    ok(await actions.recordSplitSettlement(id, { fromMemberId: raviId, toMemberId: ownerId, amount: 100, settledOn: today }));
    detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.suggestions).toEqual([]);
    ok(await actions.deleteSplitSettlement(id, paymentId));
    expect(await actions.deleteSplitSettlement(id, paymentId)).toMatchObject({ ok: false, code: "not_found" });

    // Someone from another group isn't a valid party.
    const other = await newGroup("x");
    const outsider = (await split.getGroupDetail(uid("x"), other)).me.memberId;
    signInAs("o");
    expect(
      await actions.recordSplitSettlement(id, { fromMemberId: outsider, toMemberId: ownerId, amount: 1, settledOn: today }),
    ).toMatchObject({ ok: false, code: "validation_error" });
  });

  it("removing or leaving needs a zero balance; re-adding brings the same row back", async () => {
    const { id, ownerId, ashaId } = await trio();
    signInAs("o");
    ok(
      await actions.createSplitExpense(id, {
        title: "Fuel",
        amount: 50,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    expect(await actions.removeSplitMember(id, ashaId)).toMatchObject({ ok: false, code: "settle_first" });
    signInAs("asha");
    expect(await actions.leaveSplitGroup(id)).toMatchObject({ ok: false, code: "settle_first" });
    ok(await actions.recordSplitSettlement(id, { fromMemberId: ashaId, toMemberId: ownerId, amount: 25, settledOn: today }));
    ok(await actions.leaveSplitGroup(id));
    await expect(split.getGroupDetail(uid("asha"), id)).rejects.toMatchObject({ status: 404 });

    signInAs("o");
    expect(await actions.leaveSplitGroup(id)).toMatchObject({ ok: false, code: "bad_request" });
    expect(await actions.removeSplitMember(id, ownerId)).toMatchObject({ ok: false, code: "bad_request" });
    expect(await actions.removeSplitMember(id, ashaId)).toMatchObject({ ok: false, code: "not_found" });

    // She left by choice: she can't be invited back for 30 days…
    const tooSoon = await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] });
    expect(tooSoon).toMatchObject({
      ok: false,
      code: "invite_cooldown",
      details: { emails: ["asha@example.com"] },
    });
    // …and the refusal's message (which gets logged) names nobody.
    expect((tooSoon as { error: string }).error).not.toContain("asha");
    await db()
      .update(splitMembers)
      .set({ inviteCooldownUntil: new Date(Date.now() - 1000) })
      .where(eq(splitMembers.id, ashaId));
    const { added } = ok(await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] }));
    expect(added[0]).toMatchObject({ memberId: ashaId, status: "invited" });
    signInAs("asha");
    ok(await actions.acceptSplitInvitation(ashaId));

    // A removal by the creator sets no cooldown: they can undo it right away.
    signInAs("o");
    ok(await actions.removeSplitMember(id, ashaId));
    const [row] = await db().select().from(splitMembers).where(eq(splitMembers.id, ashaId));
    expect(row).toMatchObject({ status: "left", inviteToken: null, inviteCooldownUntil: null });
    ok(await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] }));
  });

  it("a former member can't be put on a new expense, but stays on old ones", async () => {
    const { id, ownerId, raviId } = await trio();
    signInAs("o");
    const gift = {
      title: "Gift",
      amount: 40,
      paidBy: ownerId,
      occurredOn: today,
      splitType: "equal" as const,
      memberIds: [ownerId, raviId],
    };
    const { id: expenseId } = ok(await actions.createSplitExpense(id, gift));
    ok(await actions.recordSplitSettlement(id, { fromMemberId: raviId, toMemberId: ownerId, amount: 20, settledOn: today }));
    ok(await actions.removeSplitMember(id, raviId));

    const res = await actions.createSplitExpense(id, { ...gift, title: "Later" });
    expect(res).toMatchObject({ ok: false, code: "validation_error" });
    // Editing the old expense keeps him on it.
    ok(await actions.updateSplitExpense(id, expenseId, { ...gift, title: "Birthday gift" }));
    // He still shows (as a former member) only while he has a balance — he doesn't.
    const detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.members.some((m) => m.id === raviId)).toBe(false);
  });

  it("lists expenses newest first, one at a time too", async () => {
    const { id, ownerId } = await trio();
    signInAs("o");
    for (const [i, day] of ["2026-09-01", "2026-09-03", "2026-09-02"].entries()) {
      ok(
        await actions.createSplitExpense(id, {
          title: `E${i}`,
          amount: 10,
          paidBy: ownerId,
          occurredOn: day,
          splitType: "equal",
          memberIds: [ownerId],
        }),
      );
    }
    const first = await ledger.listExpenses(uid("o"), id, { limit: 10, offset: 0 });
    expect(first.items.map((e) => e.occurredOn)).toEqual(["2026-09-03", "2026-09-02", "2026-09-01"]);
    expect(first.total).toBe(3);
    const got = await ledger.getExpense(uid("o"), id, first.items[0]!.id);
    expect(got.expense.title).toBe("E1");
    await expect(ledger.getExpense(uid("o"), id, "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("deleting a group removes everything in it", async () => {
    const { id, ownerId, ashaId } = await trio();
    signInAs("o");
    ok(
      await actions.createSplitExpense(id, {
        title: "x",
        amount: 10,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    ok(await actions.recordSplitSettlement(id, { fromMemberId: ashaId, toMemberId: ownerId, amount: 5, settledOn: today }));
    ok(await actions.deleteSplitGroup(id));
    expect(await db().select().from(splitGroups).where(eq(splitGroups.id, id))).toEqual([]);
    expect(await db().select().from(splitMembers).where(eq(splitMembers.groupId, id))).toEqual([]);
    await expect(split.getGroupDetail(uid("asha"), id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("account deletion and split", () => {
  it("deletes the groups you created and anonymises you elsewhere, keeping balances", async () => {
    // Asha's own group goes with her.
    const mine = await newGroup("asha");
    // In o's group she owes money; the row stays, without her name or email.
    const theirs = await newGroup("o");
    const ashaId = await joinAs(theirs, "asha");
    const ownerId = (await split.getGroupDetail(uid("o"), theirs)).me.memberId;
    signInAs("o");
    ok(
      await actions.createSplitExpense(theirs, {
        title: "x",
        amount: 10,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );

    await deleteAccount(uid("asha"), "DELETE");
    expect(await db().select().from(splitGroups).where(eq(splitGroups.id, mine))).toEqual([]);
    const [row] = await db().select().from(splitMembers).where(eq(splitMembers.id, ashaId));
    expect(row).toMatchObject({ userId: null, email: null, displayName: "Deleted account", status: "left" });
    const detail = await split.getGroupDetail(uid("o"), theirs);
    const former = detail.members.find((m) => m.id === ashaId)!;
    expect(former).toMatchObject({ name: "Deleted account", status: "left", netMinor: -500 });
  });
});

describe("split review fixes", () => {
  it("refuses a payment or expense that rounds to nothing, with a 422 not a 500", async () => {
    const id = await newGroup("o", [], "JPY");
    const ashaId = await joinAs(id, "asha");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    signInAs("asha");
    const payment = await actions.recordSplitSettlement(id, {
      fromMemberId: ashaId,
      toMemberId: ownerId,
      amount: 0.4,
      settledOn: today,
    });
    expect(payment).toMatchObject({ ok: false, code: "validation_error", error: "Amount is too small for JPY" });
    const expense = await actions.createSplitExpense(id, {
      title: "Gum",
      amount: 0.4,
      paidBy: ashaId,
      occurredOn: today,
      splitType: "equal",
      memberIds: [ashaId],
    });
    expect(expense).toMatchObject({ ok: false, code: "validation_error", error: "Amount is too small for JPY" });
  });

  it("keeps names out of refusal messages (they end up in logs)", async () => {
    const id = await newGroup();
    const ashaId = await joinAs(id, "asha");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    signInAs("o");
    ok(
      await actions.createSplitExpense(id, {
        title: "Fuel",
        amount: 50,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    const res = await actions.removeSplitMember(id, ashaId);
    expect(res).toMatchObject({ ok: false, code: "settle_first" });
    expect((res as { error: string }).error).not.toContain("ASHA");
  });

  it("deleting a group takes its row lock first", async () => {
    const id = await newGroup();
    const statements = await captureSql(() => split.deleteGroup(uid("o"), id));
    const lockAt = statements.findIndex((q) => /from "split_groups".*for update/is.test(q.text));
    const deleteAt = statements.findIndex((q) => /^delete from "split_groups"/i.test(q.text));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(lockAt);
  });

  it("pages invitations and caps the badge count", async () => {
    await bootstrapUser("asha");
    // Four inviters × three groups each (one inviter can only have 3 open to her).
    for (const inviter of ["i1", "i2", "i3", "i4"]) {
      await bootstrapUser(inviter);
      signInAs(inviter);
      for (let g = 0; g < 3; g++) {
        ok(
          await actions.createSplitGroup({
            name: `${inviter}-${g}`,
            currency: "USD",
            members: [{ email: "asha@example.com", name: "Asha" }],
          }),
        );
      }
    }
    expect(await split.countInvitations(me("asha"))).toBe(split.SPLIT_INVITATION_BADGE_MAX + 1);
    const first = await split.listInvitations(me("asha"), { limit: 5, offset: 0 });
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(5);
    signInAs("asha");
    const rest = ok(await actions.loadSplitInvitations(10));
    expect(rest.items).toHaveLength(2);
    expect(ok(await actions.loadSplitInvitations(-1)).items).toHaveLength(12); // a bad offset reads from the start
  });

  it("the chat feed interleaves expenses and payments in order, and pages back in time", async () => {
    const id = await newGroup();
    const ashaId = await joinAs(id, "asha");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    signInAs("o");
    const expense = (title: string, day: string) =>
      actions.createSplitExpense(id, {
        title,
        amount: 10,
        paidBy: ownerId,
        occurredOn: day,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      });
    ok(await expense("Breakfast", "2026-09-01"));
    ok(await actions.recordSplitSettlement(id, { fromMemberId: ashaId, toMemberId: ownerId, amount: 5, settledOn: "2026-09-02" }));
    ok(await expense("Lunch", "2026-09-02"));
    ok(await expense("Dinner", "2026-09-03"));

    // Oldest first within the page, newest at the bottom, payments in between.
    const all = await ledger.listGroupFeed(uid("asha"), id, { limit: 10 });
    expect(all.total).toBe(4);
    expect(all.currency).toBe("INR");
    expect(
      all.items.map((i) => (i.kind === "expense" ? i.expense.title : `paid ${i.payment.amountMinor}`)),
    ).toEqual(["Breakfast", "paid 500", "Lunch", "Dinner"]);
    // Same day: the payment was added before Lunch, so it comes first.
    expect(all.items[1]!.date).toBe("2026-09-02");

    // The newest page first; "Show earlier" reads back from the oldest item on screen.
    const label = (i: ledger.SplitFeedItem) => (i.kind === "expense" ? i.expense.title : "payment");
    const newest = await ledger.listGroupFeed(uid("asha"), id, { limit: 2 });
    expect(newest.items.map(label)).toEqual(["Lunch", "Dinner"]);
    // A keyset, not an offset: deleting what's on screen doesn't shift the next page.
    ok(await actions.deleteSplitExpense(id, newest.items[1]!.id));
    const earlier = ok(await actions.loadSplitFeed(id, feedCursor(newest.items[0]!)));
    expect(earlier.items.map(label)).toEqual(["Breakfast", "payment"]);
    expect(earlier.total).toBe(3);
    // Same day as the cursor: only what was added before it.
    expect(ok(await actions.loadSplitFeed(id, feedCursor(earlier.items[1]!))).items.map(label)).toEqual([
      "Breakfast",
    ]);
    expect(ok(await actions.loadSplitFeed(id, feedCursor(earlier.items[0]!))).items).toEqual([]);
    // A malformed cursor is refused, not read as "from the start".
    expect((await actions.loadSplitFeed(id, { day: "yesterday", at: "noon", id: "x" })).ok).toBe(false);

    // The expense views carry the viewer's share, as the bubbles need.
    const dinner = all.items[3]!;
    expect(dinner.kind === "expense" && dinner.expense.myShare?.amountMinor).toBe(500);

    // Strangers still get a 404.
    await bootstrapUser("eve");
    await expect(ledger.listGroupFeed(uid("eve"), id, { limit: 10 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("the groups list carries each group's last activity", async () => {
    const id = await newGroup();
    const ashaId = await joinAs(id, "asha");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    const empty = await newGroup("o"); // a second group, still empty
    let groups = await split.listGroups(uid("o"));
    expect(groups.find((g) => g.id === empty)!.lastActivity).toBeNull();

    signInAs("asha");
    ok(
      await actions.createSplitExpense(id, {
        title: "Taxi",
        amount: 30,
        paidBy: ashaId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    groups = await split.listGroups(uid("o"));
    expect(groups.find((g) => g.id === id)!.lastActivity).toMatchObject({
      kind: "expense",
      title: "Taxi",
      amountMinor: 3000,
      payerName: "ASHA",
      payerIsYou: false,
    });

    signInAs("o");
    ok(await actions.recordSplitSettlement(id, { fromMemberId: ownerId, toMemberId: ashaId, amount: 15, settledOn: today }));
    groups = await split.listGroups(uid("o"));
    expect(groups.find((g) => g.id === id)!.lastActivity).toMatchObject({
      kind: "payment",
      amountMinor: 1500,
      fromIsYou: true,
      toName: "ASHA",
      toIsYou: false,
    });
  });
});
