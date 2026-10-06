import { describe, it, expect } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  categories,
  profileAccess,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  transactions,
  workspaceMembers,
  workspaces,
  type ProfileAccessLevel,
  type SpaceRole,
  type WorkspaceRole,
} from "@/db/schema";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { WORKSPACE_ROLES, atLeastRole } from "@/lib/rbac";
import {
  accessibleProfileIds,
  canWriteInWorkspace,
  createWorkspaceWithDefaults,
  getEffectiveProfileRole,
  requireProfileRole,
} from "@/lib/workspaces";
import { listSpaces, setProfileOverride } from "@/services/spaces";
import { createCategory, deleteCategory } from "@/services/categories";
import { createTxnTag, deleteTxnTag } from "@/services/tags";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/services/transactions";
import * as ws from "@/services/workspaces";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  insertTxn,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";

/**
 * Access in the organisation → workspace → space → profile model, end to end
 * through the SQL resolvers (`accessibleProfileIds` for lists,
 * `getEffectiveProfileRole` for one profile). `tests/unit/rbac.test.ts` holds
 * the rules themselves (`resolveProfileRole`); this file proves the SQL runs
 * the same rules, on real rows.
 */

const db = () => getTestDb();

// ── Fixture: one workspace, 2 spaces × 2 profiles, one user per access shape ──

type ProfileKey = "p1a" | "p1b" | "p2a" | "p2b";
const PROFILE_KEYS: ProfileKey[] = ["p1a", "p1b", "p2a", "p2b"];

/** The role every fixture user should end up with on each profile. */
const EXPECTED: Record<string, Record<ProfileKey, WorkspaceRole | null>> = {
  // The owner — a workspace admin sees every space.
  adm: { p1a: "admin", p1b: "admin", p2a: "admin", p2b: "admin" },
  // A second admin, with a leftover space row and an override "none": admin wins.
  adm2: { p1a: "admin", p1b: "admin", p2a: "admin", p2b: "admin" },
  // Space 1 editor.
  sed: { p1a: "editor", p1b: "editor", p2a: null, p2b: null },
  // Space 1 viewer.
  svw: { p1a: "viewer", p1b: "viewer", p2a: null, p2b: null },
  // A workspace editor who is in no space sees nothing.
  nsp: { p1a: null, p1b: null, p2a: null, p2b: null },
  // Space 1 editor with override "none" on p1a: hidden inside their own space.
  ovn: { p1a: null, p1b: "editor", p2a: null, p2b: null },
  // Space 2 viewer with override "write" on p2a: raised on that one profile.
  ovw: { p1a: null, p1b: null, p2a: "editor", p2b: "viewer" },
  // Space 1 viewer with override "read" on p2a — a space they're not in.
  ovr: { p1a: "viewer", p1b: "viewer", p2a: "viewer", p2b: null },
  // Space 1 viewer with a legacy editor grant on p1b: the higher of the two.
  mix: { p1a: "viewer", p1b: "editor", p2a: null, p2b: null },
  // Not a member; a legacy single-profile grant.
  grt: { p1a: null, p1b: null, p2a: null, p2b: "editor" },
  // Not a member; a stale space row and a stale override — must get nothing.
  stl: { p1a: null, p1b: null, p2a: null, p2b: null },
};

type Fixture = {
  W: string;
  s1: string;
  s2: string;
  p: Record<ProfileKey, string>;
};

async function addProfile(workspaceId: string, spaceId: string, name: string, sortOrder: number) {
  const [row] = await db()
    .insert(profiles)
    .values({ userId: uid("adm"), workspaceId, spaceId, name, sortOrder })
    .returning({ id: profiles.id });
  return row!.id;
}

