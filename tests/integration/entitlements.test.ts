import { describe, it, expect } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import {
  aiUsageLog,
  categories,
  emailSendLog,
  files,
  organizations,
  profileAccess,
  profiles,
  spaceMembers,
  spaces,
  tags,
  users,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { addCategory } from "@/actions/categories";
import { createWorkspace as createWorkspaceAction } from "@/actions/workspaces";
import { ensureBootstrap } from "@/lib/auth";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "@/lib/categories";
import {
  aiActionsUsedThisMonth,
  assertProfileLevelAccess,
  assertVoiceAllowed,
  countMembers,
  getAddLimits,
  getAiAllowance,
  getWorkspaceEntitlements,
  monthStartUtc,
} from "@/lib/entitlements";
import { PLAN_LIMITS, type PersonalPlan } from "@/lib/plans";
import { assertStorageQuota } from "@/lib/storage-quota";
import { createCategory } from "@/services/categories";
import { createProfile } from "@/services/profiles";
import { createSpace } from "@/services/spaces";
import { createTxnTag } from "@/services/tags";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  defaultSpaceIdOf,
  firstProfileId,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";

/**
 * The plan limits (`lib/entitlements.ts`) on Free and on paid plans, and the
 * abuse-catalogue rules they implement (named `C<n>:` after the catalogue).
 * Every limit gates *adding*; nothing here may ever delete what a workspace
 * already has.
 */

const db = () => getTestDb();

/** Bootstrap `alias`, put their workspace on `plan`, return its id. */
async function ownerOn(plan: PersonalPlan, alias = "own"): Promise<string> {
  signInAs(alias);
  await bootstrapUser(alias);
  const W = await workspaceIdOf(alias);
  await setWorkspacePlan(W, plan);
  return W;
}

const planLimit = (details: Record<string, unknown>) => ({
  status: 403,
  code: "plan_limit",
  details: expect.objectContaining(details),
});

// ── Members ────────────────────────────────────────────────────────────────

describe("members", () => {
  const all = (role: "viewer" | "editor" | "admin" = "viewer") => ({ mode: "all" as const, role });

  it("Free holds 3 people, owner included; the 4th is refused with the upgrade in details", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("mb");
    await ws.addMember(uid("own"), W, { email: "mb@example.com", access: all("editor") });
    await ws.addMember(uid("own"), W, { email: "pending@example.com", access: all() });
    expect(await countMembers(W)).toBe(3);

    await expect(
      ws.addMember(uid("own"), W, { email: "fourth@example.com", access: all() }),
    ).rejects.toMatchObject({
      status: 403,
      code: "plan_limit",
      details: { limit: "members", plan: "free", max: 3, used: 3, upgradeTo: "plus" },
    });
    // Refused before anything was written or any email budget spent.
    expect(
      await db().select().from(workspaceInvites).where(eq(workspaceInvites.email, "fourth@example.com")),
    ).toEqual([]);
    const [{ n }] = await db().select({ n: count() }).from(emailSendLog);
    expect(n).toBe(2);
  });

  it("pending invites count — three invites from a lone owner is one too many", async () => {
    const W = await ownerOn("free");
    await ws.addMember(uid("own"), W, { email: "i1@example.com", access: all() });
    await ws.addMember(uid("own"), W, { email: "i2@example.com", access: all() });
    await expect(
      ws.addMember(uid("own"), W, { email: "i3@example.com", access: all() }),
    ).rejects.toMatchObject(planLimit({ limit: "members", used: 3 }));
  });

  it("re-scoping someone who already counts never trips the cap", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("mb");
    await ws.addMember(uid("own"), W, { email: "mb@example.com", access: all("viewer") });
    await ws.addMember(uid("own"), W, { email: "pending@example.com", access: all("viewer") });
    expect(await countMembers(W)).toBe(3); // at the cap

    // The member, re-added at another role, and re-scoped / re-roled.
    await expect(
      ws.addMember(uid("own"), W, { email: "mb@example.com", access: all("editor") }),
    ).resolves.toMatchObject({ status: "added" });
    await ws.setMemberAccess(uid("own"), W, { userId: uid("mb"), access: all("viewer") });
    await ws.updateMemberRole(uid("own"), W, { userId: uid("mb"), role: "editor" });
    // The invite, re-sent and re-scoped.
    await expect(
      ws.addMember(uid("own"), W, { email: "pending@example.com", access: all("editor") }),
    ).resolves.toMatchObject({ status: "invited" });
    await ws.setInviteAccess(uid("own"), W, { email: "pending@example.com", access: all("admin") });
    expect(await countMembers(W)).toBe(3);
  });

  it("can't be sidestepped by re-scoping someone new: setMemberAccess on a non-member at the cap", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("mb");
    await registerUser("out");
    await ws.addMember(uid("own"), W, { email: "mb@example.com", access: all() });
    await ws.addMember(uid("own"), W, { email: "pending@example.com", access: all() });
    await expect(
      ws.setMemberAccess(uid("own"), W, { userId: uid("out"), access: all("editor") }),
    ).rejects.toMatchObject(planLimit({ limit: "members" }));
    expect(await countMembers(W)).toBe(3);
  });

  it("can't be sidestepped by re-scoping someone new: setInviteAccess for a fresh email at the cap", async () => {
    const W = await ownerOn("free");
    await ws.addMember(uid("own"), W, { email: "i1@example.com", access: all() });
    await ws.addMember(uid("own"), W, { email: "i2@example.com", access: all() });
    await expect(
      ws.setInviteAccess(uid("own"), W, { email: "fresh@example.com", access: all() }),
    ).rejects.toMatchObject(planLimit({ limit: "members" }));
    expect(await countMembers(W)).toBe(3);
  });

  it("counts grant-only people, each once however many profiles they hold (Plus: 5)", async () => {
    const W = await ownerOn("plus");
    const p1 = await firstProfileId("own");
    const p2 = (await createProfile(uid("own"), W, { name: "Business" })).id;
    await bootstrapUser("gr");
    await ws.addMember(uid("own"), W, {
      email: "gr@example.com",
      access: {
        mode: "profiles",
        entries: [
          { profileId: p1, role: "viewer" },
          { profileId: p2, role: "editor" },
        ],
      },
    });
    for (const email of ["m1@example.com", "m2@example.com", "m3@example.com"]) {
      await ws.addMember(uid("own"), W, { email, access: all() });
    }
    expect(await countMembers(W)).toBe(5);
    await expect(
      ws.addMember(uid("own"), W, { email: "sixth@example.com", access: all() }),
    ).rejects.toMatchObject(
      planLimit({ limit: "members", plan: "plus", max: 5, used: 5, upgradeTo: "pro" }),
    );
  });

  it("Pro holds 10, and the 11th is told to contact us (no plan above)", async () => {
    const W = await ownerOn("pro");
    // The email budget is 20/hour; 9 invites stay well inside it.
    for (let i = 1; i <= 9; i++) {
      await ws.addMember(uid("own"), W, { email: `p${i}@example.com`, access: all() });
    }
    expect(await countMembers(W)).toBe(10);
    const err = await ws
      .addMember(uid("own"), W, { email: "p10@example.com", access: all() })
      .catch((e: unknown) => e);
    expect(err).toMatchObject(planLimit({ limit: "members", plan: "pro", max: 10, upgradeTo: null }));
    expect((err as Error).message).toMatch(/contact us/i);
  });
});

