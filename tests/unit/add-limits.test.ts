import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, type PersonalPlan } from "@/lib/plans";
import {
  addLock,
  aiActionsLock,
  newWorkspaceLock,
  profileAccessLock,
  readOnlyLock,
  spaceHasRoom,
  type AddLimitsData,
  type AddMeter,
} from "@/lib/add-limits";
import { limitPitch } from "@/lib/plan-copy";

/**
 * The locks the "new …" buttons and create forms show before anything is
 * submitted. The numbers must match `PLAN_LIMITS` (what the server enforces),
 * a view-only workspace locks every create, and no data locks nothing.
 */

function meter(used: number, limit: number, readOnly = false): AddMeter {
  return { used, limit, reached: readOnly || used >= limit };
}

function limitsFor(
  plan: PersonalPlan,
  used: Partial<Record<"spaces" | "categories" | "tags" | "members", number>> = {},
  extra: Partial<AddLimitsData> = {},
): AddLimitsData {
  const l = PLAN_LIMITS[plan];
  const readOnly = extra.readOnly ?? false;
  return {
    plan,
    readOnly,
    spaces: meter(used.spaces ?? 1, l.spaces, readOnly),
    categories: meter(used.categories ?? 10, l.categories, readOnly),
    tags: meter(used.tags ?? 0, l.tags, readOnly),
    members: meter(used.members ?? 1, l.members, readOnly),
    profilesPerSpace: l.profilesPerSpace,
    canCreateFreeWorkspace: true,
    freeSlotHere: false,
    profileLevelAccess: l.profileLevelAccess,
    voice: l.voice,
    ...extra,
  };
}

function withBudgets(plan: PersonalPlan, used: number, readOnly = false): AddLimitsData {
  const b = PLAN_LIMITS[plan].budgets;
  return limitsFor(plan, {}, {
    readOnly,
    budgets: { ...meter(used, b.max, readOnly), unlimited: b.displayUnlimited },
  });
}

describe("addLock — budgets (5 / 20 / Unlimited)", () => {
  it("is open under the cap, and absent data locks nothing", () => {
    expect(addLock(withBudgets("free", 4), "budgets")).toBeNull();
    expect(addLock(limitsFor("free"), "budgets")).toBeNull();
  });

  it("names the next plan's number on Free, and 'unlimited' on the way to Pro", () => {
    expect(addLock(withBudgets("free", 5), "budgets")).toEqual({
      title: "Budget limit reached",
      reason: "Free includes 5 budgets — upgrade to Plus for 20.",
      cta: "Upgrade",
      info: { limit: "budgets", plan: "free", max: 5, used: 5, upgradeTo: "plus" },
    });
    expect(addLock(withBudgets("plus", 20), "budgets")?.reason).toBe(
      "Plus includes 20 budgets — upgrade to Pro for unlimited budgets.",
    );
  });

  it("never locks Pro before its safety cap, and says 'Contact us' at it", () => {
    expect(addLock(withBudgets("pro", 199), "budgets")).toBeNull();
    const lock = addLock(withBudgets("pro", 200), "budgets");
    expect(lock?.cta).toBe("Contact us");
    expect(lock?.reason).toBe("This workspace has 200 budgets — contact us if you need more.");
    expect(lock?.info.upgradeTo).toBeNull();
    // A count the caller knows to be fresher wins.
    expect(addLock(withBudgets("pro", 150), "budgets", { used: 200 })?.cta).toBe("Contact us");
  });

  it("locks every budget in a view-only workspace", () => {
    expect(addLock(withBudgets("free", 0, true), "budgets")?.title).toBe("This workspace is view-only");
  });
});