async function build(): Promise<Fixture> {
  await bootstrapUser("adm");
  const W = await workspaceIdOf("adm");
  const s1 = await defaultSpaceIdOf(W);
  const p1a = await firstProfileId("adm");
  const p1b = await addProfile(W, s1, "Business", 1);
  const [space2] = await db()
    .insert(spaces)
    .values({ workspaceId: W, name: "Family", position: 1 })
    .returning({ id: spaces.id });
  const s2 = space2!.id;
  const p2a = await addProfile(W, s2, "Kids", 2);
  const p2b = await addProfile(W, s2, "House", 3);
  const p = { p1a, p1b, p2a, p2b };

  for (const alias of Object.keys(EXPECTED)) if (alias !== "adm") await registerUser(alias);

  const member = (alias: string, role: WorkspaceRole) => ({ workspaceId: W, userId: uid(alias), role });
  await db()
    .insert(workspaceMembers)
    .values([
      member("adm2", "admin"),
      member("sed", "editor"),
      member("svw", "viewer"),
      member("nsp", "editor"),
      member("ovn", "editor"),
      member("ovw", "viewer"),
      member("ovr", "viewer"),
      member("mix", "viewer"),
    ]);

  const inSpace = (alias: string, spaceId: string, role: SpaceRole) => ({
    spaceId,
    userId: uid(alias),
    role,
  });
  await db()
    .insert(spaceMembers)
    .values([
      inSpace("adm2", s2, "viewer"),
      inSpace("sed", s1, "editor"),
      inSpace("svw", s1, "viewer"),
      inSpace("ovn", s1, "editor"),
      inSpace("ovw", s2, "viewer"),
      inSpace("ovr", s1, "viewer"),
      inSpace("mix", s1, "viewer"),
      inSpace("stl", s1, "editor"), // stale: stl isn't a member
    ]);

  const override = (alias: string, profileId: string, access: ProfileAccessLevel) => ({
    profileId,
    userId: uid(alias),
    access,
  });
  await db()
    .insert(profileOverrides)
    .values([
      override("adm2", p1a, "none"),
      override("ovn", p1a, "none"),
      override("ovw", p2a, "write"),
      override("ovr", p2a, "read"),
      override("stl", p2a, "write"), // stale: stl isn't a member
    ]);

  await db()
    .insert(profileAccess)
    .values([
      { profileId: p1b, userId: uid("mix"), role: "editor" },
      { profileId: p2b, userId: uid("grt"), role: "editor" },
    ]);

  return { W, s1, s2, p };
}