// ── Categories, tags, spaces, profiles ─────────────────────────────────────

describe("categories", () => {
  it("Free: the 10 defaults count, 10 more fit, the 21st is refused", async () => {
    const W = await ownerOn("free");
    expect(DEFAULT_CATEGORIES).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      await createCategory(uid("own"), W, { name: `Extra ${i}`, kind: "expense" });
    }
    await expect(
      createCategory(uid("own"), W, { name: "One too many", kind: "income" }),
    ).rejects.toMatchObject(
      planLimit({ limit: "categories", plan: "free", max: 20, used: 20, upgradeTo: "plus" }),
    );
    const [{ n }] = await db().select({ n: count() }).from(categories).where(eq(categories.workspaceId, W));
    expect(n).toBe(20);
  });

  it("deleting a category frees a slot", async () => {
    const W = await ownerOn("free");
    for (let i = 0; i < PLAN_LIMITS.free.categories - DEFAULT_CATEGORIES.length; i++) {
      await createCategory(uid("own"), W, { name: `Extra ${i}`, kind: "expense" });
    }
    await expect(
      createCategory(uid("own"), W, { name: "Full", kind: "expense" }),
    ).rejects.toMatchObject(planLimit({ limit: "categories", used: 20 }));
    await db()
      .delete(categories)
      .where(and(eq(categories.workspaceId, W), eq(categories.name, "Extra 0")));
    await expect(
      createCategory(uid("own"), W, { name: "Fits again", kind: "expense" }),
    ).resolves.toMatchObject({ name: "Fits again" });
  });

  it("Pro allows 50", async () => {
    const W = await ownerOn("pro");
    for (let i = 0; i < 50 - DEFAULT_CATEGORIES.length; i++) {
      await createCategory(uid("own"), W, { name: `Extra ${i}`, kind: "expense" });
    }
    await expect(
      createCategory(uid("own"), W, { name: "Fifty-one", kind: "expense" }),
    ).rejects.toMatchObject(planLimit({ limit: "categories", plan: "pro", max: 50, upgradeTo: null }));
  });

  it("the web action reports the plan limit with its code and details", async () => {
    await ownerOn("free");
    for (let i = 0; i < 10; i++) {
      expect(await addCategory({ name: `Extra ${i}`, kind: "expense" })).toMatchObject({ ok: true });
    }
    expect(await addCategory({ name: "One too many", kind: "expense" })).toMatchObject({
      ok: false,
      code: "plan_limit",
      details: { limit: "categories", plan: "free", max: 20, upgradeTo: "plus" },
    });
  });
});

