import { describe, it, expect } from "vitest";
import { GET as listGroups, POST as createGroup } from "@/app/api/v1/split/groups/route";
import {
  DELETE as deleteGroup,
  GET as getGroup,
  PATCH as patchGroup,
} from "@/app/api/v1/split/groups/[id]/route";
import { POST as addMembers } from "@/app/api/v1/split/groups/[id]/members/route";
import { DELETE as removeMember } from "@/app/api/v1/split/groups/[id]/members/[memberId]/route";
import { POST as leaveGroup } from "@/app/api/v1/split/groups/[id]/leave/route";
import { GET as listExpenses, POST as createExpense } from "@/app/api/v1/split/groups/[id]/expenses/route";
import {
  DELETE as deleteExpense,
  GET as getExpense,
  PUT as putExpense,
} from "@/app/api/v1/split/groups/[id]/expenses/[expenseId]/route";
import {
  GET as listSettlements,
  POST as recordSettlement,
} from "@/app/api/v1/split/groups/[id]/settlements/route";
import { DELETE as deleteSettlement } from "@/app/api/v1/split/groups/[id]/settlements/[settlementId]/route";
import { GET as listInvitations } from "@/app/api/v1/split/invitations/route";
import { POST as acceptInvitation } from "@/app/api/v1/split/invitations/[memberId]/accept/route";
import { POST as declineInvitation } from "@/app/api/v1/split/invitations/[memberId]/decline/route";
import { DELETE as deleteWorkspaceEntry, PUT as putWorkspaceEntry } from "@/app/api/v1/split/groups/[id]/expenses/[expenseId]/workspace-entry/route";
import { POST as addToWorkspace } from "@/app/api/v1/split/groups/[id]/expenses/[expenseId]/add-to-workspace/route";
import { firstProfileId, workspaceIdOf } from "../helpers/seed";
import { setSession, signInAs } from "../helpers/session";
import { bootstrapUser } from "../helpers/seed";
import { apiReq, ctx, jsonBody } from "./helpers";

type Envelope<T> = { data: T; meta?: Record<string, unknown>; error?: { code: string; message: string } };

