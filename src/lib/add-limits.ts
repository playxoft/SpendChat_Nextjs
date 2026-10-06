import { PERSONAL_PLANS, PLAN_LIMITS, PLAN_NAMES, planAtLeast, type PersonalPlan } from "@/lib/plans";
import { nextPlanFor, quantity, type NumericPlanLimit, type PlanLimitInfo } from "@/lib/plan-limit";

/**
 * The "can I add one more?" side of the plan limits, for the UI to show *before*
 * someone fills a form in: a lock on the button, a short reason, and the info
 * the upgrade dialog needs. Pure and client-safe — the data is
 * `getAddLimits()` (read once in the app layout) and the numbers come from the
 * same `PLAN_LIMITS` the server enforces.
 *
 * This only decides what the UI offers. The server still checks every create,
 * and a refusal there still opens the upgrade dialog (`handlePlanLimit`).
 */

/** A cap and how much of it is in use; `reached` = nothing more can be added. */
export type AddMeter = { used: number; limit: number; reached: boolean };

/** What `getAddLimits` returns (kept structural — entitlements are server-only). */
export type AddLimitsData = {
  plan: PersonalPlan;
  /** View-only workspace: nothing can be added at all. */
  readOnly: boolean;
  spaces: AddMeter;
  categories: AddMeter;
  tags: AddMeter;
  members: AddMeter;
  profilesPerSpace: number;
  /** This user can create one more workspace on Free (they don't own a free one yet). */
  canCreateFreeWorkspace: boolean;
  /**
   * The open workspace is this user's one free workspace, so upgrading it frees
   * the free place a new workspace needs.
   */
  freeSlotHere: boolean;
  /** Free workspaces the person owns; optional so older callers/tests still fit. */
  freeOwned?: number;
  profileLevelAccess: boolean;
  voice: boolean;
};

export type AddLockKind =
  | "spaces"
  /** A profile in one space — pass that space's `profileCount`. */
  | "profiles"
  | "categories"
  | "tags"
  | "members"
  /** A new workspace — the one-free-workspace-per-person rule. */
  | "workspaces"
  | "profileLevelAccess";

/** Why something can't be added, in the words the lock, tooltip and panel show. */
export type AddLock = {
  /** Short headline for the panel inside a form: "Space limit reached". */
  title: string;
  /** One line for the tooltip and the panel: "Free includes 2 spaces — upgrade to Plus for 6." */
  reason: string;
  /**
   * The upgrade button's label: "Upgrade", "Contact us" when no plan lifts it,
   * or "Upgrade your free workspace" when the upgrade is for another workspace.
   */
  cta: string;
  /** What the upgrade dialog explains (`showUpgrade(lock.info)`). */
  info: PlanLimitInfo;
};

export type AddLockOptions = {
  /**
   * A count the caller knows to be at least as fresh as the layout's (a list
   * it holds, with things created since). The larger of the two is used.
   */
  used?: number;
  /** "profiles": profiles already in the target space. */
  profileCount?: number;
  /** "profiles": how many are being added at once (moving several in). */
  adding?: number;
};

const NOUNS = {
  spaces: ["space", "spaces"],
  categories: ["category", "categories"],
  tags: ["tag", "tags"],
  members: ["member", "members"],
} as const;

type MeterKind = keyof typeof NOUNS;

/** "Plus and Pro" / "Plus or Pro" — the paid plans, named from the catalogue. */
function paidPlans(join: "and" | "or", feature?: "profileLevelAccess" | "fileTrash"): string {
  const names = PERSONAL_PLANS.filter((p) =>
    feature ? PLAN_LIMITS[p][feature] : p !== "free",
  ).map((p) => PLAN_NAMES[p]);
  if (names.length <= 1) return names[0] ?? "a paid plan";
  return `${names.slice(0, -1).join(", ")} ${join} ${names[names.length - 1]}`;
}

function cta(upgradeTo: PersonalPlan | null): string {
  return upgradeTo ? "Upgrade" : "Contact us";
}

/**
 * The lock on "New workspace": the person already has their one free
 * workspace. About the person, not the open workspace — so it shows on a paid
 * or a view-only workspace too — but the way out depends on it: upgrade this
 * one when it's their free one (`freeSlotHere`), else upgrade the free one
 * they have. Either way the new workspace can then start on Free.
 */
export function newWorkspaceLock(
  limits: Pick<AddLimitsData, "plan" | "freeSlotHere"> & { freeOwned?: number },
): AddLock {
  return {
    title: "You already have a free workspace",
    reason: `You already have a free workspace — each extra workspace needs its own ${paidPlans("or")} plan.`,
    cta: limits.freeSlotHere ? "Upgrade" : "Upgrade your free workspace",
    info: {
      limit: "newWorkspace",
      plan: limits.plan,
      max: 1,
      used: 1,
      // The plan a free workspace moves up to, wherever that workspace is.
      upgradeTo: "plus",
      freeSlotHere: limits.freeSlotHere,
      freeOwned: limits.freeOwned,
    },
  };
}