describe("tags", () => {
  const tag = (W: string, name: string) => createTxnTag(uid("own"), W, { name, color: "#ef4444" });

  it("Free: the 2 default tags count, 3 more fit, then refused at 5", async () => {
    const W = await ownerOn("free");
    expect(DEFAULT_TAGS).toHaveLength(2);
    for (let i = 0; i < 3; i++) await tag(W, `t${i}`);
    await expect(tag(W, "t3")).rejects.toMatchObject(
      planLimit({ limit: "tags", plan: "free", max: 5, used: 5, upgradeTo: "plus" }),
    );
  });

  it("Pro: 20 (the 2 defaults included), then refused", async () => {
    const W = await ownerOn("pro");
    for (let i = 0; i < 18; i++) await tag(W, `t${i}`);
    await expect(tag(W, "t18")).rejects.toMatchObject(
      planLimit({ limit: "tags", plan: "pro", max: 20, used: 20, upgradeTo: null }),
    );
  });
});

describe("spaces and profiles per space", () => {
  it("Free: 3 profiles per space, the default Personal included", async () => {
    const W = await ownerOn("free");
    await createProfile(uid("own"), W, { name: "Two" });
    await createProfile(uid("own"), W, { name: "Three" });
    await expect(createProfile(uid("own"), W, { name: "Four" })).rejects.toMatchObject(
      planLimit({ limit: "profilesPerSpace", plan: "free", max: 3, used: 3, upgradeTo: "plus" }),
    );
    const [{ n }] = await db().select({ n: count() }).from(profiles).where(eq(profiles.workspaceId, W));
    expect(n).toBe(3);
  });

  it("the cap is per space: a second space has its own room", async () => {
    const W = await ownerOn("free");
    await createProfile(uid("own"), W, { name: "Two" });
    await createProfile(uid("own"), W, { name: "Three" });
    const family = await createSpace(uid("own"), W, { name: "Family" });
    for (const name of ["Kids", "House", "Car"]) {
      await createProfile(uid("own"), W, { name, spaceId: family.id });
    }
    await expect(
      createProfile(uid("own"), W, { name: "Pets", spaceId: family.id }),
    ).rejects.toMatchObject(planLimit({ limit: "profilesPerSpace" }));
  });

  it("Free: 2 spaces; the 3rd is refused", async () => {
    const W = await ownerOn("free");
    await createSpace(uid("own"), W, { name: "Family" });
    await expect(createSpace(uid("own"), W, { name: "Work" })).rejects.toMatchObject(
      planLimit({ limit: "spaces", plan: "free", max: 2, used: 2, upgradeTo: "plus" }),
    );
    const [{ n }] = await db().select({ n: count() }).from(spaces).where(eq(spaces.workspaceId, W));
    expect(n).toBe(2);
  });

  it("Pro: 10 profiles per space", async () => {
    const W = await ownerOn("pro");
    for (let i = 2; i <= 10; i++) await createProfile(uid("own"), W, { name: `P${i}` });
    await expect(createProfile(uid("own"), W, { name: "P11" })).rejects.toMatchObject(
      planLimit({ limit: "profilesPerSpace", plan: "pro", max: 10, upgradeTo: null }),
    );
  });
});

// ── Storage ────────────────────────────────────────────────────────────────

describe("storage (assertStorageQuota)", () => {
  async function fill(W: string, bytes: number) {
    await db()
      .insert(files)
      .values({
        workspaceId: W,
        profileId: await firstProfileId("own"),
        userId: uid("own"),
        r2Key: `vault/seed-${crypto.randomUUID()}`,
        name: "big.bin",
        contentType: "application/octet-stream",
        sizeBytes: bytes,
      });
  }

  it.each([
    ["free", "plus"],
    ["plus", "pro"],
    ["pro", null],
  ] as const)("%s: fits up to its own limit exactly, then 413s with the plan in details", async (plan, upgradeTo) => {
    const W = await ownerOn(plan);
    const limit = PLAN_LIMITS[plan].storageBytes;
    await fill(W, limit - 10);
    await expect(assertStorageQuota(W, 10)).resolves.toBeUndefined();
    await expect(assertStorageQuota(W, 11)).rejects.toMatchObject({
      status: 413,
      code: "storage_quota_exceeded",
      details: { limit: "storage", plan, max: limit, used: limit - 10, upgradeTo },
    });
  });

  it("a bigger plan lifts the limit on the same bytes", async () => {
    const W = await ownerOn("free");
    await fill(W, PLAN_LIMITS.free.storageBytes);
    await expect(assertStorageQuota(W, 1)).rejects.toMatchObject({ status: 413 });
    await setWorkspacePlan(W, "plus");
    await expect(assertStorageQuota(W, 1)).resolves.toBeUndefined();
  });
});