describe("profile access matrix — SQL resolvers agree with each other and with the rules", () => {
  it.each(Object.keys(EXPECTED))("%s", async (alias) => {
    const f = await build();
    const user = uid(alias);
    for (const minRole of WORKSPACE_ROLES) {
      const listed = new Set((await accessibleProfileIds(user, f.W, minRole)).map((r) => r.id));
      for (const key of PROFILE_KEYS) {
        const expected = EXPECTED[alias]![key];
        const access = await getEffectiveProfileRole(user, f.p[key]);
        const where = `${alias} on ${key} at ≥${minRole}`;
        // The single-profile resolver…
        expect(access?.role ?? null, where).toBe(expected);
        if (access) {
          expect(access.workspaceId).toBe(f.W);
          expect(access.spaceId).toBe(key.startsWith("p1") ? f.s1 : f.s2);
          expect(access.readOnly).toBe(false);
        }
        // …the list resolver, and the two agree.
        expect(listed.has(f.p[key]), where).toBe(atLeastRole(expected, minRole));
        expect(listed.has(f.p[key]), where).toBe(atLeastRole(access?.role, minRole));
      }
    }
  });

  it("canWriteInWorkspace is true exactly for users with an editor+ profile", async () => {
    const f = await build();
    for (const [alias, roles] of Object.entries(EXPECTED)) {
      const canWrite = Object.values(roles).some((r) => atLeastRole(r, "editor"));
      expect(await canWriteInWorkspace(uid(alias), f.W), alias).toBe(canWrite);
    }
  });

  it("requireProfileRole: 404 with no access, 403 below the role, the access above it", async () => {
    const f = await build();
    await expect(requireProfileRole(uid("nsp"), f.p.p1a, "viewer")).rejects.toMatchObject({
      status: 404,
    });
    await expect(requireProfileRole(uid("stl"), f.p.p2a, "viewer")).rejects.toMatchObject({
      status: 404,
    });
    await expect(requireProfileRole(uid("svw"), f.p.p1a, "editor")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
    await expect(requireProfileRole(uid("ovw"), f.p.p2a, "editor")).resolves.toMatchObject({
      role: "editor",
      spaceId: f.s2,
    });
  });

  it("getProfiles lists exactly the profiles a user can read", async () => {
    const f = await build();
    for (const [alias, roles] of Object.entries(EXPECTED)) {
      const expected = PROFILE_KEYS.filter((k) => roles[k] !== null).map((k) => f.p[k]);
      const got = (await getProfiles(uid(alias), f.W)).map((p) => p.id);
      expect(got.sort(), alias).toEqual(expected.sort());
    }
  });

  it("listSpaces: admins see every space; members only theirs, plus a space an override opens", async () => {
    const f = await build();
    const ids = async (alias: string) => (await listSpaces(uid(alias), f.W)).map((s) => s.id);
    expect(await ids("adm")).toEqual([f.s1, f.s2]);
    expect(await ids("adm2")).toEqual([f.s1, f.s2]);
    expect(await ids("svw")).toEqual([f.s1]);
    expect(await ids("ovw")).toEqual([f.s2]);
    expect(await ids("ovr")).toEqual([f.s1, f.s2]);
    expect(await ids("nsp")).toEqual([]);
    expect(await ids("grt")).toEqual([f.s2]); // the space holding their granted profile
    expect(await ids("stl")).toEqual([]); // stale rows surface nothing
  });
});

// ── Read-only workspaces ───────────────────────────────────────────────────

describe("read-only workspace (an extra free workspace, view-only from day one)", () => {
  /**
   * "ro" owns an older free workspace (W1) and a newer one (W2) — the shape a
   * person gets by creating a second free workspace. There's no grace period:
   * W2 is view-only from the moment it exists. `createWorkspaceWithDefaults` is
   * called directly, the way an extra workspace from before the one-free rule
   * existed.
   */
  async function twoFree() {
    await bootstrapUser("ro");
    const W1 = await workspaceIdOf("ro");
    const second = await createWorkspaceWithDefaults(uid("ro"), "Second");
    const W2 = second.id;
    // Strictly newer, whatever the clock granularity.
    await db()
      .update(workspaces)
      .set({ createdAt: sql`now() + interval '1 minute'` })
      .where(eq(workspaces.id, W2));
    const [p2] = await db()
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.workspaceId, W2));
    // An editor member of W2, in its Main space.
    await registerUser("roe");
    await db().insert(workspaceMembers).values({ workspaceId: W2, userId: uid("roe"), role: "editor" });
    await db()
      .insert(spaceMembers)
      .values({ spaceId: await defaultSpaceIdOf(W2), userId: uid("roe"), role: "editor" });
    return { W1, W2, p1: await firstProfileId("ro"), p2: p2!.id };
  }

  it("all three readers agree it's read-only: the list resolver, the single-profile resolver, the entitlements", async () => {
    const { W2, p2 } = await twoFree();
    // `accessibleProfileIds` applies `readOnlyWorkspaceSql` in a WHERE clause…
    expect(await accessibleProfileIds(uid("ro"), W2, "editor")).toEqual([]);
    // …`getEffectiveProfileRole` and `getWorkspaceEntitlements` in a select list.
    expect((await getEffectiveProfileRole(uid("ro"), p2))?.readOnly).toBe(true);
    expect((await getWorkspaceEntitlements(W2)).readOnly).toBe(true);
  });

  it("caps everyone at viewer: reads work, writes are refused with plan_limit", async () => {
    const { W1, W2, p2 } = await twoFree();
    expect((await getWorkspaceEntitlements(W2)).readOnly).toBe(true);
    expect((await getWorkspaceEntitlements(W1)).readOnly).toBe(false);

    for (const alias of ["ro", "roe"]) {
      const user = uid(alias);
      // Reads.
      expect(await getEffectiveProfileRole(user, p2)).toMatchObject({ role: "viewer", readOnly: true });
      expect((await accessibleProfileIds(user, W2, "viewer")).map((r) => r.id)).toEqual([p2]);
      expect((await getProfiles(user, W2)).map((p) => p.id)).toEqual([p2]);
      await expect(requireProfileRole(user, p2, "viewer")).resolves.toMatchObject({ readOnly: true });
      // Writes.
      expect(await accessibleProfileIds(user, W2, "editor")).toEqual([]);
      expect(await canWriteInWorkspace(user, W2)).toBe(false);
      await expect(requireProfileRole(user, p2, "editor")).rejects.toMatchObject({
        status: 403,
        code: "plan_limit",
        details: { limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" },
      });
    }
    // The owner's older free workspace is untouched.
    expect(await canWriteInWorkspace(uid("ro"), W1)).toBe(true);
  });

  it("refuses transaction writes in it (create, update, delete), leaving the rows as they were", async () => {
    const { W2, p2 } = await twoFree();
    const existing = await insertTxn("ro", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
      profileId: p2,
    });
    const input = { type: "expense", amount: 9, occurredOn: "2026-06-02", profileId: p2 };

    for (const alias of ["ro", "roe"]) {
      const user = uid(alias);
      await expect(createTransaction(user, W2, input)).rejects.toMatchObject({ status: 403 });
      await expect(updateTransaction(user, W2, existing, input)).rejects.toMatchObject({
        status: 403,
      });
      await expect(deleteTransaction(user, W2, existing)).rejects.toMatchObject({ status: 403 });
    }
    const rows = await db().select().from(transactions).where(eq(transactions.profileId, p2));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountMinor).toBe(500);
  });

  it("says why: transaction writes in it fail with plan_limit, not a plain forbidden", async () => {
    const { W2, p2 } = await twoFree();
    const existing = await insertTxn("ro", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
      profileId: p2,
    });
    const input = { type: "expense", amount: 9, occurredOn: "2026-06-02", profileId: p2 };
    const planLimit = { status: 403, code: "plan_limit" };
    await expect(createTransaction(uid("roe"), W2, input)).rejects.toMatchObject(planLimit);
    await expect(updateTransaction(uid("roe"), W2, existing, input)).rejects.toMatchObject(planLimit);
    await expect(deleteTransaction(uid("roe"), W2, existing)).rejects.toMatchObject(planLimit);
  });

  it("the owner can't write into it even when it has no profile called \"Personal\"", async () => {
    // `createTransaction` self-heals an admin with no writable profile by
    // recreating "Personal" — in a read-only workspace that must not become a
    // way to write.
    const { W2, p2 } = await twoFree();
    await db().update(profiles).set({ name: "Home" }).where(eq(profiles.id, p2));
    await expect(
      createTransaction(uid("ro"), W2, { type: "expense", amount: 9, occurredOn: "2026-06-02" }),
    ).rejects.toMatchObject({ status: 403 });
    const inW2 = await db().select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, W2));
    expect(inW2.map((r) => r.id)).toEqual([p2]);
    expect(
      await db().select().from(transactions).where(inArray(transactions.profileId, [p2])),
    ).toEqual([]);
  });

  it("is view-only from the day it's created — there's no grace period to wait out", async () => {
    const { W2, p2 } = await twoFree();
    const ent = await getWorkspaceEntitlements(W2);
    expect(ent).toMatchObject({ plan: "free", readOnly: true });
    expect(ent).not.toHaveProperty("grandfathered");
    expect(ent).not.toHaveProperty("inGrace");
    expect(await getEffectiveProfileRole(uid("ro"), p2)).toMatchObject({ role: "viewer", readOnly: true });
    expect(await canWriteInWorkspace(uid("ro"), W2)).toBe(false);
    expect(await canWriteInWorkspace(uid("roe"), W2)).toBe(false);
  });

  it("a paid workspace is never read-only — neither the newer one nor, once the older is paid, the free one", async () => {
    const { W1, W2, p2 } = await twoFree();
    // The newer one upgrades.
    await setWorkspacePlan(W2, "plus");
    expect((await getWorkspaceEntitlements(W2)).readOnly).toBe(false);
    expect(await canWriteInWorkspace(uid("roe"), W2)).toBe(true);

    // Or the older one is the paid one: W2 is then the person's only free workspace.
    await setWorkspacePlan(W2, "free");
    await setWorkspacePlan(W1, "pro");
    expect((await getWorkspaceEntitlements(W2)).readOnly).toBe(false);
    expect((await getWorkspaceEntitlements(W1)).readOnly).toBe(false);
    await expect(requireProfileRole(uid("ro"), p2, "editor")).resolves.toMatchObject({
      role: "admin",
      readOnly: false,
    });
  });
});

