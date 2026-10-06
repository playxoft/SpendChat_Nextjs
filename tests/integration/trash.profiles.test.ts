import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq } from "drizzle-orm";
import { deleteObjects, deleteObject } from "@/lib/r2";
import { files, profileAccess, profiles, spaceMembers, transactions, workspaceMembers } from "@/db/schema";
import { createProfile, deleteProfile, listProfiles } from "@/services/profiles";
import { deleteTransaction } from "@/services/transactions";
import { createSpace, deleteSpace, getSpaceAccess, listSpaces } from "@/services/spaces";
import { listCollaborators, listWorkspaceProfileGrants } from "@/services/workspaces";
import { createFileShare, resolveShare } from "@/services/files";
import { deleteFromTrash, listTrashProfiles, restoreFromTrash } from "@/services/trash";
import {
  accessibleProfileIds,
  getEffectiveProfileRole,
  listUserWorkspaces,
  profileRolesFor,
  requireSharedListEdit,
  sharedListAccess,
} from "@/lib/workspaces";
import { countMembers, countProfilesInSpace, getAddLimits, getUsage } from "@/lib/entitlements";
import { getProfiles, getTransactionById, listTrashedTransactions } from "@/lib/queries";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";
import { seedFile, seedProfile, seedReceipt } from "./helpers/vault-seed";

const swept = () => [
  ...vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => [...(keys ?? [])]),
  ...vi.mocked(deleteObject).mock.calls.map(([key]) => key),
];
const profileRow = async (id: string) =>
  (await getTestDb().select().from(profiles).where(eq(profiles.id, id)))[0];

let U: string;
let W: string;
let personal: string;
let space: string;

beforeEach(async () => {
  vi.mocked(deleteObjects).mockClear();
  vi.mocked(deleteObject).mockClear();
  signInAs("a");
  await bootstrapUser("a");
  U = uid("a");
  W = await workspaceIdOf("a");
  personal = await firstProfileId("a");
  space = await defaultSpaceIdOf(W);
});

/** A non-admin workspace member who is in the default space as an editor. */
async function spaceEditor(alias: string) {
  await bootstrapUser(alias);
  await getTestDb().insert(workspaceMembers).values({ workspaceId: W, userId: uid(alias), role: "editor" });
  await getTestDb().insert(spaceMembers).values({ spaceId: space, userId: uid(alias), role: "editor" });
  return uid(alias);
}

describe("a trashed profile disappears from access and every list", () => {
  it("accessibleProfileIds and getEffectiveProfileRole skip it — for the admin and a member", async () => {
    const work = await seedProfile("a", "Work");
    const member = await spaceEditor("m");
    expect((await accessibleProfileIds(member, W)).map((r) => r.id)).toContain(work);
    expect(await getEffectiveProfileRole(member, work)).toMatchObject({ role: "editor" });

    expect(await deleteProfile(U, work)).toBe(true);

    for (const who of [U, member]) {
      expect((await accessibleProfileIds(who, W)).map((r) => r.id)).not.toContain(work);
      expect((await accessibleProfileIds(who, W, "editor")).map((r) => r.id)).not.toContain(work);
      expect(await getEffectiveProfileRole(who, work)).toBeNull();
      expect((await profileRolesFor(who, W)).has(work)).toBe(false);
    }
  });

  it("profile lists: sidebar, API, spaces, space access, grants", async () => {
    const work = await seedProfile("a", "Work");
    await bootstrapUser("g");
    await getTestDb().insert(profileAccess).values({ profileId: work, userId: uid("g"), role: "viewer" });
    await deleteProfile(U, work);

    expect((await getProfiles(U, W)).map((p) => p.id)).not.toContain(work);
    expect((await listProfiles(U, W)).map((p) => p.id)).not.toContain(work);
    expect((await listSpaces(U, W)).find((s) => s.id === space)?.profileCount).toBe(1);
    expect((await getSpaceAccess(U, space)).profiles.map((p) => p.id)).not.toContain(work);
    expect((await listWorkspaceProfileGrants(U, W)).map((g) => g.profileId)).not.toContain(work);
    expect((await listCollaborators(U, W)).map((c) => c.userId)).not.toContain(uid("g"));
    // Someone who could only reach the workspace through it no longer sees it.
    expect((await listUserWorkspaces(uid("g"))).map((w) => w.id)).not.toContain(W);
  });

  it("frees its place in the space and its grant-only people's seats", async () => {
    const work = await seedProfile("a", "Work");
    await bootstrapUser("g");
    await getTestDb().insert(profileAccess).values({ profileId: work, userId: uid("g"), role: "viewer" });
    expect(await countProfilesInSpace(space)).toBe(2);
    expect(await countMembers(W)).toBe(2);

    await deleteProfile(U, work);

    expect(await countProfilesInSpace(space)).toBe(1);
    expect(await countMembers(W)).toBe(1);
    expect((await getAddLimits(W, U)).members.used).toBe(1);
    expect((await getUsage(W)).members.used).toBe(1);
  });

  it("doesn't lock non-admin editors out of the shared lists", async () => {
    const work = await seedProfile("a", "Work");
    const member = await spaceEditor("m");
    await deleteProfile(U, work);
    // The member can write every *live* profile; the trashed one isn't theirs
    // to write, and must not count against "every profile".
    await expect(requireSharedListEdit(member, W)).resolves.toBeUndefined();
    expect(await sharedListAccess(member, W)).toEqual({ canAdd: true, canEdit: true });
  });

  it("share links into it stop working, and work again after restore", async () => {
    await setWorkspacePlan(W, "plus");
    const work = await seedProfile("a", "Work");
    const file = await seedFile("a", work);
    const { token } = await createFileShare(U, W, { fileId: file });
    await deleteProfile(U, work, { transactions: "delete" });
    expect(await resolveShare(token)).toBeNull();
    await restoreFromTrash(U, W, { profileIds: [work] });
    expect((await resolveShare(token))?.kind).toBe("file");
  });
});

