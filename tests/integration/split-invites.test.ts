import { describe, it, expect, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  emailSendLog,
  profiles,
  splitMembers,
  splitShares,
  transactions,
  users,
  workspaces,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import {
  EMAIL_SENDS_PER_HOUR,
  reserveEmailSends,
  SPLIT_INVITE_EMAIL_KIND,
  SPLIT_INVITE_EMAILS_PER_DAY,
} from "@/lib/email-quota";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { bindSplitInvitesOnSignup } from "@/lib/split-signup";
import { createWorkspaceWithDefaults } from "@/lib/workspaces";
import * as actions from "@/actions/split";
import * as split from "@/services/split";
import * as invites from "@/services/split-invites";
import * as ledger from "@/services/split-ledger";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, registerUser, workspaceIdOf } from "./helpers/seed";

const db = () => getTestDb();
const sent = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
const me = (alias: string) => ({ id: uid(alias), email: `${alias}@example.com` });
const today = "2026-10-01";

function ok<T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(`action failed: ${(res as unknown as { error: string }).error}`);
  return res as Extract<T, { ok: true }>;
}

/** Owner "o" (bootstrapped) creates a group. Clears the welcome-email spy. */
async function newGroup(people: { email: string; name: string }[] = [], currency = "USD") {
  await bootstrapUser("o");
  vi.mocked(sendEmail).mockClear();
  signInAs("o");
  return ok(await actions.createSplitGroup({ name: "Goa trip", currency, members: people }));
}

async function rowFor(email: string) {
  const [row] = await db().select().from(splitMembers).where(eq(splitMembers.email, email));
  return row!;
}

async function splitSends(userAlias = "o") {
  return db()
    .select()
    .from(emailSendLog)
    .where(and(eq(emailSendLog.userId, uid(userAlias)), eq(emailSendLog.kind, SPLIT_INVITE_EMAIL_KIND)));
}