// ── Downgrades and removals ────────────────────────────────────────────────

describe("overrides after a downgrade", () => {
  it("an override made on Pro keeps lowering access once the workspace is back on Free", async () => {
    await bootstrapUser("own");
    await bootstrapUser("mem");
    const W = await workspaceIdOf("own");
    const p = await firstProfileId("own");
    await setWorkspacePlan(W, "pro");
    await ws.addMember(uid("own"), W, { email: "mem@example.com", access: { mode: "all", role: "editor" } });
    expect(await getEffectiveProfileRole(uid("mem"), p)).toMatchObject({ role: "editor" });

    await setProfileOverride(uid("own"), p, { userId: uid("mem"), access: "none" });
    expect(await getEffectiveProfileRole(uid("mem"), p)).toBeNull();

    await setWorkspacePlan(W, "free");
    // Still hidden: a downgrade never widens anyone's access…
    expect(await getEffectiveProfileRole(uid("mem"), p)).toBeNull();
    expect(await accessibleProfileIds(uid("mem"), W, "viewer")).toEqual([]);
    // …and on Free the override can't be changed (or cleared) any more.
    await expect(
      setProfileOverride(uid("own"), p, { userId: uid("mem"), access: null }),
    ).rejects.toMatchObject({ status: 403, code: "plan_limit", details: { limit: "profileLevelAccess" } });
    const [row] = await db()
      .select({ access: profileOverrides.access })
      .from(profileOverrides)
      .where(and(eq(profileOverrides.profileId, p), eq(profileOverrides.userId, uid("mem"))));
    expect(row?.access).toBe("none");
  });
});