describe("deleting a profile sends it to the trash as one unit", () => {
  it("delete: its transactions stay with it, restorable together; earlier trash stays trash", async () => {
    const work = await seedProfile("a", "Work");
    const kept = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: work });
    const before = await insertTxn("a", { type: "expense", amountMinor: 200, occurredOn: "2026-06-01", profileId: work });
    await seedReceipt("a", kept, work, { key: "attachments/kept.pdf" });
    expect(await deleteTransaction(U, W, before)).toBe(true);

    expect(await deleteProfile(U, work, { transactions: "delete" })).toBe(true);
    expect((await profileRow(work))!.deletedBy).toBe(U);
    // The profile's own rows are hidden *by the profile*, not stamped themselves.
    const [k] = await getTestDb().select().from(transactions).where(eq(transactions.id, kept));
    expect(k!.deletedAt).toBeNull();
    expect(await getTransactionById(U, W, kept)).toBeNull();
    // The trash shows the profile (admins), not its rows.
    expect((await listTrashProfiles(U, W)).map((p) => [p.id, p.transactions])).toEqual([[work, 1]]);
    expect(await listTrashedTransactions(U, W)).toEqual([]);

    const res = await restoreFromTrash(U, W, { profileIds: [work] });
    expect(res.counts.profiles).toBe(1);
    expect((await getTransactionById(U, W, kept))?.attachments).toHaveLength(1);
    // The row trashed on its own before the profile went is still in the trash.
    expect(await getTransactionById(U, W, before)).toBeNull();
    expect((await listTrashedTransactions(U, W)).map((r) => r.id)).toEqual([before]);
    expect(swept()).toHaveLength(0);
  });

  it("reject (the default) refuses while live rows remain, but not for rows already trashed", async () => {
    const work = await seedProfile("a", "Work");
    const id = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: work });
    await expect(deleteProfile(U, work)).rejects.toMatchObject({ status: 409 });
    await deleteTransaction(U, W, id);
    expect(await deleteProfile(U, work)).toBe(true);
  });

  it("move: live and trashed rows move; the empty profile goes to the trash", async () => {
    const work = await seedProfile("a", "Work");
    const liveRow = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01", profileId: work });
    const trashedRow = await insertTxn("a", { type: "expense", amountMinor: 2, occurredOn: "2026-06-01", profileId: work });
    await deleteTransaction(U, W, trashedRow);

    expect(await deleteProfile(U, work, { transactions: "move", toProfileId: personal })).toBe(true);
    const moved = await getTestDb().select().from(transactions).where(eq(transactions.profileId, personal));
    expect(moved.map((r) => r.id).sort()).toEqual([liveRow, trashedRow].sort());
    // Still trashed, now restorable into the destination.
    expect((await listTrashedTransactions(U, W)).map((r) => [r.id, r.profileId])).toEqual([[trashedRow, personal]]);
    expect((await profileRow(work))!.deletedAt).toBeInstanceOf(Date);
    expect((await listTrashProfiles(U, W)).find((p) => p.id === work)?.transactions).toBe(0);
  });

  it("Plus keeps the vault with the trashed profile; restoring brings it back", async () => {
    await setWorkspacePlan(W, "plus");
    const work = await seedProfile("a", "Work");
    const file = await seedFile("a", work, { key: "vault/keep.pdf" });
    await deleteProfile(U, work, { transactions: "delete" });
    expect(await getTestDb().select().from(files).where(eq(files.id, file))).toHaveLength(1);
    expect(swept()).toHaveLength(0);
    await restoreFromTrash(U, W, { profileIds: [work] });
    expect((await accessibleProfileIds(U, W)).map((r) => r.id)).toContain(work);
  });

  it("the last live profile can't go, whatever is in the trash", async () => {
    const work = await seedProfile("a", "Work");
    await deleteProfile(U, work);
    await expect(deleteProfile(U, personal)).rejects.toMatchObject({ status: 409 });
  });
});