// ── Feature gates ──────────────────────────────────────────────────────────

describe("per-profile access (assertProfileLevelAccess)", () => {
  it("is refused on Free and allowed on Plus and Pro", async () => {
    const W = await ownerOn("free");
    await expect(assertProfileLevelAccess(W)).rejects.toMatchObject(
      planLimit({ limit: "profileLevelAccess", plan: "free", upgradeTo: "plus" }),
    );
    await setWorkspacePlan(W, "plus");
    await expect(assertProfileLevelAccess(W)).resolves.toBeUndefined();
    await setWorkspacePlan(W, "pro");
    await expect(assertProfileLevelAccess(W)).resolves.toBeUndefined();
  });

  it("gates a new single-profile grant through addMember on Free, before anything is written", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("gr");
    await expect(
      ws.addMember(uid("own"), W, {
        email: "gr@example.com",
        access: { mode: "profiles", entries: [{ profileId: await firstProfileId("own"), role: "viewer" }] },
      }),
    ).rejects.toMatchObject(planLimit({ limit: "profileLevelAccess" }));
    expect(await db().select().from(profileAccess)).toEqual([]);
  });
});

describe("voice (assertVoiceAllowed)", () => {
  it("is Pro only — Free and Plus are refused with Pro as the upgrade", async () => {
    const W = await ownerOn("free");
    await expect(assertVoiceAllowed(W)).rejects.toMatchObject(
      planLimit({ limit: "voice", plan: "free", upgradeTo: "pro" }),
    );
    await setWorkspacePlan(W, "plus");
    await expect(assertVoiceAllowed(W)).rejects.toMatchObject(
      planLimit({ limit: "voice", plan: "plus", upgradeTo: "pro" }),
    );
    await setWorkspacePlan(W, "pro");
    await expect(assertVoiceAllowed(W)).resolves.toBeUndefined();
  });
});

// ── AI allowance ───────────────────────────────────────────────────────────

describe("AI allowance", () => {
  const NOW = new Date();
  const lastMonth = new Date(monthStartUtc(NOW).getTime() - 1000);

  async function logAi(
    rows: {
      workspaceId: string;
      ownerId: string;
      plan: PersonalPlan | null;
      units?: number;
      createdAt?: Date;
    }[],
  ) {
    await db()
      .insert(aiUsageLog)
      .values(
        rows.map((r) => ({
          userId: r.ownerId,
          workspaceId: r.workspaceId,
          kind: "transaction_parse",
          units: r.units ?? 1,
          ownerId: r.ownerId,
          plan: r.plan,
          createdAt: r.createdAt ?? NOW,
        })),
      );
  }

  const used = async (W: string) =>
    aiActionsUsedThisMonth(await getWorkspaceEntitlements(W), NOW);

  it("sums units, not rows", async () => {
    const W = await ownerOn("free");
    await logAi([
      { workspaceId: W, ownerId: uid("own"), plan: "free", units: 2 },
      { workspaceId: W, ownerId: uid("own"), plan: "free", units: 0 },
      { workspaceId: W, ownerId: uid("own"), plan: "free" },
    ]);
    expect(await used(W)).toBe(3);
  });

  it("C1: usage from before a plan change still counts; last month's doesn't", async () => {
    const W = await ownerOn("free");
    await logAi([
      { workspaceId: W, ownerId: uid("own"), plan: "free", units: 4 },
      { workspaceId: W, ownerId: uid("own"), plan: "free", units: 7, createdAt: lastMonth },
    ]);
    expect(await used(W)).toBe(4);
    await setWorkspacePlan(W, "plus");
    expect(await used(W)).toBe(4);
    // …and back again (cancel → re-subscribe never resets either).
    await setWorkspacePlan(W, "free");
    expect(await used(W)).toBe(4);
  });

  it("C2: a Free owner's actions in a deleted free workspace count against their current one", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("oth");
    const deleted = "00000000-0000-4000-8000-0000000dead1";
    await logAi([
      // Spent in a free workspace the owner has since deleted.
      { workspaceId: deleted, ownerId: uid("own"), plan: "free", units: 30 },
      // Last month's, in the same deleted workspace — not this month.
      { workspaceId: deleted, ownerId: uid("own"), plan: "free", units: 40, createdAt: lastMonth },
      // Someone else's free actions.
      { workspaceId: await workspaceIdOf("oth"), ownerId: uid("oth"), plan: "free", units: 5 },
      // The same owner's actions on a *paid* workspace are that workspace's own.
      { workspaceId: deleted, ownerId: uid("own"), plan: "pro", units: 100 },
    ]);
    expect(await used(W)).toBe(30);
    expect(await getAiAllowance(W, NOW)).toMatchObject({ used: 30, limit: 50, remaining: 20 });
  });

  it("C2: a paid workspace counts only its own rows, not the owner's free ones", async () => {
    const W = await ownerOn("plus");
    await logAi([
      { workspaceId: "00000000-0000-4000-8000-0000000dead1", ownerId: uid("own"), plan: "free", units: 30 },
      { workspaceId: W, ownerId: uid("own"), plan: "plus", units: 2 },
    ]);
    expect(await used(W)).toBe(2);
  });

  it("C3: usage carries over on upgrade — free → pro keeps what's been used", async () => {
    const W = await ownerOn("free");
    await logAi([{ workspaceId: W, ownerId: uid("own"), plan: "free", units: 45 }]);
    expect(await getAiAllowance(W, NOW)).toMatchObject({ used: 45, limit: 50, remaining: 5 });
    await setWorkspacePlan(W, "pro");
    expect(await getAiAllowance(W, NOW)).toMatchObject({ used: 45, limit: 1000, remaining: 955 });
  });

  it("resets on the 1st (UTC) of next month", async () => {
    const W = await ownerOn("free");
    const allowance = await getAiAllowance(W, new Date("2026-10-31T23:59:59Z"));
    expect(allowance.resetsAt).toBe("2026-11-01T00:00:00.000Z");
  });
});

