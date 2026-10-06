import { describe, it, expect, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  emailSendLog,
  profiles,
  splitMembers,
  splitRateLog,
  splitShares,
  transactions,
  users,
  workspaces,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { assertEmailSendAllowed, EMAIL_SENDS_PER_HOUR } from "@/lib/email-quota";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import { bindSplitInvitesOnSignup } from "@/lib/split-signup";
import { createWorkspaceWithDefaults } from "@/lib/workspaces";
import * as actions from "@/actions/split";
import * as split from "@/services/split";
import * as invites from "@/services/split-invites";
import * as ledger from "@/services/split-ledger";
import {
  SPLIT_ADDS_PER_DAY,
  SPLIT_INVITE_EMAILS_PER_DAY,
  SPLIT_EMAILS_PER_RECIPIENT,
  SPLIT_EMAILS_PER_RECIPIENT_DAYS,
  SPLIT_GROUPS_PER_DAY,
  SPLIT_PENDING_PER_INVITEE,
} from "@/services/split-rate";
import { signInAs, uid } from "./helpers/session";
import { captureSql, getTestDb } from "./helpers/test-db";
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

/** Split invite emails this person sent — counted in `split_rate_log`, never the shared pool. */
async function splitSends(userAlias = "o") {
  return db()
    .select()
    .from(splitRateLog)
    .where(and(eq(splitRateLog.actorId, uid(userAlias)), eq(splitRateLog.event, "invite_emailed")));
}

describe("split invite emails (abuse rule D1)", () => {
  it("D1: a non-user gets exactly one invite email per group", async () => {
    const { id, added } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    expect(added).toEqual([{ memberId: expect.any(String), email: "zoe@example.com", status: "invited" }]);
    expect(sent()).toHaveLength(1);
    const mail = sent()[0]!;
    const zoe = await rowFor("zoe@example.com");
    expect(mail.to).toBe("zoe@example.com");
    expect(mail.subject).toContain("Goa trip");
    expect(mail.html).toContain(`/invite/split/${zoe.inviteToken}?utm_source=split_invite`);
    expect(mail.text).toContain(`/invite/split/${zoe.inviteToken}`);
    expect(zoe.inviteEmailedAt).toBeInstanceOf(Date);
    expect(await splitSends()).toHaveLength(1);

    // Adding again, removing and re-adding: never a second email.
    signInAs("o");
    expect(ok(await actions.addSplitMembers(id, { members: [{ email: "zoe@example.com", name: "Zoe" }] })).added[0]!.status).toBe("already");
    ok(await actions.removeSplitMember(id, zoe.id));
    const readded = ok(await actions.addSplitMembers(id, { members: [{ email: "zoe@example.com", name: "Zoe" }] }));
    expect(readded.added[0]).toMatchObject({ memberId: zoe.id, status: "invited" });
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
    expect(added[0]!.status).toBe("invited");
    expect(sent()).toHaveLength(0);
    expect(await splitSends()).toHaveLength(0);
    const asha = await rowFor("asha@example.com");
    expect(asha.userId).toBe(uid("asha"));
    expect(asha.inviteEmailedAt).toBeNull();
  });

  it("D1: adding someone says nothing about whether the address has an account", async () => {
    await bootstrapUser("asha");
    const { id, added } = await newGroup([
      { email: "asha@example.com", name: "Asha" },
      { email: "nobody@example.com", name: "Nobody" },
    ]);
    // The same answer for both…
    expect(added.map((a) => a.status)).toEqual(["invited", "invited"]);
    expect(Object.keys(added[0]!).sort()).toEqual(Object.keys(added[1]!).sort());
    // …and the same view of both rows: a link each, nothing else that differs.
    const detail = await split.getGroupDetail(uid("o"), id);
    const [a, n] = ["Asha", "Nobody"].map((name) => detail.members.find((m) => m.name === name)!);
    expect(a!.inviteToken).toMatch(/.{32}/);
    expect(n!.inviteToken).toMatch(/.{32}/);
    const strip = (m: typeof a) => ({ ...m!, id: "", name: "", email: "", inviteToken: "" });
    expect(strip(a)).toEqual(strip(n));
  });

  it("D1: adding an account holder or not leaves every observable quota the same", async () => {
    // Two creators: one adds someone with an account, the other someone without.
    await bootstrapUser("asha");
    for (const [creator, invitee] of [
      ["c1", "asha@example.com"],
      ["c2", "nobody@example.com"],
    ] as const) {
      await bootstrapUser(creator);
      signInAs(creator);
      ok(await actions.createSplitGroup({ name: "Trip", currency: "USD", members: [{ email: invitee, name: "X" }] }));
    }
    const pool = async (alias: string) =>
      (await db().select().from(emailSendLog).where(eq(emailSendLog.userId, uid(alias)))).length;
    const counted = async (alias: string, event: string) =>
      (
        await db()
          .select()
          .from(splitRateLog)
          .where(and(eq(splitRateLog.actorId, uid(alias)), eq(splitRateLog.event, event)))
      ).length;
    // The shared hourly email pool — what a workspace invite's 429 exposes —
    // is untouched for both; so are the add and group counters.
    expect(await pool("c1")).toBe(0);
    expect(await pool("c2")).toBe(0);
    for (const event of ["member_added", "group_created"]) {
      expect(await counted("c1", event)).toBe(await counted("c2", event));
    }
    // Both can still send exactly the full hourly allowance of other emails.
    for (const alias of ["c1", "c2"]) {
      for (let i = 0; i < EMAIL_SENDS_PER_HOUR; i++) await assertEmailSendAllowed(uid(alias), "member_invite");
      await expect(assertEmailSendAllowed(uid(alias), "member_invite")).rejects.toMatchObject({ status: 429 });
    }
  });

  it("D1: the daily invite-email cap stops emails but still adds the people, with a link", async () => {
    await bootstrapUser("o");
    // 25 split invites already today, to other inboxes.
    await db()
      .insert(splitRateLog)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          event: "invite_emailed",
          actorId: uid("o"),
          recipientKey: `earlier-${i}`,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        })),
      );
    vi.mocked(sendEmail).mockClear();
    signInAs("o");
    const people = Array.from({ length: 7 }, (_, i) => ({ email: `n${i}@example.com`, name: `N${i}` }));
    const { id, added } = ok(await actions.createSplitGroup({ name: "Big trip", currency: "USD", members: people }));
    const left = SPLIT_INVITE_EMAILS_PER_DAY - 25;
    expect(added.every((a) => a.status === "invited")).toBe(true);
    expect(sent()).toHaveLength(left);
    // Everyone is in the group regardless, and everyone has a link.
    const detail = await split.getGroupDetail(uid("o"), id);
    expect(detail.peopleCount).toBe(8);
    expect(detail.members.filter((m) => m.status === "invited").every((m) => m.inviteToken)).toBe(true);
    // The skipped ones were un-claimed (and hand back their per-inbox slot).
    const emailedTo = new Set(sent().map((m) => m.to));
    const skipped = added.find((a) => !emailedTo.has(a.email))!;
    expect((await rowFor(skipped.email)).inviteEmailedAt).toBeNull();
    expect(await splitSends()).toHaveLength(SPLIT_INVITE_EMAILS_PER_DAY);
    // Nothing went into the shared hourly pool.
    expect(await db().select().from(emailSendLog).where(eq(emailSendLog.userId, uid("o")))).toHaveLength(0);
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

    // A member isn't the creator.
    expect(
      await actions.addSplitMembers(id, { members: [{ email: "x@example.com", name: "X" }] }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(await db().select().from(emailSendLog).where(eq(emailSendLog.userId, uid("asha")))).toHaveLength(0);

    // Fill the group, then one more is refused before any quota is touched.
    signInAs("o");
    await db().delete(splitRateLog); // room for the fill
    const fill = ok(await actions.addSplitMembers(id, { members: people.slice(1, SPLIT_GROUP_MAX_PEOPLE - 3) }));
    expect(fill.added.length).toBe(SPLIT_GROUP_MAX_PEOPLE - 4);
    const afterFill = (await splitSends()).length;
    const logged = (await db().select().from(splitRateLog)).length;
    const full = await actions.addSplitMembers(id, {
      members: [
        { email: "y1@example.com", name: "Y1" },
        { email: "y2@example.com", name: "Y2" },
      ],
    });
    expect(full).toMatchObject({ ok: false, code: "split_group_full" });
    expect((await splitSends()).length).toBe(afterFill);
    expect((await db().select().from(splitRateLog)).length).toBe(logged);
  });

  it("D1: one inbox is one person — +tags and Gmail dots don't make new people", async () => {
    const { id } = await newGroup([{ email: "zoe@gmail.com", name: "Zoe" }]);
    signInAs("o");
    for (const alias of ["zoe+trip@gmail.com", "z.o.e@googlemail.com", "ZOE@gmail.com"]) {
      const res = ok(await actions.addSplitMembers(id, { members: [{ email: alias, name: "Zoe again" }] }));
      expect(res.added[0]!.status).toBe("already");
    }
    // Two spellings of one inbox in one request are refused.
    const twice = await actions.addSplitMembers(id, {
      members: [
        { email: "sam@gmail.com", name: "Sam" },
        { email: "s.a.m+x@gmail.com", name: "Sam 2" },
      ],
    });
    expect(twice).toMatchObject({ ok: false, code: "validation_error" });
    // And your own inbox under another spelling is still you.
    expect(await actions.addSplitMembers(id, { members: [{ email: "o+me@example.com", name: "Me" }] })).toMatchObject({
      ok: false,
      code: "bad_request",
    });
    expect(sent()).toHaveLength(1);
  });

  it("D1: an inbox gets at most 3 split invite emails a week, from everyone together", async () => {
    vi.mocked(sendEmail).mockClear();
    for (const [i, sender] of ["s1", "s2", "s3", "s4"].entries()) {
      await bootstrapUser(sender);
      signInAs(sender);
      // Different spellings of one inbox: the cap is per inbox, not per string.
      const email = ["zoe@gmail.com", "zoe+a@gmail.com", "z.oe@gmail.com", "zoe+b@googlemail.com"][i]!;
      ok(await actions.createSplitGroup({ name: `G${i}`, currency: "USD", members: [{ email, name: "Zoe" }] }));
    }
    const toZoe = sent().filter((m) => m.to.includes("zoe") || m.to.includes("z.oe"));
    expect(toZoe).toHaveLength(SPLIT_EMAILS_PER_RECIPIENT);
    // The fourth sender's invitee is still in their group, with a link.
    const [fourth] = await db().select().from(splitMembers).where(eq(splitMembers.email, "zoe+b@googlemail.com"));
    expect(fourth).toMatchObject({ status: "invited", inviteEmailedAt: null });
    expect(fourth!.inviteToken).toBeTruthy();
    // Nothing identifying is kept per inbox — only a hash.
    const log = await db().select().from(splitRateLog).where(eq(splitRateLog.event, "invite_emailed"));
    expect(new Set(log.map((l) => l.recipientKey)).size).toBe(1);
    expect(log[0]!.recipientKey).toMatch(/^[0-9a-f]{64}$/);

    // A week later the inbox has room again.
    await db()
      .update(splitRateLog)
      .set({ createdAt: new Date(Date.now() - (SPLIT_EMAILS_PER_RECIPIENT_DAYS + 1) * 24 * 60 * 60 * 1000) });
    await bootstrapUser("s5");
    signInAs("s5");
    ok(await actions.createSplitGroup({ name: "G5", currency: "USD", members: [{ email: "zoe@gmail.com", name: "Zoe" }] }));
    expect(sent().filter((m) => m.to === "zoe@gmail.com")).toHaveLength(2);
  });

  it("D1: one person can add at most 100 new people a day, across all their groups", async () => {
    const { id } = await newGroup();
    // 99 adds already today — deleting the groups they went to doesn't refund them.
    await db()
      .insert(splitRateLog)
      .values(Array.from({ length: SPLIT_ADDS_PER_DAY - 1 }, () => ({ event: "member_added", actorId: uid("o") })));
    signInAs("o");
    const over = await actions.addSplitMembers(id, {
      members: [
        { email: "a1@example.com", name: "A1" },
        { email: "a2@example.com", name: "A2" },
      ],
    });
    expect(over).toMatchObject({ ok: false, code: "rate_limited" });
    ok(await actions.addSplitMembers(id, { members: [{ email: "a1@example.com", name: "A1" }] }));
    // Re-adding someone already in the group isn't a new add.
    ok(await actions.addSplitMembers(id, { members: [{ email: "a1@example.com", name: "A1" }] }));
    expect(await actions.addSplitMembers(id, { members: [{ email: "a3@example.com", name: "A3" }] })).toMatchObject({
      ok: false,
      code: "rate_limited",
    });
  });

  it("D1: one person can start at most 20 groups a day, deleted ones included", async () => {
    await bootstrapUser("o");
    signInAs("o");
    for (let i = 0; i < SPLIT_GROUPS_PER_DAY; i++) {
      const { id } = ok(await actions.createSplitGroup({ name: `G${i}`, currency: "USD" }));
      ok(await actions.deleteSplitGroup(id));
    }
    expect(await actions.createSplitGroup({ name: "One more", currency: "USD" })).toMatchObject({
      ok: false,
      code: "rate_limited",
    });
  });

  it("D1: at most 3 open invitations from one person to one inbox", async () => {
    await bootstrapUser("asha");
    await bootstrapUser("o");
    signInAs("o");
    for (let i = 0; i < SPLIT_PENDING_PER_INVITEE; i++) {
      ok(await actions.createSplitGroup({ name: `G${i}`, currency: "USD", members: [{ email: "asha@example.com", name: "Asha" }] }));
    }
    const fourth = await actions.createSplitGroup({
      name: "G4",
      currency: "USD",
      members: [{ email: "asha+x@example.com", name: "Asha" }],
    });
    expect(fourth).toMatchObject({ ok: false, code: "conflict", details: { emails: ["asha+x@example.com"] } });
    expect((fourth as { error: string }).error).not.toContain("asha");
    // Once she answers one, there's room again.
    const { items } = await split.listInvitations(me("asha"));
    signInAs("asha");
    ok(await actions.declineSplitInvitation(items[0]!.memberId));
    signInAs("o");
    ok(await actions.createSplitGroup({ name: "G4", currency: "USD", members: [{ email: "asha@example.com", name: "Asha" }] }));
  });

  it("D1: a declined invitation can't be re-sent for 30 days, and the refusal names no one", async () => {
    await bootstrapUser("asha");
    const { id, added } = await newGroup([{ email: "asha@example.com", name: "Asha" }]);
    signInAs("asha");
    ok(await actions.declineSplitInvitation(added[0]!.memberId));
    signInAs("o");
    const again = await actions.addSplitMembers(id, { members: [{ email: "asha@example.com", name: "Asha" }] });
    expect(again).toMatchObject({ ok: false, code: "invite_cooldown", details: { emails: ["asha@example.com"] } });
    expect((again as { error: string }).error).not.toMatch(/asha|@/i);
    const until = Date.parse((again as { details: { until: string } }).details.until);
    expect(until).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
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
    expect((await split.listInvitations(me("zoe"))).total).toBe(1);

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
    // PGlite runs one transaction at a time, so this can't race for real here.
    // What makes it safe under real concurrency is the marker's conditional
    // UPDATE inside the insert's own transaction — asserted on the SQL below.
    let results: PromiseSettledResult<unknown>[] = [];
    const statements = await captureSql(async () => {
      results = await Promise.allSettled([
        ledger.addShareToWorkspace(uid("asha"), workspace, groupId, expenseId, { profileId }),
        ledger.addShareToWorkspace(uid("asha"), workspace, groupId, expenseId, { profileId }),
      ]);
    });
    const insertAt = statements.findIndex((q) => /^insert into "transactions"/i.test(q.text));
    const claimAt = statements.findIndex((q) =>
      /^update "split_shares".*"transaction_id" is null/is.test(q.text),
    );
    expect(insertAt).toBeGreaterThanOrEqual(0);
    expect(claimAt).toBeGreaterThan(insertAt);
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

  it("refuses an amount that rounds to nothing in the workspace's currency", async () => {
    const { groupId, expenseId } = await sharedExpense("EUR");
    // Asha's workspace keeps its books in JPY now.
    await db().update(workspaces).set({ currency: "JPY" }).where(eq(workspaces.id, await workspaceIdOf("asha")));
    signInAs("asha");
    const res = await actions.addSplitShareToWorkspace(groupId, expenseId, {
      profileId: await firstProfileId("asha"),
      amount: 0.4,
    });
    expect(res).toMatchObject({ ok: false, code: "validation_error", error: "Amount is too small for JPY" });
  });

  it("says the expense was deleted when it goes mid-add, and writes nothing", async () => {
    const { groupId, expenseId } = await sharedExpense();
    const tx = await import("@/services/transactions");
    const real = tx.createTransactionId;
    const spy = vi.spyOn(tx, "createTransactionId").mockImplementation(async (...args) => {
      // The expense (and its shares) vanish between the read and the write.
      await db().delete(splitShares).where(eq(splitShares.expenseId, expenseId));
      return real(...args);
    });
    try {
      signInAs("asha");
      const res = await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId: await firstProfileId("asha") });
      expect(res).toMatchObject({ ok: false, code: "not_found", error: "This expense was deleted" });
    } finally {
      spy.mockRestore();
    }
    expect(await db().select().from(transactions).where(eq(transactions.userId, uid("asha")))).toHaveLength(0);
  });

  it("an edit after adding shows as changed, and Update my entry brings the entry in line", async () => {
    const { groupId, expenseId, ashaId, ownerId } = await sharedExpense();
    signInAs("asha");
    const profileId = await firstProfileId("asha");
    const { transactionId } = ok(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId }));
    let page = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(page.items[0]!.myShare).toMatchObject({ added: true, changedSinceAdded: false });

    // Nothing to update yet: a same-amount update is a harmless no-op.
    ok(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {}));

    // The payer edits the expense: Asha's share goes from $45.00 to $60.00.
    signInAs("o");
    ok(
      await actions.updateSplitExpense(groupId, expenseId, {
        title: "Hotel",
        amount: 120,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    page = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(page.items[0]!.myShare).toMatchObject({ amountMinor: 6000, added: true, changedSinceAdded: true });

    // Category and title chosen at add time survive; only the amount moves.
    await db().update(transactions).set({ title: "Goa hotel" }).where(eq(transactions.id, transactionId));
    signInAs("asha");
    ok(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {}));
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, transactionId));
    expect(txn).toMatchObject({ amountMinor: 6000, title: "Goa hotel", profileId });
    page = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(page.items[0]!.myShare!.changedSinceAdded).toBe(false);

    // Once the entry is gone for good, there's nothing to update — add it again.
    await db().delete(transactions).where(eq(transactions.id, transactionId));
    expect(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {})).toMatchObject({
      ok: false,
      code: "conflict",
    });
    ok(await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId }));
  });

  it("Update my entry in another currency asks for the amount", async () => {
    const { groupId, expenseId, ashaId, ownerId } = await sharedExpense("EUR");
    signInAs("asha");
    const profileId = await firstProfileId("asha");
    const { transactionId } = ok(
      await actions.addSplitShareToWorkspace(groupId, expenseId, { profileId, amount: 50 }),
    );
    signInAs("o");
    ok(
      await actions.updateSplitExpense(groupId, expenseId, {
        title: "Hotel",
        amount: 200,
        paidBy: ownerId,
        occurredOn: today,
        splitType: "equal",
        memberIds: [ownerId, ashaId],
      }),
    );
    signInAs("asha");
    expect(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {})).toMatchObject({
      ok: false,
      code: "amount_required",
    });
    expect(await actions.updateSplitWorkspaceEntry(groupId, expenseId, { amount: 0.001 })).toMatchObject({
      ok: false,
      code: "validation_error",
    });
    ok(await actions.updateSplitWorkspaceEntry(groupId, expenseId, { amount: 110 }));
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, transactionId));
    expect(txn!.amountMinor).toBe(11000);
    // Someone with no share, or no entry, can't update one.
    signInAs("o");
    expect(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {})).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
});

