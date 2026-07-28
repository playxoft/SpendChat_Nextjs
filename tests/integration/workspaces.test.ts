import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  profileAccess,
  userSettings,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { getCategories, getProfiles } from "@/lib/queries";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { deleteAllTransactions } from "@/services/settings";
import { createTransaction, deleteTransaction } from "@/services/transactions";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  countTxns,
  firstProfileId,
  insertTxn,
  workspaceIdOf,
} from "./helpers/seed";

const db = () => getTestDb();

describe("bootstrap workspaces", () => {
  it("creates a default workspace named from the auth directory", async () => {
    await bootstrapUser("ann");
    const [row] = await db()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("ann")));
    expect(row.name).toBe("ann's Workspace");
    // A new workspace is seeded with the default emoji.
    expect(row.icon).toBe("🏢");

    const [member] = await db()
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, uid("ann")));
    expect(member.role).toBe("admin");
    expect(member.workspaceId).toBe(row.id);

    const [settings] = await db()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("ann")));
    expect(settings.lastWorkspaceId).toBe(row.id);
  });

  it("falls back to a generic name when the directory has no entry", async () => {
    await ensureBootstrap(uid("ghost")); // never registered in neon_auth
    const [row] = await db()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("ghost")));
    expect(row.name).toBe("My Workspace");
  });
});

describe("members & RBAC", () => {
  async function setup() {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    return workspaceIdOf("a");
  }

  it("adds a registered user directly, with the chosen role", async () => {
    const W = await setup();
    const res = await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "viewer" } });
    expect(res.status).toBe("added");

    const members = await ws.listMembers(uid("b"), W);
    expect(members.map((m) => m.role).sort()).toEqual(["admin", "viewer"]);
    // b sees a's workspace in their list now.
    const list = await ws.listWorkspaces(uid("b"));
    expect(list.some((w) => w.id === W)).toBe(true);
  });

  it("viewer can read but not write; editor can write", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "viewer" } });
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });

    // Viewer sees the workspace's profiles…
    expect((await getProfiles(uid("b"), W)).length).toBeGreaterThan(0);
    // …but cannot add transactions.
    await expect(
      createTransaction(uid("b"), W, {
        type: "expense",
        amount: 1,
        occurredOn: "2026-06-01",
      }),
    ).rejects.toMatchObject({ status: 403 });

    // Upgrade to editor: writes now succeed.
    await ws.updateMemberRole(uid("a"), W, { userId: uid("b"), role: "editor" });
    const created = await createTransaction(uid("b"), W, {
      type: "expense",
      amount: 2,
      occurredOn: "2026-06-02",
    });
    expect(created.amountMinor).toBe(200);
    // …and editors can delete inside the shared profile.
    expect(await deleteTransaction(uid("b"), W, created.id)).toBe(true);
  });

  it("non-members see nothing in the workspace", async () => {
    const W = await setup();
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    expect(await getProfiles(uid("b"), W)).toEqual([]);
  });

  it("the owner cannot be demoted or removed", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "admin" } });
    await expect(
      ws.updateMemberRole(uid("b"), W, { userId: uid("a"), role: "viewer" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(ws.removeMember(uid("b"), W, uid("a"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("members can leave; removal clears their last-open pointer", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "editor" } });
    await ws.switchWorkspace(uid("b"), W);
    await ws.removeMember(uid("b"), W, uid("b")); // self-leave
    const [settings] = await db()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("b")));
    expect(settings.lastWorkspaceId).toBeNull();
    expect((await ws.listWorkspaces(uid("b"))).some((w) => w.id === W)).toBe(false);
  });

  it("non-admins cannot manage members or rename", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "editor" } });
    await expect(
      ws.addMember(uid("b"), W, { email: "c@example.com", access: { mode: "all", role: "viewer" } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ws.updateWorkspace(uid("b"), W, { name: "Taken over" }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("admins can rename the workspace and set its icon", async () => {
    const W = await setup();
    await ws.updateWorkspace(uid("a"), W, { name: "Family budget", icon: "🏠" });
    const [row] = await db().select().from(workspaces).where(eq(workspaces.id, W));
    expect(row.name).toBe("Family budget");
    expect(row.icon).toBe("🏠");
  });

  it("clears the icon when passed an empty string", async () => {
    const W = await setup();
    await ws.updateWorkspace(uid("a"), W, { name: "Family budget", icon: "" });
    const [row] = await db().select().from(workspaces).where(eq(workspaces.id, W));
    expect(row.icon).toBeNull();
  });
});

describe("per-profile grants", () => {
  it("grants access to a single profile only", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    const personal = await firstProfileId("a");
    // A second profile the grantee should NOT see.
    const { createProfile } = await import("@/services/profiles");
    const hidden = await createProfile(uid("a"), W, { name: "Secret" });

    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "profiles", entries: [{ profileId: personal, role: "editor" }] },
    });

    const visible = await getProfiles(uid("b"), W);
    expect(visible.map((p) => p.id)).toEqual([personal]);
    expect(visible.some((p) => p.id === hidden.id)).toBe(false);

    // The grant carries the editor role on that profile.
    const created = await createTransaction(uid("b"), W, {
      type: "income",
      amount: 3,
      occurredOn: "2026-06-01",
      profileId: personal,
    });
    expect(created.profileId).toBe(personal);

    // The workspace shows up as grant-only (role null) in b's switcher list.
    const list = await ws.listWorkspaces(uid("b"));
    expect(list.find((w) => w.id === W)?.role).toBeNull();

    // Revoking removes visibility.
    await ws.removeProfileAccess(uid("a"), personal, uid("b"));
    expect(await getProfiles(uid("b"), W)).toEqual([]);
  });
});