// ── One free workspace per person ──────────────────────────────────────────

describe("C5: one free workspace per person", () => {
  it("C5: a second free workspace is refused (service)", async () => {
    await ownerOn("free");
    await expect(ws.createWorkspace(uid("own"), { name: "Second" })).rejects.toMatchObject({
      status: 403,
      code: "plan_limit",
      details: { limit: "freeWorkspaces", plan: "free", max: 1, used: 1, upgradeTo: "plus" },
    });
    const [{ n }] = await db().select({ n: count() }).from(workspaces).where(eq(workspaces.ownerId, uid("own")));
    expect(n).toBe(1);
  });

  it("C5: a second free workspace is refused (web action), with the code for the upgrade dialog", async () => {
    await ownerOn("free");
    expect(await createWorkspaceAction("Second")).toMatchObject({
      ok: false,
      code: "plan_limit",
      details: { limit: "freeWorkspaces" },
    });
  });

  it("C5: allowed once the existing one is paid — and then not a third free one", async () => {
    const W = await ownerOn("free");
    await setWorkspacePlan(W, "plus");
    const second = await ws.createWorkspace(uid("own"), { name: "Second" });
    expect(second).toMatchObject({ plan: "free" });
    // It joins the same personal organisation.
    expect(second.organizationId).toBe(await orgOf(W));
    await expect(ws.createWorkspace(uid("own"), { name: "Third" })).rejects.toMatchObject(
      planLimit({ limit: "freeWorkspaces" }),
    );
  });

  it("C5: workspaces you're only a member of don't count", async () => {
    await ownerOn("free");
    await bootstrapUser("oth");
    await ws.addMember(uid("oth"), await workspaceIdOf("oth"), {
      email: "own@example.com",
      access: { mode: "all", role: "editor" },
    });
    // own is a member of oth's free workspace and owns one free workspace:
    // still exactly one free workspace *owned*, so a second is refused…
    await expect(ws.createWorkspace(uid("own"), { name: "Second" })).rejects.toMatchObject(
      planLimit({ limit: "freeWorkspaces", used: 1 }),
    );
  });
});