describe("a share that drops to 0 after it was added", () => {
  async function addedShare() {
    await bootstrapUser("asha");
    const { id } = await newGroup([{ email: "asha@example.com", name: "Asha" }]);
    const ashaId = (await rowFor("asha@example.com")).id;
    signInAs("asha");
    ok(await actions.acceptSplitInvitation(ashaId));
    signInAs("o");
    const ownerId = (await split.getGroupDetail(uid("o"), id)).me.memberId;
    const input = {
      title: "Hotel",
      amount: 90,
      paidBy: ownerId,
      occurredOn: today,
      splitType: "equal" as const,
      memberIds: [ownerId, ashaId],
    };
    const { id: expenseId } = ok(await actions.createSplitExpense(id, input));
    signInAs("asha");
    const { transactionId } = ok(
      await actions.addSplitShareToWorkspace(id, expenseId, { profileId: await firstProfileId("asha") }),
    );
    return { groupId: id, expenseId, ashaId, ownerId, input, transactionId };
  }

  it("keeps the linked row at 0, out of the split and the balances, and offers Remove", async () => {
    const { groupId, expenseId, ashaId, ownerId, input, transactionId } = await addedShare();
    // The payer takes Asha off the expense.
    signInAs("o");
    ok(await actions.updateSplitExpense(groupId, expenseId, { ...input, memberIds: [ownerId] }));

    const [row] = await db().select().from(splitShares).where(eq(splitShares.memberId, ashaId));
    expect(row).toMatchObject({ amountMinor: 0, transactionId });
    const detail = await split.getGroupDetail(uid("o"), groupId);
    expect(detail.members.find((m) => m.id === ashaId)!.netMinor).toBe(0);
    expect(detail.suggestions).toEqual([]);
    const page = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(page.items[0]!.shares.map((s) => s.memberId)).toEqual([ownerId]);
    expect(page.items[0]!.myShare).toMatchObject({ amountMinor: 0, added: true, changedSinceAdded: true });

    // Update doesn't apply to a 0 share; Remove does — through deleteTransaction.
    signInAs("asha");
    expect(await actions.updateSplitWorkspaceEntry(groupId, expenseId, {})).toMatchObject({
      ok: false,
      code: "conflict",
    });
    ok(await actions.removeSplitWorkspaceEntry(groupId, expenseId));
    expect(await db().select().from(transactions).where(eq(transactions.id, transactionId))).toEqual([]);
    expect(await db().select().from(splitShares).where(eq(splitShares.memberId, ashaId))).toEqual([]);
    const after = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(after.items[0]!.myShare).toBeNull();
    expect(await actions.removeSplitWorkspaceEntry(groupId, expenseId)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("brings the same row back if they're put on the expense again, link intact", async () => {
    const { groupId, expenseId, ashaId, ownerId, input, transactionId } = await addedShare();
    signInAs("o");
    ok(await actions.updateSplitExpense(groupId, expenseId, { ...input, memberIds: [ownerId] }));
    ok(await actions.updateSplitExpense(groupId, expenseId, input));
    const [row] = await db().select().from(splitShares).where(eq(splitShares.memberId, ashaId));
    expect(row).toMatchObject({ amountMinor: 4500, transactionId });
    const page = await ledger.listExpenses(uid("asha"), groupId, { limit: 5, offset: 0 });
    expect(page.items[0]!.myShare).toMatchObject({ added: true, changedSinceAdded: false });
    // While she has a share, Remove isn't the way.
    signInAs("asha");
    expect(await actions.removeSplitWorkspaceEntry(groupId, expenseId)).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });

  it("a 0 row with no link is simply dropped, and an unlinked share can't be removed", async () => {
    const { groupId, expenseId, ownerId, input } = await addedShare();
    // o's own share was never added: dropping o leaves no row.
    signInAs("o");
    const ashaId = (await rowFor("asha@example.com")).id;
    ok(await actions.updateSplitExpense(groupId, expenseId, { ...input, paidBy: ownerId, memberIds: [ashaId] }));
    expect(await db().select().from(splitShares).where(eq(splitShares.memberId, ownerId))).toEqual([]);
    expect(await actions.removeSplitWorkspaceEntry(groupId, expenseId)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });
});

describe("invite pages' metadata", () => {
  it("state their own canonical and og:url, and are never indexed", async () => {
    const workspacePage = await import("@/app/(auth)/invite/[token]/page");
    const splitPage = await import("@/app/(auth)/invite/split/[token]/page");
    const token = "tok_abcdefghijklmnopqrstuvwxyz0123";
    const ws = await workspacePage.generateMetadata({ params: Promise.resolve({ token }) });
    const sp = await splitPage.generateMetadata({ params: Promise.resolve({ token }) });
    expect(ws.alternates?.canonical).toBe(`/invite/${token}`);
    expect(sp.alternates?.canonical).toBe(`/invite/split/${token}`);
    expect((sp.openGraph as { url?: string }).url).toBe(`/invite/split/${token}`);
    for (const m of [ws, sp]) expect(m.robots).toEqual({ index: false, follow: false });
    expect(sp.title).toBe("Join a split group");
  });
});