describe("removing someone from a workspace", () => {
  /** "rm" is a member of both W (owner "own") and V (owner "oth"), with space rows and overrides in each. */
  async function memberOfTwo() {
    await bootstrapUser("own");
    await bootstrapUser("oth");
    await registerUser("rm");
    const W = await workspaceIdOf("own");
    const V = await workspaceIdOf("oth");
    const pW = await firstProfileId("own");
    const pV = await firstProfileId("oth");
    for (const [workspaceId, profileId] of [
      [W, pW],
      [V, pV],
    ] as const) {
      await db().insert(workspaceMembers).values({ workspaceId, userId: uid("rm"), role: "editor" });
      await db()
        .insert(spaceMembers)
        .values({ spaceId: await defaultSpaceIdOf(workspaceId), userId: uid("rm"), role: "editor" });
      await db().insert(profileOverrides).values({ profileId, userId: uid("rm"), access: "read" });
    }
    return { W, V, pW, pV };
  }

  const leftovers = async (workspaceId: string) => ({
    spaces: await db()
      .select({ id: spaceMembers.spaceId })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaceMembers.userId, uid("rm")))),
    overrides: await db()
      .select({ id: profileOverrides.profileId })
      .from(profileOverrides)
      .innerJoin(profiles, eq(profiles.id, profileOverrides.profileId))
      .where(and(eq(profiles.workspaceId, workspaceId), eq(profileOverrides.userId, uid("rm")))),
  });

  it.each([
    ["removeMember", (W: string) => ws.removeMember(uid("own"), W, uid("rm"))],
    ["removeCollaborator", (W: string) => ws.removeCollaborator(uid("own"), W, uid("rm"))],
    ["leaving (removeMember on yourself)", (W: string) => ws.removeMember(uid("rm"), W, uid("rm"))],
  ] as const)("%s deletes their space rows and overrides in that workspace only", async (_, remove) => {
    const { W, V, pW, pV } = await memberOfTwo();
    expect(await leftovers(W)).toEqual({ spaces: [expect.anything()], overrides: [{ id: pW }] });

    await remove(W);

    expect(await leftovers(W)).toEqual({ spaces: [], overrides: [] });
    expect(await getEffectiveProfileRole(uid("rm"), pW)).toBeNull();
    // Their access in the other workspace is untouched.
    expect(await leftovers(V)).toEqual({ spaces: [expect.anything()], overrides: [{ id: pV }] });
    expect(await getEffectiveProfileRole(uid("rm"), pV)).toMatchObject({ role: "viewer" });
  });

  it("re-adding a removed member starts clean — no override from before comes back", async () => {
    const { W, pW } = await memberOfTwo();
    await ws.removeMember(uid("own"), W, uid("rm"));
    await ws.addMember(uid("own"), W, { email: "rm@example.com", access: { mode: "all", role: "editor" } });
    // Editor through the Main space, not "read" from the old override.
    expect(await getEffectiveProfileRole(uid("rm"), pW)).toMatchObject({ role: "editor" });
  });
});