describe("invites", () => {
  it("unknown emails get an invite that converts at first bootstrap", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    const res = await ws.addMember(uid("a"), W, {
      email: "c@example.com",
      access: { mode: "all", role: "editor" },
    });
    expect(res.status).toBe("invited");
    expect(await ws.listInvites(uid("a"), W)).toHaveLength(1);

    // c signs up later — the invite converts into a membership.
    await bootstrapUser("c");
    const [member] = await db()
      .select()
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, W), eq(workspaceMembers.userId, uid("c"))),
      );
    expect(member.role).toBe("editor");
    expect(await ws.listInvites(uid("a"), W)).toHaveLength(0);
  });

  it("profile-scoped invites convert into profile grants", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    const personal = await firstProfileId("a");

    await ws.addMember(uid("a"), W, {
      email: "d@example.com",
      access: { mode: "profiles", entries: [{ profileId: personal, role: "viewer" }] },
    });
    await bootstrapUser("d");

    const [grant] = await db()
      .select()
      .from(profileAccess)
      .where(
        and(eq(profileAccess.profileId, personal), eq(profileAccess.userId, uid("d"))),
      );
    expect(grant.role).toBe("viewer");
  });

  it("admins can cancel a pending invite", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await ws.addMember(uid("a"), W, { email: "e@example.com", access: { mode: "all", role: "viewer" } });
    await ws.cancelInviteByEmail(uid("a"), W, "e@example.com");
    expect(await ws.listInvites(uid("a"), W)).toHaveLength(0);
  });
});