/** The lock for a view-only workspace — every create in it. */
export function readOnlyLock(plan: PersonalPlan): AddLock {
  return {
    title: "This workspace is view-only",
    reason: "This workspace is view-only — upgrade it to add more.",
    cta: "Upgrade",
    info: { limit: "freeWorkspaces", plan, upgradeTo: "plus" },
  };
}

/** The lock on per-profile access (the "Specific profiles" option, the override matrix). */
export function profileAccessLock(plan: PersonalPlan): AddLock {
  const upgradeTo =
    PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && PLAN_LIMITS[p].profileLevelAccess) ?? null;
  const on = paidPlans("and", "profileLevelAccess");
  return {
    title: `Per-profile access is on ${on}`,
    reason: `Per-profile access is on ${on} — choose who sees which profile.`,
    cta: cta(upgradeTo),
    info: { limit: "profileLevelAccess", plan, upgradeTo },
  };
}

/** The trash for files and folders (the trash page's Files tab on Free). */
export function fileTrashLock(plan: PersonalPlan): AddLock {
  const upgradeTo =
    PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && PLAN_LIMITS[p].fileTrash) ?? null;
  const on = paidPlans("and", "fileTrash");
  return {
    title: `Deleted files wait in the trash on ${on}`,
    reason: `On ${PLAN_NAMES[plan]}, deleting a file or folder is final. ${on} keep them in the trash for 30 days.`,
    cta: cta(upgradeTo),
    info: { limit: "fileTrash", plan, upgradeTo },
  };
}

/** "Free includes 2 spaces — upgrade to Plus for 6." */
function capLock(
  plan: PersonalPlan,
  title: string,
  key: NumericPlanLimit,
  limit: PlanLimitInfo["limit"],
  max: number,
  used: number,
  [noun, plural]: readonly [string, string],
  phrase: (n: number) => string = (n) => `includes ${quantity(n, noun, plural)}`,
): AddLock {
  const upgradeTo = nextPlanFor(plan, key);
  const current = `${PLAN_NAMES[plan]} ${phrase(max)}`;
  const reason = upgradeTo
    ? `${current} — upgrade to ${PLAN_NAMES[upgradeTo]} for ${PLAN_LIMITS[upgradeTo][key].toLocaleString("en-US")}.`
    : `${current} — contact us if you need more.`;
  return { title, reason, cta: cta(upgradeTo), info: { limit, plan, max, used, upgradeTo } };
}

const METER_KEY: Record<MeterKind, NumericPlanLimit> = {
  spaces: "spaces",
  categories: "categories",
  tags: "tags",
  members: "members",
};

const METER_TITLE: Record<MeterKind, string> = {
  spaces: "Space limit reached",
  categories: "Category limit reached",
  tags: "Tag limit reached",
  members: "Member limit reached",
};

/**
 * Whether one more `kind` can be added, and if not, why. `null` = go ahead —
 * also when there's no data at all (outside the app layout), so a missing
 * provider never locks anything.
 */
export function addLock(
  limits: AddLimitsData | null | undefined,
  kind: AddLockKind,
  opts: AddLockOptions = {},
): AddLock | null {
  if (!limits) return null;
  const { plan } = limits;

  // One free workspace per person — about the user, not this workspace, so a
  // view-only workspace doesn't change it.
  if (kind === "workspaces") {
    return limits.canCreateFreeWorkspace ? null : newWorkspaceLock(limits);
  }

  if (kind === "profileLevelAccess") {
    return limits.profileLevelAccess ? null : profileAccessLock(plan);
  }

  if (limits.readOnly) return readOnlyLock(plan);

  if (kind === "profiles") {
    const max = limits.profilesPerSpace;
    const inSpace = opts.profileCount ?? 0;
    if (inSpace + (opts.adding ?? 1) <= max) return null;
    return capLock(
      plan,
      "This space is full",
      "profilesPerSpace",
      "profilesPerSpace",
      max,
      inSpace,
      ["profile", "profiles"],
      (n) => `holds ${quantity(n, "profile")} in each space`,
    );
  }

  const meter = limits[kind];
  const used = Math.max(meter.used, opts.used ?? 0);
  if (!meter.reached && used < meter.limit) return null;
  return capLock(plan, METER_TITLE[kind], METER_KEY[kind], kind, meter.limit, used, NOUNS[kind]);
}

/** Room for `adding` more profiles in a space holding `profileCount` (no data = room). */
export function spaceHasRoom(
  limits: AddLimitsData | null | undefined,
  profileCount: number,
  adding = 1,
): boolean {
  return addLock(limits, "profiles", { profileCount, adding }) === null;
}