async function json<T>(res: Response): Promise<{ status: number; body: Envelope<T> }> {
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

type Member = { id: string; name: string; email: string | null; status: string; isYou: boolean; balanceMinor: number; balance: string; inviteLink: string | null };
type Detail = { id: string; name: string; currency: string; me: { memberId: string; isCreator: boolean }; members: Member[]; suggestions: { fromMemberId: string; toMemberId: string; amountMinor: number; amount: string }[]; peopleCount: number; maxPeople: number };
type Added = { memberId: string; email: string; status: string };

async function newGroup(members: { email: string; name: string }[] = []) {
  await bootstrapUser("o");
  signInAs("o");
  const res = await json<{ group: Detail; added: Added[] }>(
    await createGroup(
      apiReq("/api/v1/split/groups", {
        method: "POST",
        body: jsonBody({ name: "Trip", currency: "JPY", members }),
      }),
    ),
  );
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("/api/v1/split", () => {
  it("401 without a bearer token", async () => {
    const res = await listGroups(apiReq("/api/v1/split/groups", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("creates, lists, reads, renames and deletes a group", async () => {
    const { group } = await newGroup();
    expect(group).toMatchObject({ name: "Trip", currency: "JPY", peopleCount: 1, maxPeople: 50 });
    expect(group.me.isCreator).toBe(true);

    const list = await json<{ id: string; myBalanceMinor: number; myBalance: string }[]>(
      await listGroups(apiReq("/api/v1/split/groups")),
    );
    expect(list.body.data).toEqual([expect.objectContaining({ id: group.id, myBalanceMinor: 0, myBalance: "0" })]);

    const patched = await json<Detail>(
      await patchGroup(
        apiReq(`/api/v1/split/groups/${group.id}`, { method: "PATCH", body: jsonBody({ name: "Tokyo" }) }),
        ctx({ id: group.id }),
      ),
    );
    expect(patched.body.data.name).toBe("Tokyo");

    const got = await json<Detail>(await getGroup(apiReq(`/api/v1/split/groups/${group.id}`), ctx({ id: group.id })));
    expect(got.body.data.name).toBe("Tokyo");

    const del = await deleteGroup(
      apiReq(`/api/v1/split/groups/${group.id}`, { method: "DELETE" }),
      ctx({ id: group.id }),
    );
    expect(del.status).toBe(200);
    const gone = await getGroup(apiReq(`/api/v1/split/groups/${group.id}`), ctx({ id: group.id }));
    expect(gone.status).toBe(404);
  });

  it("422 on a bad body, 404 for a stranger, and no email leaks to members", async () => {
    await bootstrapUser("o");
    signInAs("o");
    const bad = await json<unknown>(
      await createGroup(apiReq("/api/v1/split/groups", { method: "POST", body: jsonBody({ name: "" }) })),
    );
    expect(bad.status).toBe(422);

    const { group } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    await bootstrapUser("asha");
    signInAs("o");
    const added = await json<{ group: Detail; added: Added[] }>(
      await addMembers(
        apiReq(`/api/v1/split/groups/${group.id}/members`, {
          method: "POST",
          body: jsonBody({ members: [{ email: "asha@example.com", name: "Asha" }] }),
        }),
        ctx({ id: group.id }),
      ),
    );
    expect(added.body.data.added).toEqual([
      { memberId: expect.any(String), email: "asha@example.com", status: "invited" },
    ]);
    // Every pending person gets a link, account or not — nothing tells them apart.
    for (const m of added.body.data.group.members.filter((x) => x.status === "invited")) {
      expect(m.inviteLink).toMatch(/\/invite\/split\//);
    }
    expect(JSON.stringify(added.body)).not.toMatch(/in_app|invitedByEmail|canSendInviteEmail/);
    expect(added.body.data.group.members.map((m) => m.email)).toContain("zoe@example.com");

    signInAs("asha");
    const stranger = await getGroup(apiReq(`/api/v1/split/groups/${group.id}`), ctx({ id: group.id }));
    expect(stranger.status).toBe(404);

    const invitations = await json<{ memberId: string; groupName: string }[]>(
      await listInvitations(apiReq("/api/v1/split/invitations")),
    );
    expect(invitations.body.data).toEqual([expect.objectContaining({ groupName: "Trip" })]);
    expect(invitations.body.meta).toMatchObject({ total: 1, limit: 20, offset: 0 });
    expect(JSON.stringify(invitations.body)).not.toContain("@");

    const joined = await json<Detail>(
      await acceptInvitation(
        apiReq(`/api/v1/split/invitations/${invitations.body.data[0]!.memberId}/accept`, { method: "POST" }),
        ctx({ memberId: invitations.body.data[0]!.memberId }),
      ),
    );
    expect(joined.status).toBe(200);
    for (const m of joined.body.data.members) {
      expect(m.email).toBe(m.isYou ? "asha@example.com" : null);
      expect(m.inviteLink).toBeNull();
    }
    const body = JSON.stringify(joined.body);
    expect(body).not.toContain("zoe@example.com");
    expect(body).not.toContain("o@example.com");

    // Members can't manage.
    const forbidden = await patchGroup(
      apiReq(`/api/v1/split/groups/${group.id}`, { method: "PATCH", body: jsonBody({ name: "x" }) }),
      ctx({ id: group.id }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("expenses, payments, settle-up, remove and leave", async () => {
    const { group } = await newGroup();
    await bootstrapUser("asha");
    signInAs("o");
    const { body } = await json<{ group: Detail; added: Added[] }>(
      await addMembers(
        apiReq(`/api/v1/split/groups/${group.id}/members`, {
          method: "POST",
          body: jsonBody({ members: [{ email: "asha@example.com", name: "Asha" }] }),
        }),
        ctx({ id: group.id }),
      ),
    );
    const ashaId = body.data.added[0]!.memberId;
    signInAs("asha");
    await acceptInvitation(apiReq("/x", { method: "POST" }), ctx({ memberId: ashaId }));

    const ownerId = group.me.memberId;
    const created = await json<{ id: string; amount: string; shares: { amount: string; percent: number | null }[]; myShare: { amountMinor: number; amount: string } }>(
      await createExpense(
        apiReq(`/api/v1/split/groups/${group.id}/expenses`, {
          method: "POST",
          body: jsonBody({
            title: "Ramen",
            amount: 1001,
            paidBy: ashaId,
            occurredOn: "2026-10-01",
            splitType: "equal",
            memberIds: [ownerId, ashaId],
          }),
        }),
        ctx({ id: group.id }),
      ),
    );
    expect(created.status).toBe(201);
    // ¥1,001 two ways: the payer (Asha) takes the odd yen.
    expect(created.body.data).toMatchObject({ amount: "1001", myShare: { amountMinor: 501, amount: "501" } });

    const list = await json<unknown[]>(
      await listExpenses(apiReq(`/api/v1/split/groups/${group.id}/expenses?limit=1`), ctx({ id: group.id })),
    );
    expect(list.body.meta).toMatchObject({
      total: 1,
      limit: 1,
      offset: 0,
      currency: { code: "JPY", symbol: "¥", decimals: 0 },
    });

    const one = await getExpense(
      apiReq(`/api/v1/split/groups/${group.id}/expenses/${created.body.data.id}`),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    expect(one.status).toBe(200);

    const put = await json<{ amount: string; shares: { percent: number | null }[] }>(
      await putExpense(
        apiReq(`/api/v1/split/groups/${group.id}/expenses/${created.body.data.id}`, {
          method: "PUT",
          body: jsonBody({
            title: "Ramen",
            amount: 1000,
            paidBy: ashaId,
            occurredOn: "2026-10-01",
            splitType: "percent",
            shares: [
              { memberId: ownerId, percent: 25 },
              { memberId: ashaId, percent: 75 },
            ],
          }),
        }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      ),
    );
    expect(put.body.data.shares.map((s) => s.percent)).toEqual([25, 75]);

    // The creator owes Asha ¥250: remove/leave are blocked until it's paid.
    signInAs("o");
    const blocked = await json<unknown>(
      await removeMember(
        apiReq(`/api/v1/split/groups/${group.id}/members/${ashaId}`, { method: "DELETE" }),
        ctx({ id: group.id, memberId: ashaId }),
      ),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error!.code).toBe("settle_first");

    const detail = await json<Detail>(await getGroup(apiReq("/x"), ctx({ id: group.id })));
    expect(detail.body.data.suggestions).toEqual([
      { fromMemberId: ownerId, toMemberId: ashaId, amountMinor: 250, amount: "250" },
    ]);
    const paid = await json<{ id: string; amount: string }>(
      await recordSettlement(
        apiReq(`/api/v1/split/groups/${group.id}/settlements`, {
          method: "POST",
          body: jsonBody({ fromMemberId: ownerId, toMemberId: ashaId, amount: 250, settledOn: "2026-10-02" }),
        }),
        ctx({ id: group.id }),
      ),
    );
    expect(paid.status).toBe(201);
    expect(paid.body.data.amount).toBe("250");
    const payments = await json<unknown[]>(
      await listSettlements(apiReq(`/api/v1/split/groups/${group.id}/settlements`), ctx({ id: group.id })),
    );
    expect(payments.body.meta).toMatchObject({ total: 1, currency: { code: "JPY", decimals: 0 } });

    signInAs("asha");
    const left = await leaveGroup(apiReq("/x", { method: "POST" }), ctx({ id: group.id }));
    expect(left.status).toBe(200);

    signInAs("o");
    const undone = await deleteSettlement(
      apiReq("/x", { method: "DELETE" }),
      ctx({ id: group.id, settlementId: paid.body.data.id }),
    );
    expect(undone.status).toBe(200);
    const delExpense = await deleteExpense(
      apiReq("/x", { method: "DELETE" }),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    expect(delExpense.status).toBe(200);
  });

  it("several payers: `payers` in and out, the older `paidBy` still accepted", async () => {
    const { group } = await newGroup();
    await bootstrapUser("asha");
    signInAs("o");
    const { body } = await json<{ group: Detail; added: Added[] }>(
      await addMembers(
        apiReq(`/api/v1/split/groups/${group.id}/members`, {
          method: "POST",
          body: jsonBody({ members: [{ email: "asha@example.com", name: "Asha" }] }),
        }),
        ctx({ id: group.id }),
      ),
    );
    const ashaId = body.data.added[0]!.memberId;
    signInAs("asha");
    await acceptInvitation(apiReq("/x", { method: "POST" }), ctx({ memberId: ashaId }));
    signInAs("o");
    const ownerId = group.me.memberId;
    type Expense = {
      id: string;
      paidBy: { memberId: string };
      payers: { memberId: string; amountMinor: number; amount: string }[];
    };
    const post = (payload: Record<string, unknown>) =>
      createExpense(
        apiReq(`/api/v1/split/groups/${group.id}/expenses`, {
          method: "POST",
          body: jsonBody({
            title: "Hotel",
            amount: 3000,
            occurredOn: "2026-10-01",
            splitType: "equal",
            memberIds: [ownerId, ashaId],
            ...payload,
          }),
        }),
        ctx({ id: group.id }),
      );

    const created = await json<Expense>(
      await post({ payers: [{ memberId: ownerId, amount: 1000 }, { memberId: ashaId, amount: 2000 }] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.paidBy.memberId).toBe(ashaId);
    expect(created.body.data.payers).toEqual([
      { memberId: ashaId, name: "Asha", amountMinor: 2000, amount: "2000" },
      { memberId: ownerId, name: expect.any(String), amountMinor: 1000, amount: "1000" },
    ]);
    const detail = await json<Detail>(await getGroup(apiReq("/x"), ctx({ id: group.id })));
    expect(detail.body.data.members.find((m) => m.id === ashaId)!.balanceMinor).toBe(500);

    const single = await json<Expense>(await post({ paidBy: ownerId }));
    expect(single.body.data.payers).toEqual([expect.objectContaining({ memberId: ownerId, amountMinor: 3000 })]);

    const mismatch = await json<unknown>(
      await post({ payers: [{ memberId: ownerId, amount: 1000 }, { memberId: ashaId, amount: 1000 }] }),
    );
    expect(mismatch.status).toBe(422);
    const both = await json<unknown>(await post({ paidBy: ownerId, payers: [{ memberId: ashaId }] }));
    expect(both.status).toBe(422);
    const none = await json<unknown>(await post({}));
    expect(none.status).toBe(422);

    // An older client's PUT with one `paidBy` can't collapse the two payers into one.
    const put = (payload: Record<string, unknown>) =>
      putExpense(
        apiReq(`/api/v1/split/groups/${group.id}/expenses/${created.body.data.id}`, {
          method: "PUT",
          body: jsonBody({
            title: "Hotel",
            amount: 3000,
            occurredOn: "2026-10-01",
            splitType: "equal",
            memberIds: [ownerId, ashaId],
            ...payload,
          }),
        }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      );
    const collapsed = await json<unknown>(await put({ paidBy: ownerId }));
    expect(collapsed.status).toBe(422);
    expect(collapsed.body.error!.code).toBe("payers_required");
    const kept = await json<Expense>(await put({ paidBy: ashaId, title: "Hotel, 2 nights" }));
    expect(kept.status).toBe(200);
    expect(kept.body.data.payers.map((p) => p.amountMinor)).toEqual([2000, 1000]);
  });

  it("declines an invitation", async () => {
    const { group } = await newGroup();
    await bootstrapUser("asha");
    signInAs("o");
    const { body } = await json<{ added: Added[] }>(
      await addMembers(
        apiReq("/x", { method: "POST", body: jsonBody({ members: [{ email: "asha@example.com", name: "Asha" }] }) }),
        ctx({ id: group.id }),
      ),
    );
    signInAs("asha");
    const res = await declineInvitation(apiReq("/x", { method: "POST" }), ctx({ memberId: body.data.added[0]!.memberId }));
    expect(res.status).toBe(200);
    const again = await declineInvitation(apiReq("/x", { method: "POST" }), ctx({ memberId: body.data.added[0]!.memberId }));
    expect(again.status).toBe(404);
    setSession(null);
  });

  it("invite links are the creator's; add-to-workspace writes one transaction, and the entry can be updated", async () => {
    const { group } = await newGroup([{ email: "zoe@example.com", name: "Zoe" }]);
    const zoe = group.members.find((m) => m.name === "Zoe")!;
    expect(zoe.inviteLink).toMatch(/\/invite\/split\/[A-Za-z0-9_-]{32}$/);

    // Asha joins; she sees no links, no flags, no emails but her own.
    await bootstrapUser("asha");
    signInAs("o");
    const { body } = await json<{ added: Added[] }>(
      await addMembers(
        apiReq("/x", { method: "POST", body: jsonBody({ members: [{ email: "asha@example.com", name: "Asha" }] }) }),
        ctx({ id: group.id }),
      ),
    );
    const ashaId = body.data.added[0]!.memberId;
    signInAs("asha");
    const joined = await json<Detail>(await acceptInvitation(apiReq("/x", { method: "POST" }), ctx({ memberId: ashaId })));
    for (const m of joined.body.data.members) {
      expect(m.inviteLink).toBeNull();
    }

    // A JPY group, a USD workspace: the amount has to be confirmed.
    const created = await json<{ id: string }>(
      await createExpense(
        apiReq("/x", {
          method: "POST",
          body: jsonBody({
            title: "Sushi",
            amount: 3000,
            paidBy: group.me.memberId,
            occurredOn: "2026-10-01",
            splitType: "equal",
            memberIds: [group.me.memberId, ashaId],
          }),
        }),
        ctx({ id: group.id }),
      ),
    );
    const workspaceId = await workspaceIdOf("asha");
    const profileId = await firstProfileId("asha");
    const headers = { "x-workspace-id": workspaceId };
    const missing = await json<unknown>(
      await addToWorkspace(
        apiReq("/x", { method: "POST", headers, body: jsonBody({ profileId }) }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      ),
    );
    expect(missing.status).toBe(422);
    expect(missing.body.error!.code).toBe("amount_required");

    const added = await json<{ amountMinor: number; type: string; profile: { id: string } }>(
      await addToWorkspace(
        apiReq("/x", { method: "POST", headers, body: jsonBody({ profileId, amount: 9.85 }) }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      ),
    );
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ amountMinor: 985, type: "expense", profile: { id: profileId } });

    const twice = await addToWorkspace(
      apiReq("/x", { method: "POST", headers, body: jsonBody({ profileId, amount: 9.85 }) }),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    expect(twice.status).toBe(409);

    // The creator raises the bill; Asha's share changes and her entry follows.
    signInAs("o");
    await putExpense(
      apiReq("/x", {
        method: "PUT",
        body: jsonBody({
          title: "Sushi",
          amount: 4000,
          paidBy: group.me.memberId,
          occurredOn: "2026-10-01",
          splitType: "equal",
          memberIds: [group.me.memberId, ashaId],
        }),
      }),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    signInAs("asha");
    const changed = await json<{ myShare: { changedSinceAdded: boolean } }>(
      await getExpense(apiReq("/x"), ctx({ id: group.id, expenseId: created.body.data.id })),
    );
    expect(changed.body.data.myShare.changedSinceAdded).toBe(true);
    const needsAmount = await json<unknown>(
      await putWorkspaceEntry(
        apiReq("/x", { method: "PUT", body: jsonBody({}) }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      ),
    );
    expect(needsAmount.status).toBe(422);
    const entry = await json<{ amountMinor: number }>(
      await putWorkspaceEntry(
        apiReq("/x", { method: "PUT", body: jsonBody({ amount: 13.1 }) }),
        ctx({ id: group.id, expenseId: created.body.data.id }),
      ),
    );
    expect(entry.status).toBe(200);
    expect(entry.body.data.amountMinor).toBe(1310);

    // Taken off the expense, she removes the entry from her workspace.
    signInAs("o");
    await putExpense(
      apiReq("/x", {
        method: "PUT",
        body: jsonBody({
          title: "Sushi",
          amount: 4000,
          paidBy: group.me.memberId,
          occurredOn: "2026-10-01",
          splitType: "equal",
          memberIds: [group.me.memberId],
        }),
      }),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    signInAs("asha");
    const removed = await deleteWorkspaceEntry(
      apiReq("/x", { method: "DELETE" }),
      ctx({ id: group.id, expenseId: created.body.data.id }),
    );
    expect(removed.status).toBe(200);
  });
});