async function orgOf(workspaceId: string): Promise<string> {
  const [row] = await db()
    .select({ id: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row!.id;
}

// ── Over a cap: keep everything, add nothing ───────────────────────────────

describe("C7: over a cap after a downgrade", () => {
  it("C7: a workspace over its tag cap keeps all its tags and can't add one more", async () => {
    const W = await ownerOn("pro");
    for (let i = 0; i < 6; i++) {
      await createTxnTag(uid("own"), W, { name: `t${i}`, color: "#ef4444" });
    }
    await setWorkspacePlan(W, "free");
    await expect(
      createTxnTag(uid("own"), W, { name: "t6", color: "#ef4444" }),
    ).rejects.toMatchObject(planLimit({ limit: "tags", max: 5, used: 8 }));
    const kept = await db().select({ name: tags.name }).from(tags).where(eq(tags.workspaceId, W));
    expect(kept.map((t) => t.name).sort()).toEqual([
      "Recurring",
      "Reimbursable",
      "t0",
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
  });

  it("C7: over the profile and space caps, nothing is deleted and nothing more fits", async () => {
    const W = await ownerOn("pro");
    for (const name of ["Two", "Three", "Four"]) await createProfile(uid("own"), W, { name });
    await createSpace(uid("own"), W, { name: "S2" });
    await createSpace(uid("own"), W, { name: "S3" });
    await setWorkspacePlan(W, "free");
    await expect(createProfile(uid("own"), W, { name: "Five" })).rejects.toMatchObject(
      planLimit({ limit: "profilesPerSpace", used: 4 }),
    );
    await expect(createSpace(uid("own"), W, { name: "S4" })).rejects.toMatchObject(
      planLimit({ limit: "spaces", used: 3 }),
    );
    const [{ p }] = await db().select({ p: count() }).from(profiles).where(eq(profiles.workspaceId, W));
    const [{ s }] = await db().select({ s: count() }).from(spaces).where(eq(spaces.workspaceId, W));
    expect({ p, s }).toEqual({ p: 4, s: 3 });
  });

  it("C7: over the member cap, everyone stays and nobody more can be added — and voice goes with Pro", async () => {
    const W = await ownerOn("pro");
    // Four people besides the owner, added while on Pro.
    for (const alias of ["g1", "g2", "g3", "g4"]) {
      await registerUser(alias);
      await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid(alias), role: "viewer" });
    }
    await setWorkspacePlan(W, "free");
    expect(await countMembers(W)).toBe(5);

    await expect(
      ws.addMember(uid("own"), W, { email: "g5@example.com", access: { mode: "all", role: "viewer" } }),
    ).rejects.toMatchObject(planLimit({ limit: "members", plan: "free", max: 3, used: 5 }));
    // Everyone already there stays.
    expect(await countMembers(W)).toBe(5);
    // Features follow the plan straight away — there's no grace period.
    await expect(assertVoiceAllowed(W)).rejects.toMatchObject(planLimit({ limit: "voice", plan: "free" }));
  });
});

// ── Add limits up front (getAddLimits) ────────────────────────────────────

describe("getAddLimits", () => {
  it("a fresh Free workspace: room on every meter, and no second free workspace", async () => {
    const W = await ownerOn("free");
    expect(await getAddLimits(W, uid("own"))).toEqual({
      plan: "free",
      readOnly: false,
      spaces: { used: 1, limit: 2, reached: false },
      categories: { used: 10, limit: 20, reached: false },
      tags: { used: 2, limit: 5, reached: false },
      members: { used: 1, limit: 3, reached: false },
      profilesPerSpace: PLAN_LIMITS.free.profilesPerSpace,
      // They already own their one free workspace — this one, so upgrading it
      // is what frees the place for another.
      canCreateFreeWorkspace: false,
      freeSlotHere: true,
      profileLevelAccess: false,
      voice: false,
    });
  });

  it("can create a free workspace once the one they own is paid", async () => {
    const W = await ownerOn("free");
    await setWorkspacePlan(W, "plus");
    expect(await getAddLimits(W, uid("own"))).toMatchObject({
      plan: "plus",
      canCreateFreeWorkspace: true,
      freeSlotHere: false,
      profileLevelAccess: true,
      voice: false,
      categories: { used: 10, limit: PLAN_LIMITS.plus.categories, reached: false },
      tags: { used: 2, limit: PLAN_LIMITS.plus.tags, reached: false },
    });
  });

  it("marks a meter reached at its cap", async () => {
    const W = await ownerOn("free");
    await createSpace(uid("own"), W, { name: "Family" });
    for (let i = 0; i < 3; i++) await createTxnTag(uid("own"), W, { name: `t${i}`, color: "#ef4444" });
    const limits = await getAddLimits(W, uid("own"));
    expect(limits.spaces).toEqual({ used: 2, limit: 2, reached: true });
    expect(limits.tags).toEqual({ used: 5, limit: 5, reached: true });
    expect(limits.categories.reached).toBe(false);
  });

  it("a view-only workspace: every meter is reached, however little is used", async () => {
    const W1 = await ownerOn("free");
    // A second free workspace: create it while the first is paid, then drop
    // the first back to Free — the newer one is the view-only one.
    await setWorkspacePlan(W1, "plus");
    const W2 = (await ws.createWorkspace(uid("own"), { name: "Second" })).id;
    await db()
      .update(workspaces)
      .set({ createdAt: sql`now() + interval '1 minute'` })
      .where(eq(workspaces.id, W2));
    await setWorkspacePlan(W1, "free");

    const limits = await getAddLimits(W2, uid("own"));
    expect(limits).toMatchObject({
      plan: "free",
      readOnly: true,
      canCreateFreeWorkspace: false,
      freeSlotHere: false,
    });
    for (const meter of [limits.spaces, limits.categories, limits.tags, limits.members]) {
      expect(meter.reached).toBe(true);
    }
    expect(limits.categories).toEqual({ used: 10, limit: 20, reached: true });
    // The older free workspace is unaffected. Upgrading it alone wouldn't free
    // a place — they'd still own the view-only one.
    expect(await getAddLimits(W1, uid("own"))).toMatchObject({
      readOnly: false,
      categories: { reached: false },
      freeSlotHere: false,
    });
  });

  it("counts members (invites and grants included) in the same query as the rest", async () => {
    const W = await ownerOn("free");
    await bootstrapUser("mb");
    const all = { mode: "all" as const, role: "viewer" as const };
    await ws.addMember(uid("own"), W, { email: "mb@example.com", access: all });
    await ws.addMember(uid("own"), W, { email: "pending@example.com", access: all });
    const limits = await getAddLimits(W, uid("own"));
    expect(limits.members).toEqual({ used: await countMembers(W), limit: 3, reached: true });
    expect(limits.members.used).toBe(3);
  });

  it("someone else's Free workspace isn't the place to free up a new one", async () => {
    await ownerOn("free");
    await bootstrapUser("oth");
    const theirs = await workspaceIdOf("oth");
    await ws.addMember(uid("oth"), theirs, {
      email: "own@example.com",
      access: { mode: "all", role: "editor" },
    });
    // own still owns a free workspace (so can't create one), but upgrading
    // oth's wouldn't change that.
    expect(await getAddLimits(theirs, uid("own"))).toMatchObject({
      plan: "free",
      canCreateFreeWorkspace: false,
      freeSlotHere: false,
    });
  });

  it("Pro: voice is on", async () => {
    const W = await ownerOn("pro");
    expect(await getAddLimits(W, uid("own"))).toMatchObject({
      plan: "pro",
      voice: true,
      profileLevelAccess: true,
      canCreateFreeWorkspace: true,
      spaces: { used: 1, limit: PLAN_LIMITS.pro.spaces, reached: false },
    });
  });
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

describe("bootstrap", () => {
  it("gives a new user a personal organisation, a Free workspace in it, a Main space and Personal inside", async () => {
    await bootstrapUser("ann");
    const orgs = await db().select().from(organizations).where(eq(organizations.ownerId, uid("ann")));
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ name: "ann's organisation", kind: "personal" });

    const [w] = await db().select().from(workspaces).where(eq(workspaces.ownerId, uid("ann")));
    expect(w).toMatchObject({ organizationId: orgs[0]!.id, plan: "free" });

    const wsSpaces = await db().select().from(spaces).where(eq(spaces.workspaceId, w!.id));
    expect(wsSpaces).toHaveLength(1);
    expect(wsSpaces[0]).toMatchObject({ name: "Main", position: 0 });

    const wsProfiles = await db().select().from(profiles).where(eq(profiles.workspaceId, w!.id));
    expect(wsProfiles).toHaveLength(1);
    expect(wsProfiles[0]).toMatchObject({ name: "Personal", spaceId: wsSpaces[0]!.id });

    // The owner is an admin, so they need no space row.
    expect(await db().select().from(spaceMembers)).toEqual([]);
  });

  it("names the organisation from the email when there's no name", async () => {
    await db()
      .insert(users)
      .values({ id: uid("nn"), firebaseUid: "fb-nn", email: "nora.n@example.com", name: null });
    await ensureBootstrap(uid("nn"));
    const [org] = await db().select().from(organizations).where(eq(organizations.ownerId, uid("nn")));
    expect(org!.name).toBe("nora.n's organisation");
  });

  it("bootstrapping twice creates nothing new", async () => {
    await bootstrapUser("ann");
    const snapshot = async () => ({
      orgs: (await db().select({ n: count() }).from(organizations))[0]!.n,
      workspaces: (await db().select({ n: count() }).from(workspaces))[0]!.n,
      spaces: (await db().select({ n: count() }).from(spaces))[0]!.n,
      profiles: (await db().select({ n: count() }).from(profiles))[0]!.n,
    });
    const before = await snapshot();
    expect(before).toEqual({ orgs: 1, workspaces: 1, spaces: 1, profiles: 1 });
    await ensureBootstrap(uid("ann"));
    await bootstrapUser("ann");
    expect(await snapshot()).toEqual(before);
  });
});

// ── Invites with spaces ────────────────────────────────────────────────────

describe("invites into spaces", () => {
  /** "own" on Free with Main + a second space "Family". */
  async function twoSpaces() {
    const W = await ownerOn("free");
    const main = await defaultSpaceIdOf(W);
    const family = (await createSpace(uid("own"), W, { name: "Family" })).id;
    return { W, main, family };
  }

  const spacesOf = async (alias: string) =>
    (
      await db()
        .select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
        .from(spaceMembers)
        .where(eq(spaceMembers.userId, uid(alias)))
    ).sort((a, b) => a.spaceId.localeCompare(b.spaceId));

  const membership = async (W: string, alias: string) =>
    (
      await db()
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, W), eq(workspaceMembers.userId, uid(alias))))
    )[0]?.role ?? null;

  it("a viewer invite naming one space converts at first bootstrap into membership + exactly that space", async () => {
    const { W, family } = await twoSpaces();
    await ws.addMember(uid("own"), W, {
      email: "inv@example.com",
      access: { mode: "all", role: "viewer", spaceIds: [family] },
    });
    const [invite] = await db().select().from(workspaceInvites).where(eq(workspaceInvites.email, "inv@example.com"));
    expect(invite!.spaceIds).toEqual([family]);

    await bootstrapUser("inv"); // acceptPendingInvites runs here
    expect(await membership(W, "inv")).toBe("viewer");
    expect(await spacesOf("inv")).toEqual([{ spaceId: family, role: "viewer" }]);
  });

  it("the same, accepted from the join link (acceptInviteByToken)", async () => {
    const { W, family } = await twoSpaces();
    await ws.addMember(uid("own"), W, {
      email: "inv2@example.com",
      access: { mode: "all", role: "editor", spaceIds: [family] },
    });
    const [{ token }] = await db()
      .select({ token: workspaceInvites.token })
      .from(workspaceInvites)
      .where(eq(workspaceInvites.email, "inv2@example.com"));
    // They sign up from the link: an account row, then the join page accepts.
    await registerUser("inv2");
    await expect(
      ws.acceptInviteByToken({ id: uid("inv2"), email: "inv2@example.com", name: "inv2" }, token!),
    ).resolves.toEqual({ workspaceId: W });
    expect(await membership(W, "inv2")).toBe("editor");
    expect(await spacesOf("inv2")).toEqual([{ spaceId: family, role: "editor" }]);
  });

  it("omitted spaceIds means every space at invite time — not one created afterwards", async () => {
    const { W, main, family } = await twoSpaces();
    await setWorkspacePlan(W, "plus"); // room for a third space
    await ws.addMember(uid("own"), W, {
      email: "inv@example.com",
      access: { mode: "all", role: "viewer" },
    });
    const later = (await createSpace(uid("own"), W, { name: "Later" })).id;

    await bootstrapUser("inv");
    const got = await spacesOf("inv");
    expect(got).toEqual(
      [main, family].sort().map((spaceId) => ({ spaceId, role: "viewer" })),
    );
    expect(got.some((r) => r.spaceId === later)).toBe(false);
  });

  it("an admin invite joins no space rows (admins see every space)", async () => {
    const { W } = await twoSpaces();
    await ws.addMember(uid("own"), W, { email: "adm@example.com", access: { mode: "all", role: "admin" } });
    const [invite] = await db().select().from(workspaceInvites).where(eq(workspaceInvites.email, "adm@example.com"));
    expect(invite!.spaceIds).toBeNull();
    await bootstrapUser("adm");
    expect(await membership(W, "adm")).toBe("admin");
    expect(await spacesOf("adm")).toEqual([]);
  });

  it("a space id from another workspace is a 400 before anything is written — for a new email", async () => {
    const { W } = await twoSpaces();
    await bootstrapUser("oth");
    const foreign = await defaultSpaceIdOf(await workspaceIdOf("oth"));
    await expect(
      ws.addMember(uid("own"), W, {
        email: "inv@example.com",
        access: { mode: "all", role: "viewer", spaceIds: [foreign] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(workspaceInvites)).toEqual([]);
  });

  it("…and for a registered account: no membership, no space rows", async () => {
    const { W } = await twoSpaces();
    await bootstrapUser("oth");
    await bootstrapUser("reg");
    const foreign = await defaultSpaceIdOf(await workspaceIdOf("oth"));
    await expect(
      ws.addMember(uid("own"), W, {
        email: "reg@example.com",
        access: { mode: "all", role: "viewer", spaceIds: [foreign] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await membership(W, "reg")).toBeNull();
    expect(await spacesOf("reg")).toEqual([]);
  });

  it("…and a bad space id doesn't cost the admin an invite email from their hourly budget", async () => {
    const { W } = await twoSpaces();
    await bootstrapUser("oth");
    await bootstrapUser("reg");
    const foreign = await defaultSpaceIdOf(await workspaceIdOf("oth"));
    for (const email of ["reg@example.com", "new@example.com"]) {
      await expect(
        ws.addMember(uid("own"), W, {
          email,
          access: { mode: "all", role: "viewer", spaceIds: [foreign] },
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
    const [{ n }] = await db()
      .select({ n: count() })
      .from(emailSendLog)
      .where(eq(emailSendLog.userId, uid("own")));
    expect(n).toBe(0);
  });
});
