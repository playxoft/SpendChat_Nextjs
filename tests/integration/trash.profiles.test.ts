import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq, sql } from "drizzle-orm";
import { deleteObjects, deleteObject } from "@/lib/r2";
import {
  files,
  profileAccess,
  profiles,
  spaceMembers,
  transactions,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { createProfile, deleteProfile, listProfiles } from "@/services/profiles";
import { deleteTransaction } from "@/services/transactions";
import { createSpace, deleteSpace, getSpaceAccess, listSpaces } from "@/services/spaces";
import { createWorkspace, listCollaborators, listWorkspaceProfileGrants } from "@/services/workspaces";
import { createFileShare, resolveShare } from "@/services/files";
import {
  countTrash,
  deleteFromTrash,
  emptyTrash,
  listTrashProfiles,
  restoreFromTrash,
} from "@/services/trash";
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
  /**
   * S2: a trashed profile restored later shows to whoever is in the space it
   * sits in. Moving it out of a deleted space into "the first other space"
   * without asking quietly decided who would see it — reproduced in review. So
   * any profile left in the space, trashed ones included, needs a destination
   * the admin picks.
   */
  it("won't delete without a destination for them, then moves them where it was told", async () => {
    await setWorkspacePlan(W, "plus"); // room for a third space
    const other = (await createSpace(U, W, { name: "Other" })).id;
    const third = (await createSpace(U, W, { name: "Third" })).id;
    const [{ id: inOther }] = await getTestDb()
      .insert(profiles)
      .values({ userId: U, workspaceId: W, spaceId: other, name: "Side" })
      .returning({ id: profiles.id });
    await deleteProfile(U, inOther);
    expect((await listSpaces(U, W)).find((s) => s.id === other)).toMatchObject({
      profileCount: 0,
      trashedProfileCount: 1,
    });

    await expect(deleteSpace(U, other)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("people in that space will see them"),
    });
    expect((await profileRow(inOther))!.spaceId).toBe(other);

    await deleteSpace(U, other, { moveProfilesTo: third });
    expect((await profileRow(inOther))!.spaceId).toBe(third);
    expect((await restoreFromTrash(U, W, { profileIds: [inOther] })).counts.profiles).toBe(1);
  });

  it("only live profiles need room in the destination", async () => {
    const other = (await createSpace(U, W, { name: "Other" })).id;
    // Main holds Personal + two more = full on Free (3 per space).
    await seedProfile("a", "Two");
    await seedProfile("a", "Three");
    const [{ id: trashed }] = await getTestDb()
      .insert(profiles)
      .values({ userId: U, workspaceId: W, spaceId: other, name: "Side" })
      .returning({ id: profiles.id });
    await deleteProfile(U, trashed);
    // Main is full, but the only profile moving is in the trash — it fits.
    await deleteSpace(U, other, { moveProfilesTo: space });
    expect((await profileRow(trashed))!.spaceId).toBe(space);
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

describe("a view-only workspace (S3)", () => {
  /** An extra free workspace of "a" with a trashed profile in it, made view-only. */
  async function viewOnlyWithTrashedProfile() {
    await setWorkspacePlan(W, "plus");
    const W2 = (await createWorkspace(U, { name: "Second" })).id;
    await getTestDb()
      .update(workspaces)
      .set({ createdAt: sql`now() + interval '1 minute'` })
      .where(eq(workspaces.id, W2));
    const [{ id: spare }] = await getTestDb()
      .insert(profiles)
      .values({ userId: U, workspaceId: W2, spaceId: await defaultSpaceIdOf(W2), name: "Spare" })
      .returning({ id: profiles.id });
    expect(await deleteProfile(U, spare)).toBe(true);
    await setWorkspacePlan(W, "free"); // W2 is now the extra free one — view-only
    return { W2, spare };
  }

  it("refuses to delete a trashed profile for good, or empty its trash, through the admin path", async () => {
    const { W2, spare } = await viewOnlyWithTrashedProfile();
    await expect(deleteFromTrash(U, W2, { profileIds: [spare] })).rejects.toMatchObject({
      status: 403,
      code: "plan_limit",
    });
    await expect(emptyTrash(U, W2)).rejects.toMatchObject({ status: 403, code: "plan_limit" });
    // Nothing to offer, so "Empty trash" isn't offered either.
    expect(await countTrash(U, W2)).toEqual({ transactions: 0, files: 0, folders: 0, profiles: 0 });
    expect((await profileRow(spare))!.deletedAt).toBeInstanceOf(Date);
  });
});

describe("Free's default delete (S4)", () => {
  /**
   * `reject` is what a client gets by saying nothing, so it must never destroy
   * anything. On Free deleting a profile deletes its vault for good, so
   * `reject` refuses while live files remain — they'd be gone unasked.
   */
  it("refuses while live files would be deleted for good; an explicit delete still works", async () => {
    const work = await seedProfile("a", "Work");
    await seedFile("a", work, { key: "vault/keep-me.pdf" });
    await expect(deleteProfile(U, work)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("deleted for good"),
    });
    expect((await profileRow(work))!.deletedAt).toBeNull();
    expect(swept()).toHaveLength(0);
    expect(await deleteProfile(U, work, { transactions: "delete" })).toBe(true);
    expect(swept()).toContain("vault/keep-me.pdf");
  });

  it("on Plus the default goes through — the files go to the trash with the profile", async () => {
    await setWorkspacePlan(W, "plus");
    const work = await seedProfile("a", "Work");
    await seedFile("a", work);
    expect(await deleteProfile(U, work)).toBe(true);
    expect(swept()).toHaveLength(0);
  });
});

describe("restoring several profiles at once (C9)", () => {
  it("checks them all against the caps together — two into a space with one place left restores neither", async () => {
    // Free: 3 per space. Personal + A + B; trash A and B; add C → one place left.
    const a = await seedProfile("a", "A");
    const b = await seedProfile("a", "B");
    await deleteProfile(U, a);
    await deleteProfile(U, b);
    await seedProfile("a", "C");
    await expect(restoreFromTrash(U, W, { profileIds: [a, b] })).rejects.toMatchObject({
      status: 403,
      code: "plan_limit",
    });
    expect((await profileRow(a))!.deletedAt).toBeInstanceOf(Date);
    expect((await profileRow(b))!.deletedAt).toBeInstanceOf(Date);
    // One of them fits.
    expect((await restoreFromTrash(U, W, { profileIds: [a] })).counts.profiles).toBe(1);
  });

  it("restores several that fit, renaming any whose name was taken", async () => {
    await setWorkspacePlan(W, "plus");
    const a = (await createProfile(U, W, { name: "Home" })).id;
    const b = (await createProfile(U, W, { name: "Trips" })).id;
    await deleteProfile(U, a);
    await deleteProfile(U, b);
    await createProfile(U, W, { name: "Home" });
    const res = await restoreFromTrash(U, W, { profileIds: [a, b] });
    expect(res.counts.profiles).toBe(2);
    expect((await profileRow(a))!.name).toBe("Home (restored)");
    expect((await profileRow(b))!.name).toBe("Trips");
  });
});

describe("listing trashed profiles (C10)", () => {
  it("names the deleter in the shared shape, and sizes everything stored under it", async () => {
    await setWorkspacePlan(W, "plus");
    const work = await seedProfile("a", "Work");
    const txn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01", profileId: work });
    await seedReceipt("a", txn, work, { sizeBytes: 300 });
    await seedFile("a", work, { sizeBytes: 700 });
    await deleteProfile(U, work, { transactions: "delete" });
    const [listed] = await listTrashProfiles(U, W);
    expect(listed).toMatchObject({
      id: work,
      transactions: 1,
      files: 1,
      sizeBytes: 1000,
      deletedBy: { id: U },
    });
  });
});