describe("shared lists (categories, tags) since spaces", () => {
  // Security review: a workspace "editor" is no longer an editor of anything
  // by itself. Deleting a category clears it on every transaction and deleting
  // a tag strips it from every one, so those need reach over every profile.
  it("a workspace editor in no space can't add to the shared lists or delete from them", async () => {
    const { W } = await build();
    await expect(
      createCategory(uid("nsp"), W, { name: "Snacks", kind: "expense" }),
    ).rejects.toMatchObject({ status: 403 });
    const [cat] = await db()
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.workspaceId, W))
      .limit(1);
    await expect(deleteCategory(uid("nsp"), W, cat!.id)).rejects.toMatchObject({ status: 403 });
    const tag = await createTxnTag(uid("adm"), W, { name: "trip", color: "#ef4444" });
    await expect(deleteTxnTag(uid("nsp"), W, tag.id)).rejects.toMatchObject({ status: 403 });
  });

  it("an editor of one space can add, but only someone who can edit every profile can delete", async () => {
    const { W, s2 } = await build();
    const cat = await createCategory(uid("sed"), W, { name: "Snacks", kind: "expense" });
    await expect(deleteCategory(uid("sed"), W, cat.id)).rejects.toMatchObject({ status: 403 });
    // Give them space 2 as well — now every profile is theirs to edit.
    await db().insert(spaceMembers).values({ spaceId: s2, userId: uid("sed"), role: "editor" });
    await expect(deleteCategory(uid("sed"), W, cat.id)).resolves.toBeTruthy();
  });

  it("admins can always rename and delete shared-list entries", async () => {
    const { W } = await build();
    const tag = await createTxnTag(uid("adm"), W, { name: "trip", color: "#ef4444" });
    await expect(deleteTxnTag(uid("adm"), W, tag.id)).resolves.toBeTruthy();
  });
});