describe("addLock", () => {
  it("locks nothing without data (outside the app layout)", () => {
    expect(addLock(null, "spaces")).toBeNull();
    expect(addLock(undefined, "workspaces")).toBeNull();
    expect(spaceHasRoom(null, 999)).toBe(true);
  });

  it("is open under the cap and locked at it, with the next plan's number", () => {
    expect(addLock(limitsFor("free", { spaces: 1 }), "spaces")).toBeNull();
    const lock = addLock(limitsFor("free", { spaces: 2 }), "spaces");
    expect(lock).toEqual({
      title: "Space limit reached",
      reason: "Free includes 2 spaces — upgrade to Plus for 6.",
      cta: "Upgrade",
      info: { limit: "spaces", plan: "free", max: 2, used: 2, upgradeTo: "plus" },
    });
  });

  it("words each counted limit from PLAN_LIMITS", () => {
    const free = limitsFor("free", { categories: 20, tags: 5, members: 3 });
    expect(addLock(free, "categories")?.reason).toBe(
      "Free includes 20 categories — upgrade to Plus for 30.",
    );
    expect(addLock(free, "tags")?.reason).toBe("Free includes 5 tags — upgrade to Plus for 10.");
    expect(addLock(free, "members")?.reason).toBe(
      "Free includes 3 members — upgrade to Plus for 5.",
    );
    expect(addLock(free, "members")?.title).toBe("Member limit reached");
  });

  it("says contact us when no plan lifts the cap", () => {
    const lock = addLock(limitsFor("pro", { spaces: PLAN_LIMITS.pro.spaces }), "spaces");
    expect(lock?.reason).toBe("Pro includes 15 spaces — contact us if you need more.");
    expect(lock?.cta).toBe("Contact us");
    expect(lock?.info.upgradeTo).toBeNull();
  });

  it("uses a fresher local count when it's higher than the layout's", () => {
    const limits = limitsFor("free", { tags: 4 });
    expect(addLock(limits, "tags")).toBeNull();
    expect(addLock(limits, "tags", { used: 5 })?.info.used).toBe(5);
    // A lower local count never unlocks what the server says is full.
    expect(addLock(limitsFor("free", { tags: 5 }), "tags", { used: 2 })).not.toBeNull();
  });

  it("checks profiles against the target space's count", () => {
    const limits = limitsFor("free");
    expect(addLock(limits, "profiles", { profileCount: 2 })).toBeNull();
    const full = addLock(limits, "profiles", { profileCount: 3 });
    expect(full?.title).toBe("This space is full");
    expect(full?.reason).toBe("Free holds 3 profiles in each space — upgrade to Plus for 5.");
    expect(full?.info).toEqual({
      limit: "profilesPerSpace",
      plan: "free",
      max: 3,
      used: 3,
      upgradeTo: "plus",
    });
    // Moving several in needs room for all of them.
    expect(spaceHasRoom(limits, 1, 2)).toBe(true);
    expect(spaceHasRoom(limits, 2, 2)).toBe(false);
  });

  it("locks every create in a view-only workspace", () => {
    const limits = limitsFor("free", {}, { readOnly: true });
    for (const kind of ["spaces", "categories", "tags", "members", "profiles"] as const) {
      expect(addLock(limits, kind)).toEqual(readOnlyLock("free"));
    }
    expect(spaceHasRoom(limits, 0)).toBe(false);
    expect(readOnlyLock("free").reason).toBe(
      "This workspace is view-only — upgrade it to add more.",
    );
  });

  it("gates a new workspace on the one-free-workspace rule, not on this workspace", () => {
    expect(addLock(limitsFor("free"), "workspaces")).toBeNull();
    // A view-only workspace doesn't stop someone creating their first free one.
    expect(addLock(limitsFor("free", {}, { readOnly: true }), "workspaces")).toBeNull();
    const lock = addLock(limitsFor("pro", {}, { canCreateFreeWorkspace: false }), "workspaces");
    expect(lock?.reason).toBe(
      "You already have a free workspace — each extra workspace needs its own Plus or Pro plan.",
    );
    // About creating one — not the view-only words — and on the real plan.
    expect(lock?.info).toMatchObject({ limit: "newWorkspace", plan: "pro", upgradeTo: "plus" });
  });

  it("points the new-workspace lock at the free workspace to upgrade", () => {
    // This is their one free workspace: upgrading it frees the place.
    const here = addLock(
      limitsFor("free", {}, { canCreateFreeWorkspace: false, freeSlotHere: true }),
      "workspaces",
    );
    expect(here).toEqual(newWorkspaceLock({ plan: "free", freeSlotHere: true }));
    expect(here?.cta).toBe("Upgrade");
    expect(here?.info).toMatchObject({ plan: "free", freeSlotHere: true });
    // Their free workspace is another one — a paid workspace, or someone else's.
    for (const plan of ["free", "plus", "pro"] as const) {
      const elsewhere = addLock(limitsFor(plan, {}, { canCreateFreeWorkspace: false }), "workspaces");
      expect(elsewhere?.cta).toBe("Upgrade your free workspace");
      expect(elsewhere?.info).toMatchObject({ limit: "newWorkspace", plan, freeSlotHere: false });
    }
  });

  it("locks per-profile access below Plus only", () => {
    expect(addLock(limitsFor("plus"), "profileLevelAccess")).toBeNull();
    const lock = addLock(limitsFor("free"), "profileLevelAccess");
    expect(lock).toEqual(profileAccessLock("free"));
    expect(lock?.reason).toBe(
      "Per-profile access is on Plus and Pro — choose who sees which profile.",
    );
    expect(lock?.info).toEqual({ limit: "profileLevelAccess", plan: "free", upgradeTo: "plus" });
  });

  it("hands the upgrade dialog info it can explain", () => {
    const limits = limitsFor("free", { spaces: 2, categories: 20, tags: 5, members: 3 });
    for (const kind of ["spaces", "categories", "tags", "members", "profileLevelAccess"] as const) {
      const lock = addLock(limits, kind);
      expect(lock).not.toBeNull();
      const pitch = limitPitch(lock!.info);
      expect(pitch.upgradeTo).toBe("plus");
      expect(pitch.pitch).toContain("Plus");
    }
  });

  it("never mentions grace periods or deleting anything", () => {
    const limits = limitsFor("free", { spaces: 2, categories: 20, tags: 5, members: 3 });
    const texts = (["spaces", "categories", "tags", "members", "profileLevelAccess"] as const)
      .map((k) => addLock(limits, k))
      .concat(readOnlyLock("free"), addLock({ ...limits, canCreateFreeWorkspace: false }, "workspaces"))
      .flatMap((l) => (l ? [l.title, l.reason] : []));
    for (const t of texts) expect(t).not.toMatch(/grace|grandfather|delet/i);
  });
});

describe("aiActionsLock — the AI composers at zero", () => {
  it("names this plan's monthly actions and the next plan's, from PLAN_LIMITS", () => {
    const lock = aiActionsLock("free", PLAN_LIMITS.free.aiActionsPerMonth);
    expect(lock.title).toBe("No AI actions left this month");
    expect(lock.reason).toBe(
      `Free includes ${PLAN_LIMITS.free.aiActionsPerMonth} AI actions a month — upgrade to Plus for ${PLAN_LIMITS.plus.aiActionsPerMonth.toLocaleString("en-US")}.`,
    );
    expect(lock.cta).toBe("Upgrade");
    expect(lock.info).toEqual({
      limit: "aiActions",
      plan: "free",
      max: PLAN_LIMITS.free.aiActionsPerMonth,
      used: PLAN_LIMITS.free.aiActionsPerMonth,
      upgradeTo: "plus",
    });
  });

  it("says contact us on the biggest plan", () => {
    const lock = aiActionsLock("pro", PLAN_LIMITS.pro.aiActionsPerMonth, 1000);
    expect(lock.cta).toBe("Contact us");
    expect(lock.info.upgradeTo).toBeNull();
    expect(lock.reason).toContain("contact us");
  });
});