describe("split invite emails (abuse rule D1)", () => {
  it("D1: a non-user gets exactly one invite email per group", async () => {
    const { id, added } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    expect(added).toEqual([expect.objectContaining({ email: "zoe@example.com", delivery: "email" })]);
    expect(sent()).toHaveLength(1);
    const mail = sent()[0]!;
    const zoe = await rowFor("zoe@example.com");
    expect(mail.to).toBe("zoe@example.com");
    expect(mail.subject).toContain("Goa trip");
    expect(mail.html).toContain(`/invite/split/${zoe.inviteToken}?utm_source=split_invite`);
    expect(mail.text).toContain(`/invite/split/${zoe.inviteToken}`);
    expect(zoe.inviteEmailedAt).toBeInstanceOf(Date);
    expect(await splitSends()).toHaveLength(1);

    // Adding again, sending again, removing and re-adding: never a second email.
    signInAs("o");
    expect(ok(await actions.addSplitMembers(id, { members: [{ email: "zoe@example.com", name: "Zoe" }] })).added[0]!.delivery).toBe("already");
    expect(await actions.sendSplitInviteEmail(id, zoe.id)).toMatchObject({ ok: false, code: "conflict" });
    ok(await actions.removeSplitMember(id, zoe.id));
    const readded = ok(await actions.addSplitMembers(id, { members: [{ email: "zoe@example.com", name: "Zoe" }] }));
    expect(readded.added[0]).toMatchObject({ memberId: zoe.id, delivery: "link" });
    expect(sent()).toHaveLength(1);
    // The old link died with the removal; the re-add minted a new one.
    const again = await rowFor("zoe@example.com");
    expect(again.inviteToken).not.toBe(zoe.inviteToken);
    expect(await invites.getSplitInviteByToken(zoe.inviteToken)).toBeNull();

    // A different group is a different invite: one more email.
    ok(await actions.createSplitGroup({ name: "Flat", currency: "USD", members: [{ email: "zoe@example.com", name: "Zoe" }] }));
    expect(sent()).toHaveLength(2);
  });

  it("D1: people with an account get an in-app invitation and no email", async () => {
    await bootstrapUser("asha");
    const { added } = await newGroup([{ email: "asha@example.com", name: "Asha" }]);
    expect(added[0]!.delivery).toBe("in_app");
    expect(sent()).toHaveLength(0);
    expect(await splitSends()).toHaveLength(0);
    const asha = await rowFor("asha@example.com");
    expect(asha.userId).toBe(uid("asha"));
    expect(asha.inviteEmailedAt).toBeNull();
    // …and "Send invite email" doesn't apply to them.
    signInAs("o");
    expect(await actions.sendSplitInviteEmail(asha.groupId, asha.id)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("D1: the daily invite-email cap stops emails but still adds the people, with a link", async () => {
    await bootstrapUser("o");
    // 25 split invites already today, outside the last hour.
    await db()
      .insert(emailSendLog)
      .values(
        Array.from({ length: 25 }, () => ({
          userId: uid("o"),
          kind: SPLIT_INVITE_EMAIL_KIND,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        })),
      );
    vi.mocked(sendEmail).mockClear();
    signInAs("o");
    const people = Array.from({ length: 7 }, (_, i) => ({ email: `n${i}@example.com`, name: `N${i}` }));
    const { id, added } = ok(await actions.createSplitGroup({ name: "Big trip", currency: "USD", members: people }));
    const left = SPLIT_INVITE_EMAILS_PER_DAY - 25;
    expect(added.filter((a) => a.delivery === "email")).toHaveLength(left);
    expect(added.filter((a) => a.delivery === "link")).toHaveLength(7 - left);
    expect(sent()).toHaveLength(left);
    // Everyone is in the group regardless.
    expect((await split.getGroupDetail(uid("o"), id)).peopleCount).toBe(8);

    // The skipped ones were un-claimed, so they can still get their one email later.
    const skipped = added.find((a) => a.delivery === "link")!;
    const row = await rowFor(skipped.email);
    expect(row.inviteEmailedAt).toBeNull();
    const detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.members.find((m) => m.id === skipped.memberId)!.canSendInviteEmail).toBe(true);
    expect(ok(await actions.sendSplitInviteEmail(id, skipped.memberId)).emailed).toBe(false);
    expect((await rowFor(skipped.email)).inviteEmailedAt).toBeNull();

    // A day later the cap has room again.
    await db()
      .update(emailSendLog)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(emailSendLog.userId, uid("o")));
    expect(ok(await actions.sendSplitInviteEmail(id, skipped.memberId)).emailed).toBe(true);
    expect((await rowFor(skipped.email)).inviteEmailedAt).toBeInstanceOf(Date);
    expect(await actions.sendSplitInviteEmail(id, skipped.memberId)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("D1: refused adds (not the creator, group full) spend no email quota", async () => {
    const people = Array.from({ length: SPLIT_GROUP_MAX_PEOPLE - 2 }, (_, i) => ({
      email: `p${i}@example.com`,
      name: `P${i}`,
    }));
    await bootstrapUser("asha");
    const { id, added } = await newGroup([...people.slice(0, 1), { email: "asha@example.com", name: "Asha" }]);
    signInAs("asha");
    ok(await actions.acceptSplitInvitation(added[1]!.memberId));
    const before = (await splitSends()).length;

    // A member isn't the creator.
    expect(
      await actions.addSplitMembers(id, { members: [{ email: "x@example.com", name: "X" }] }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(await db().select().from(emailSendLog).where(eq(emailSendLog.userId, uid("asha")))).toHaveLength(0);
    expect(await actions.sendSplitInviteEmail(id, added[0]!.memberId)).toMatchObject({ ok: false, code: "forbidden" });

    // Fill the group, then one more is refused before any quota is touched.
    signInAs("o");
    await db().delete(emailSendLog); // room for the fill
    const fill = ok(await actions.addSplitMembers(id, { members: people.slice(1, SPLIT_GROUP_MAX_PEOPLE - 3) }));
    expect(fill.added.length).toBe(SPLIT_GROUP_MAX_PEOPLE - 4);
    const afterFill = (await splitSends()).length;
    const full = await actions.addSplitMembers(id, {
      members: [
        { email: "y1@example.com", name: "Y1" },
        { email: "y2@example.com", name: "Y2" },
      ],
    });
    expect(full).toMatchObject({ ok: false, code: "split_group_full" });
    expect((await splitSends()).length).toBe(afterFill);
    void before;
  });

  it("D1: the join link only works for the invited email", async () => {
    const { id } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    const zoe = await rowFor("zoe@example.com");
    const token = zoe.inviteToken!;

    const preview = await invites.getSplitInviteByToken(token);
    expect(preview).toMatchObject({
      groupId: id,
      groupName: "Goa trip",
      inviterName: "o",
      peopleCount: 2,
      email: "zoe@example.com",
    });
    expect(await invites.getSplitInviteByToken("short")).toBeNull();
    expect(await invites.getSplitInviteByToken("x".repeat(32))).toBeNull();

    // Someone else holding the link is refused.
    await bootstrapUser("eve");
    signInAs("eve");
    expect(await actions.acceptSplitInvite(token)).toMatchObject({ ok: false, code: "forbidden" });
    await expect(invites.acceptSplitInviteByToken({ id: uid("eve"), email: null }, token)).rejects.toMatchObject({
      status: 403,
    });
    await expect(split.getGroupDetail(uid("eve"), id)).rejects.toMatchObject({ status: 404 });

    // Zoe signs up and joins from the link.
    await registerUser("zoe");
    signInAs("zoe");
    const res = ok(await actions.acceptSplitInvite(token));
    expect(res.groupId).toBe(id);
    expect((await split.getGroupDetail(uid("zoe"), id)).me.isCreator).toBe(false);
    // Used up.
    expect(await actions.acceptSplitInvite(token)).toMatchObject({ ok: false, code: "not_found" });
    expect(await invites.getSplitInviteByToken(token)).toBeNull();
    await expect(invites.acceptSplitInviteByToken(me("zoe"), "!!")).rejects.toMatchObject({ status: 422 });
  });

  it("a link bound to another account is refused even for the same address", async () => {
    const { id } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    const zoe = await rowFor("zoe@example.com");
    // Bound to some other account since (e.g. the address changed hands).
    await registerUser("ann");
    await db().update(splitMembers).set({ userId: uid("ann") }).where(eq(splitMembers.id, zoe.id));
    await expect(invites.acceptSplitInviteByToken(me("zoe"), zoe.inviteToken)).rejects.toMatchObject({
      status: 403,
    });
    void id;
  });
});

describe("sign-up from a split invite", () => {
  it("binds waiting invitations to the new account and tags the sign-up", async () => {
    await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    await bootstrapUser("zoe");
    const zoe = await rowFor("zoe@example.com");
    expect(zoe).toMatchObject({ userId: uid("zoe"), status: "invited" });
    const [account] = await db().select({ acquisition: users.acquisition }).from(users).where(eq(users.id, uid("zoe")));
    expect(account!.acquisition).toMatchObject({ invitedVia: "split" });
    expect(typeof account!.acquisition!.invitedAt).toBe("string");
    expect(await split.listInvitations(me("zoe"))).toHaveLength(1);

    // An ordinary sign-up isn't tagged.
    await bootstrapUser("plain");
    const [plain] = await db().select({ acquisition: users.acquisition }).from(users).where(eq(users.id, uid("plain")));
    expect(plain!.acquisition?.invitedVia).toBeUndefined();
  });

  it("leaves a row unbound when the account already has one in that group", async () => {
    const { id } = await newGroup([
      { email: "a1@example.com", name: "A1" },
      { email: "a2@example.com", name: "A2" },
    ]);
    await registerUser("dup");
    await db().update(splitMembers).set({ userId: uid("dup") }).where(eq(splitMembers.email, "a1@example.com"));
    expect(await bindSplitInvitesOnSignup(uid("dup"), "A2@example.com")).toBe(0);
    expect((await rowFor("a2@example.com")).userId).toBeNull();
    void id;
  });
});

describe("email quota reservation", () => {
  it("shares the hourly pool with every other user-triggered email", async () => {
    await registerUser("q");
    expect(await reserveEmailSends(uid("q"), SPLIT_INVITE_EMAIL_KIND, 0)).toBe(0);
    await db()
      .insert(emailSendLog)
      .values(Array.from({ length: EMAIL_SENDS_PER_HOUR - 2 }, () => ({ userId: uid("q"), kind: "member_invite" })));
    expect(await reserveEmailSends(uid("q"), SPLIT_INVITE_EMAIL_KIND, 5, { perDay: 30 })).toBe(2);
    expect(await reserveEmailSends(uid("q"), "member_invite", 1)).toBe(0);
  });
});

describe("add my share to my workspace", () => {
  /** o pays $90 for o + asha (equal); returns ids. */
  async function sharedExpense(currency = "USD") {
    await bootstrapUser("asha");
    const { id } = await newGroup([{ email: "asha@example.com", name: "Asha" }], currency);
    const ashaId = (await rowFor("asha@example.com")).id;
    signInAs("asha");
    ok(await actions.acceptSplitInvitation(ashaId));
    signInAs("o");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    const { id: expenseId } = ok(
      await actions.createSplitExpense(id, {
        title: "Hotel",
        amount: 90.01,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    return { groupId: id, expenseId, ashaId, ownerId };
  }

  it("writes the share as one expense, exactly, and only once", async () => {
    const { groupId, expenseId } = await sharedExpense();
    signInAs("asha");
    const profileId = await firstProfileId("asha");
    const res = ok(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId }));
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, res.transactionId));
    expect(txn).toMatchObject({
      userId: uid("asha"),
      type: "expense",
      amountMinor: 4500, // $90.01 split two ways: the payer took the extra cent
      profileId,
      title: "Hotel",
      description: "Split: Goa trip",
      occurredOn: today,
    });
    const page = await ledger.listExpenses(uid("asha"), groupId, { limit: 10, offset: 0 });
    expect(page.items[0]!.myShare).toMatchObject({ amountMinor: 4500, added: true });

    // A second add is refused and writes nothing.
    expect(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId })).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await db().select().from(transactions).where(eq(transactions.userId, uid("asha")))).toHaveLength(1);

    // Once that transaction is gone for good, the share can be added again.
    await db().delete(transactions).where(eq(transactions.id, res.transactionId));
    ok(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId, title: "Hotel (Goa)" }));
  });

  it("two adds at once still make one transaction", async () => {
    const { groupId, expenseId } = await sharedExpense();
    const profileId = await firstProfileId("asha");
    const workspace = { id: await workspaceIdOf("asha"), currency: "USD", locale: "en-US" };
    const results = await Promise.allSettled([
      ledger.addShareToWorkspace(uid("asha"), workspace, groupId, expenseId, { profileId }),
      ledger.addShareToWorkspace(uid("asha"), workspace, groupId, expenseId, { profileId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(transactions).where(eq(transactions.userId, uid("asha")))).toHaveLength(1);
    const shares = await db().select().from(splitShares).where(eq(splitShares.expenseId, expenseId));
    expect(shares.filter((s) => s.transactionId !== null)).toHaveLength(1);
  });

  it("in another currency the person confirms the amount in the workspace's currency", async () => {
    const { groupId, expenseId } = await sharedExpense("EUR");
    signInAs("asha");
    const profileId = await firstProfileId("asha");
    const missing = await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId });
    expect(missing).toMatchObject({ ok: false, code: "amount_required" });
    const res = ok(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId, amount: 52.4 }));
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, res.transactionId));
    expect(txn!.amountMinor).toBe(5240);
  });

  it("only into a profile you can write, in a workspace you can add to", async () => {
    const { groupId, expenseId } = await sharedExpense();
    signInAs("asha");
    // o's profile, which Asha can't see.
    const foreign = await firstProfileId("o");
    expect(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId: foreign })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    // A view-only workspace (Asha's second free one) refuses with plan_limit.
    const second = await createWorkspaceWithDefaults(uid("asha"), "Second");
    await db()
      .update(workspaces)
      .set({ createdAt: sql`now() + interval '1 minute'` })
      .where(eq(workspaces.id, second.id));
    const [p2] = await db().select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, second.id));
    await expect(
      ledger.addShareToWorkspace(
        uid("asha"),
        { id: second.id, currency: "USD", locale: "en-US" },
        groupId,
        expenseId,
        { profileId: p2!.id },
      ),
    ).rejects.toMatchObject({ code: "plan_limit" });
    expect(await ledger.writableProfiles(uid("asha"), second.id)).toEqual([]);
    expect((await ledger.writableProfiles(uid("asha"), await workspaceIdOf("asha"))).length).toBeGreaterThan(0);
    // Nothing was written, and the share is still free to add.
    expect(await db().select().from(transactions).where(eq(transactions.userId, uid("asha")))).toHaveLength(0);
  });

  it("refuses an expense you have no share in, and strangers", async () => {
    const { groupId, ownerId } = await sharedExpense();
    signInAs("o");
    const { id: soloId } = ok(
      await actions.createSplitExpense(groupId, {
        title: "Solo",
        amount: 5,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId],
      }),
    );
    signInAs("asha");
    const profileId = await firstProfileId("asha");
    expect(await actions.addSplitShareToWorkspace(groupId, soloId, { profileId })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    await bootstrapUser("eve");
    signInAs("eve");
    expect(
      await actions.addSplitShareToWorkspace(groupId, soloId, { profileId: await firstProfileId("eve") }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});