describe("create & switch workspaces", () => {
  it("a user can create additional workspaces and switch between them", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const home = await workspaceIdOf("a");

    const created = await ws.createWorkspace(uid("a"), { name: "Side project", icon: "🚀" });
    expect(created.role).toBe("admin");
    expect(created.icon).toBe("🚀");

    // Creating switches to it; it gets its own default profile.
    let [settings] = await db()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("a")));
    expect(settings.lastWorkspaceId).toBe(created.id);
    expect((await getProfiles(uid("a"), created.id)).map((p) => p.name)).toEqual([
      "Personal",
    ]);

    // ...and its own full default category list (workspace-scoped, shared).
    const newCats = await getCategories(created.id);
    expect(newCats).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(new Set(newCats.map((c) => `${c.kind}:${c.name}`))).toEqual(
      new Set(DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name}`)),
    );

    await ws.switchWorkspace(uid("a"), home);
    [settings] = await db()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("a")));
    expect(settings.lastWorkspaceId).toBe(home);

    // Switching to an inaccessible workspace is a 404.
    await bootstrapUser("b");
    const foreign = await workspaceIdOf("b");
    await expect(ws.switchWorkspace(uid("a"), foreign)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deleteAllTransactions (admin, profile-scoped)", () => {
  it("admins wipe every transaction in the chosen profiles; non-admins are refused", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    await ws.addMember(uid("a"), W, { email: "b@example.com", access: { mode: "all", role: "editor" } });
    const sharedProfile = await firstProfileId("a");
    const { createProfile } = await import("@/services/profiles");
    const other = await createProfile(uid("a"), W, { name: "Other" });

    // Both members author rows in the shared profile; a also has one in `other`.
    await insertTxn("b", {
      type: "expense",
      amountMinor: 100,
      occurredOn: "2026-06-01",
      profileId: sharedProfile,
    });
    await insertTxn("a", {
      type: "expense",
      amountMinor: 200,
      occurredOn: "2026-06-01",
      profileId: sharedProfile,
    });
    await insertTxn("a", {
      type: "expense",
      amountMinor: 300,
      occurredOn: "2026-06-01",
      profileId: other.id,
    });

    // An editor can't clear transactions — it's an admin-only action.
    await expect(
      deleteAllTransactions(uid("b"), W, "DELETE", [sharedProfile]),
    ).rejects.toMatchObject({ status: 403 });

    // Admin clears just the shared profile: BOTH authors' rows go (2), and the
    // `other` profile is untouched.
    expect(await deleteAllTransactions(uid("a"), W, "DELETE", [sharedProfile])).toEqual({
      deleted: 2,
    });
    expect(await countTxns("a")).toBe(1); // a's row in `other` survives
    expect(await countTxns("b")).toBe(0); // b's shared-profile row is gone
  });

  it("empty profileIds clears every profile in the workspace", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    const p1 = await firstProfileId("a");
    const { createProfile } = await import("@/services/profiles");
    const p2 = await createProfile(uid("a"), W, { name: "Second" });
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: p1 });
    await insertTxn("a", { type: "expense", amountMinor: 200, occurredOn: "2026-06-01", profileId: p2.id });

    expect(await deleteAllTransactions(uid("a"), W, "DELETE", [])).toEqual({ deleted: 2 });
    expect(await countTxns("a")).toBe(0);
  });

  it("rejects a wrong confirmation string", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await expect(deleteAllTransactions(uid("a"), W, "nope", [])).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("invite email rate limiting", () => {
  it("caps user-triggered invite emails per hour (429 past the cap)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");

    for (let i = 0; i < 20; i++) {
      const res = await ws.addMember(uid("a"), W, {
        email: `guest${i}@example.com`,
        access: { mode: "all", role: "viewer" },
      });
      expect(res.status).toBe("invited");
    }
    await expect(
      ws.addMember(uid("a"), W, {
        email: "one-too-many@example.com",
        access: { mode: "all", role: "viewer" },
      }),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });
});

describe("multi-profile access", () => {
  async function twoProfiles() {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    const personal = await firstProfileId("a");
    const { createProfile } = await import("@/services/profiles");
    const business = await createProfile(uid("a"), W, { name: "Business" });
    return { W, personal, business: business.id };
  }

  const grantMap = async (userId: string) =>
    Object.fromEntries(
      (await db().select().from(profileAccess).where(eq(profileAccess.userId, userId))).map((g) => [
        g.profileId,
        g.role,
      ]),
    );
  const memberRow = (W: string, userId: string) =>
    db()
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, W), eq(workspaceMembers.userId, userId)));

  it("grants several profiles at once, each at its own role", async () => {
    const { W, personal, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: {
        mode: "profiles",
        entries: [
          { profileId: personal, role: "viewer" },
          { profileId: business, role: "editor" },
        ],
      },
    });

    expect(await grantMap(uid("b"))).toEqual({ [personal]: "viewer", [business]: "editor" });
    // Both profiles visible; no workspace-wide membership created.
    expect((await getProfiles(uid("b"), W)).map((p) => p.id).sort()).toEqual(
      [personal, business].sort(),
    );
    expect(await memberRow(W, uid("b"))).toHaveLength(0);
  });

  it("setMemberAccess reconciles both directions and can't touch the owner", async () => {
    const { W, personal, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "all", role: "editor" },
    });

    // Narrow to a single profile: membership dropped, one grant remains.
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("b"),
      access: { mode: "profiles", entries: [{ profileId: business, role: "viewer" }] },
    });
    expect(await memberRow(W, uid("b"))).toHaveLength(0);
    expect(await grantMap(uid("b"))).toEqual({ [business]: "viewer" });
    expect((await getProfiles(uid("b"), W)).map((p) => p.id)).toEqual([business]);

    // Widen back to all profiles: grants cleared, membership recreated at the new role.
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("b"),
      access: { mode: "all", role: "admin" },
    });
    expect(await grantMap(uid("b"))).toEqual({});
    const [m] = await memberRow(W, uid("b"));
    expect(m.role).toBe("admin");

    // The owner can never be re-scoped away from full access.
    await expect(
      ws.setMemberAccess(uid("a"), W, {
        userId: uid("a"),
        access: { mode: "profiles", entries: [{ profileId: personal, role: "viewer" }] },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("invites an unknown email to several profiles; each converts to a grant", async () => {
    const { W, personal, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "z@example.com",
      access: {
        mode: "profiles",
        entries: [
          { profileId: personal, role: "viewer" },
          { profileId: business, role: "admin" },
        ],
      },
    });
    expect(
      await db().select().from(workspaceInvites).where(eq(workspaceInvites.email, "z@example.com")),
    ).toHaveLength(2);

    await bootstrapUser("z");
    expect(await grantMap(uid("z"))).toEqual({ [personal]: "viewer", [business]: "admin" });
  });

  it("setInviteAccess replaces the whole invite set for an email", async () => {
    const { W, personal, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "z@example.com",
      access: { mode: "all", role: "viewer" },
    });
    await ws.setInviteAccess(uid("a"), W, {
      email: "z@example.com",
      access: {
        mode: "profiles",
        entries: [
          { profileId: personal, role: "editor" },
          { profileId: business, role: "viewer" },
        ],
      },
    });
    const invites = await db()
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.email, "z@example.com"));
    expect(invites).toHaveLength(2);
    expect(invites.every((i) => i.profileId !== null)).toBe(true);
  });

  it("removeCollaborator drops both membership and every profile grant", async () => {
    const { W, personal, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: {
        mode: "profiles",
        entries: [
          { profileId: personal, role: "viewer" },
          { profileId: business, role: "editor" },
        ],
      },
    });
    await ws.removeCollaborator(uid("a"), W, uid("b"));
    expect(await getProfiles(uid("b"), W)).toEqual([]);
    expect(await grantMap(uid("b"))).toEqual({});
    // The owner can never be removed.
    await expect(ws.removeCollaborator(uid("a"), W, uid("a"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("listCollaborators reports members as all-profiles and grantees per-profile", async () => {
    const { W, business } = await twoProfiles();
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "profiles", entries: [{ profileId: business, role: "editor" }] },
    });
    const people = await ws.listCollaborators(uid("a"), W);
    const owner = people.find((p) => p.userId === uid("a"));
    expect(owner?.isOwner).toBe(true);
    expect(owner?.access.mode).toBe("all");
    const grantee = people.find((p) => p.userId === uid("b"));
    expect(grantee?.access).toMatchObject({
      mode: "profiles",
      entries: [{ profileId: business, role: "editor" }],
    });
  });
});

describe("canWriteInWorkspace (viewer gate)", () => {
  it("is true for admins/editors, false for viewers", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const W = await workspaceIdOf("a");
    // The owner/admin can always write.
    expect(await canWriteInWorkspace(uid("a"), W)).toBe(true);

    // A workspace viewer can't write anywhere.
    await ws.addMember(uid("a"), W, {
      email: "b@example.com",
      access: { mode: "all", role: "viewer" },
    });
    expect(await canWriteInWorkspace(uid("b"), W)).toBe(false);

    // Promoted to editor → can write.
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("b"),
      access: { mode: "all", role: "editor" },
    });
    expect(await canWriteInWorkspace(uid("b"), W)).toBe(true);
  });

  it("is true for a per-profile editor with no workspace membership", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("c");
    const W = await workspaceIdOf("a");
    const personal = await firstProfileId("a");

    // A per-profile viewer still can't write.
    await ws.addMember(uid("a"), W, {
      email: "c@example.com",
      access: { mode: "profiles", entries: [{ profileId: personal, role: "viewer" }] },
    });
    expect(await canWriteInWorkspace(uid("c"), W)).toBe(false);

    // Bump that single grant to editor → can write (no workspace membership needed).
    await ws.setMemberAccess(uid("a"), W, {
      userId: uid("c"),
      access: { mode: "profiles", entries: [{ profileId: personal, role: "editor" }] },
    });
    expect(await canWriteInWorkspace(uid("c"), W)).toBe(true);
  });
});
