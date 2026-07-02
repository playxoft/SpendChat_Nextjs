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
import { getProfiles } from "@/lib/queries";
import { createTransaction, deleteTransaction } from "@/services/transactions";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, insertTxn, workspaceIdOf } from "./helpers/seed";

const db = () => getTestDb();

describe("bootstrap workspaces", () => {
  it("creates a default workspace named from the auth directory", async () => {
    await bootstrapUser("ann");
    const [row] = await db()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, uid("ann")));
    expect(row.name).toBe("ann's Workspace");

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
    const res = await ws.addMember(uid("a"), W, { email: "b@example.com", role: "viewer" });
    expect(res.status).toBe("added");

    const members = await ws.listMembers(uid("b"), W);
    expect(members.map((m) => m.role).sort()).toEqual(["admin", "viewer"]);
    // b sees a's workspace in their list now.
    const list = await ws.listWorkspaces(uid("b"));
    expect(list.some((w) => w.id === W)).toBe(true);
  });

  it("viewer can read but not write; editor can write", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", role: "viewer" });
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
    expect(await deleteTransaction(uid("b"), created.id)).toBe(true);
  });

  it("non-members see nothing in the workspace", async () => {
    const W = await setup();
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01" });
    expect(await getProfiles(uid("b"), W)).toEqual([]);
  });

  it("the owner cannot be demoted or removed", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", role: "admin" });
    await expect(
      ws.updateMemberRole(uid("b"), W, { userId: uid("a"), role: "viewer" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(ws.removeMember(uid("b"), W, uid("a"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("members can leave; removal clears their last-open pointer", async () => {
    const W = await setup();
    await ws.addMember(uid("a"), W, { email: "b@example.com", role: "editor" });
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
    await ws.addMember(uid("a"), W, { email: "b@example.com", role: "editor" });
    await expect(
      ws.addMember(uid("b"), W, { email: "c@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(ws.renameWorkspace(uid("b"), W, "Taken over")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("admins can rename the workspace", async () => {
    const W = await setup();
    await ws.renameWorkspace(uid("a"), W, "Family budget");
    const [row] = await db().select().from(workspaces).where(eq(workspaces.id, W));
    expect(row.name).toBe("Family budget");
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
      role: "editor",
      profileId: personal,
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

    const res = await ws.addMember(uid("a"), W, { email: "c@example.com", role: "editor" });
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
      role: "viewer",
      profileId: personal,
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
    await ws.addMember(uid("a"), W, { email: "e@example.com", role: "viewer" });
    const [invite] = await db()
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.workspaceId, W));
    await ws.cancelInvite(uid("a"), invite.id);
    expect(await ws.listInvites(uid("a"), W)).toHaveLength(0);
  });
});

describe("create & switch workspaces", () => {
  it("a user can create additional workspaces and switch between them", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const home = await workspaceIdOf("a");

    const created = await ws.createWorkspace(uid("a"), { name: "Side project" });
    expect(created.role).toBe("admin");

    // Creating switches to it; it gets its own default profile.
    let [settings] = await db()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, uid("a")));
    expect(settings.lastWorkspaceId).toBe(created.id);
    expect((await getProfiles(uid("a"), created.id)).map((p) => p.name)).toEqual([
      "Personal",
    ]);

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