describe("restoring a profile", () => {
  it("frees the name for reuse while trashed, and renames the restored one on a clash", async () => {
    const work = (await createProfile(U, W, { name: "Home" })).id;
    await deleteProfile(U, work);
    const again = (await createProfile(U, W, { name: "Home" })).id;
    expect(again).not.toBe(work);

    await restoreFromTrash(U, W, { profileIds: [work] });
    expect((await profileRow(work))!.name).toBe("Home (restored)");
    expect((await profileRow(again))!.name).toBe("Home");
  });

  it("pays the space's profile cap — a full space refuses with plan_limit, restoring nothing", async () => {
    // Free: 3 profiles per space. Personal + Work + Spare = full.
    const work = await seedProfile("a", "Work");
    await seedProfile("a", "Spare");
    const stray = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await deleteTransaction(U, W, stray);
    await deleteProfile(U, work);
    await seedProfile("a", "Filler"); // the freed place, taken

    await expect(
      restoreFromTrash(U, W, { profileIds: [work], transactionIds: [stray] }),
    ).rejects.toMatchObject({ status: 403, code: "plan_limit" });
    expect((await profileRow(work))!.deletedAt).toBeInstanceOf(Date);
    // Checked before anything else in the request was restored.
    expect(await getTransactionById(U, W, stray)).toBeNull();
  });

  it("pays the member cap for the people it brings back", async () => {
    // Free: 3 members. A grant-only person on Work stops counting while Work is
    // in the trash; two members fill the seats; restoring Work would make four.
    const work = await seedProfile("a", "Work");
    await bootstrapUser("g");
    await getTestDb().insert(profileAccess).values({ profileId: work, userId: uid("g"), role: "viewer" });
    await deleteProfile(U, work);
    await spaceEditor("m1");
    await spaceEditor("m2");
    expect(await countMembers(W)).toBe(3);

    await expect(restoreFromTrash(U, W, { profileIds: [work] })).rejects.toMatchObject({
      status: 403,
      code: "plan_limit",
    });
    await setWorkspacePlan(W, "plus"); // 5 members
    expect((await restoreFromTrash(U, W, { profileIds: [work] })).counts.profiles).toBe(1);
    expect(await countMembers(W)).toBe(4);
  });

  it("is for workspace admins only", async () => {
    const work = await seedProfile("a", "Work");
    const member = await spaceEditor("m");
    await deleteProfile(U, work);
    expect(await listTrashProfiles(member, W)).toEqual([]);
    expect((await restoreFromTrash(member, W, { profileIds: [work] })).counts.profiles).toBe(0);
    expect((await deleteFromTrash(member, W, { profileIds: [work] })).counts.profiles).toBe(0);
    expect((await profileRow(work))!.deletedAt).toBeInstanceOf(Date);
  });
});

describe("a space with trashed profiles in it", () => {
  it("still deletes — its trashed profiles move along, restorable into the new space", async () => {
    const other = (await createSpace(U, W, { name: "Other" })).id;
    const [{ id: inOther }] = await getTestDb()
      .insert(profiles)
      .values({ userId: U, workspaceId: W, spaceId: other, name: "Side" })
      .returning({ id: profiles.id });
    await deleteProfile(U, inOther);

    // No live profiles left, so no destination is needed.
    await deleteSpace(U, other);
    expect((await profileRow(inOther))!.spaceId).toBe(space);
    expect((await restoreFromTrash(U, W, { profileIds: [inOther] })).counts.profiles).toBe(1);
  });
});

describe("delete a trashed profile for good", () => {
  it("destroys everything in it and sweeps its stored files", async () => {
    await setWorkspacePlan(W, "plus");
    const work = await seedProfile("a", "Work");
    const txn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01", profileId: work });
    await seedReceipt("a", txn, work, { key: "attachments/gone.pdf" });
    await seedFile("a", work, { key: "vault/gone.pdf" });
    await deleteProfile(U, work, { transactions: "delete" });

    const res = await deleteFromTrash(U, W, { profileIds: [work] });
    expect(res.counts.profiles).toBe(1);
    expect(await profileRow(work)).toBeUndefined();
    expect(await getTestDb().select().from(transactions).where(eq(transactions.id, txn))).toHaveLength(0);
    expect(swept()).toEqual(expect.arrayContaining(["attachments/gone.pdf", "vault/gone.pdf"]));
  });
});
