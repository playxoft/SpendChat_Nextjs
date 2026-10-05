import "server-only";
import { and, count, eq, gte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiUsageLog,
  categories,
  profileAccess,
  profiles,
  spaces,
  tags,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { formatFileSize } from "@/lib/attachments";
import { notFound, planLimit, type ApiError, type PlanLimitKey } from "@/lib/errors";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  inGracePeriod,
  planAtLeast,
  type PersonalPlan,
  type PlanLimits,
} from "@/lib/plans";
import { getWorkspaceStorageUsage } from "@/lib/queries";
import { forgetForRequest, memoizeForRequest } from "@/lib/request-cache";
import { readOnlyWorkspaceError, readOnlyWorkspaceSql } from "@/lib/workspaces";

/**
 * What a workspace's plan allows, and the checks that enforce it — the server
 * half of `lib/plans.ts`. Every limit lives on the **workspace** (members,
 * spaces, profiles per space, categories, tags, storage, AI actions, voice,
 * per-profile access) and is shared by everyone in it.
 *
 * Two rules from the abuse catalogue shape all of it:
 *  - **Limits gate adding, never existing data** (C7, C9). A workspace over a
 *    cap — grandfathered, or after a downgrade — keeps everything it has; it
 *    just can't add another until it's back under or upgrades. Nothing here
 *    deletes.
 *  - **Grandfathering keeps what existed, not what's new** (C9). The grace
 *    period only keeps features running (voice) and extra free workspaces
 *    writable; every *add* follows the plan's limits from day one.
 *
 * The count-then-insert checks are not locked: two concurrent adds can both
 * pass and overshoot a cap by one. Accepted for product caps (the same stance
 * as the storage quota); the next add is refused. The AI allowance is the
 * exception — it costs money per call — and is checked under a lock in
 * `ai-quota.ts`.
 */

export type WorkspaceEntitlements = {
  workspaceId: string;
  ownerId: string;
  plan: PersonalPlan;
  grandfathered: boolean;
  /** Inside the grandfathering grace period (`PLAN_GRACE_ENDS_AT`). */
  inGrace: boolean;
  limits: PlanLimits;
  /** An extra free workspace past its grace period: everything is view-only. */
  readOnly: boolean;
};

const entitlementsKey = (workspaceId: string) => `entitlements:${workspaceId}`;

/**
 * The workspace's plan and limits, memoized per request (`request-cache.ts`) —
 * a server action that checks three limits reads the workspace row once.
 */
export function getWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
  return memoizeForRequest(entitlementsKey(workspaceId), async () => {
    const db = getDb();
    const [row] = await db
      .select({
        ownerId: workspaces.ownerId,
        plan: workspaces.plan,
        grandfathered: workspaces.grandfathered,
        readOnly: readOnlyWorkspaceSql(workspaceId),
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!row) throw notFound("Workspace not found");
    return {
      workspaceId,
      ownerId: row.ownerId,
      plan: row.plan,
      grandfathered: row.grandfathered,
      inGrace: inGracePeriod(row.grandfathered),
      limits: PLAN_LIMITS[row.plan],
      readOnly: Boolean(row.readOnly),
    };
  });
}

/** Drop the memoized plan, for the code path that just changed it. */
export function forgetEntitlements(workspaceId: string): void {
  forgetForRequest(entitlementsKey(workspaceId));
}

/** The workspace's plan (memoized per request). */
export async function getWorkspacePlan(workspaceId: string): Promise<PersonalPlan> {
  return (await getWorkspaceEntitlements(workspaceId)).plan;
}

// ── Errors ─────────────────────────────────────────────────────────────────

type NumericLimit =
  | "members"
  | "spaces"
  | "profilesPerSpace"
  | "categories"
  | "tags"
  | "aiActionsPerMonth"
  | "storageBytes";

/** The cheapest plan above `plan` whose `limit` is higher — what an upgrade buys. */
export function upgradeForLimit(plan: PersonalPlan, limit: NumericLimit): PersonalPlan | null {
  const current = PLAN_LIMITS[plan][limit];
  return (
    PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && PLAN_LIMITS[p][limit] > current) ?? null
  );
}

/** The cheapest plan at or above `plan` that has a boolean feature. */
export function upgradeForFeature(
  plan: PersonalPlan,
  feature: "voice" | "profileLevelAccess" | "fileTrash" | "topUps",
): PersonalPlan | null {
  return PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && PLAN_LIMITS[p][feature]) ?? null;
}

/** "3 members", "1 space" — `noun` is the singular. */
function quantity(n: number, noun: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? noun : `${noun}s`}`;
}

/** A cap-reached error, worded from the plan catalogue. */
function capError(
  ent: WorkspaceEntitlements,
  key: PlanLimitKey,
  limit: NumericLimit,
  noun: string,
  used: number,
  where = "This workspace's",
): ApiError {
  const max = ent.limits[limit];
  const upgradeTo = upgradeForLimit(ent.plan, limit);
  const message = upgradeTo
    ? `${where} ${PLAN_NAMES[ent.plan]} plan includes ${quantity(max, noun)}. Upgrade to ${PLAN_NAMES[upgradeTo]} for ${quantity(PLAN_LIMITS[upgradeTo][limit], noun)}.`
    : `${where} ${PLAN_NAMES[ent.plan]} plan includes ${quantity(max, noun)} — contact us if you need more.`;
  return planLimit(message, { limit: key, plan: ent.plan, max, used, upgradeTo });
}

// ── Counts ─────────────────────────────────────────────────────────────────

/**
 * People who count as members: workspace members, people with a per-profile
 * grant only, and pending invites (by email). Each person once.
 */
export async function countMembers(workspaceId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from (
      select ${workspaceMembers.userId}::text as who from ${workspaceMembers}
        where ${workspaceMembers.workspaceId} = ${workspaceId}
      union
      select ${profileAccess.userId}::text from ${profileAccess}
        join ${profiles} on ${profiles.id} = ${profileAccess.profileId}
        where ${profiles.workspaceId} = ${workspaceId}
      union
      select 'invite:' || ${workspaceInvites.email} from ${workspaceInvites}
        where ${workspaceInvites.workspaceId} = ${workspaceId}
    ) people
  `);
  return Number(result.rows[0]?.n ?? 0);
}

/** Whether a person already counts as a member (so re-scoping them adds nobody). */
async function alreadyCounted(
  workspaceId: string,
  who: { userId?: string | null; email?: string | null },
): Promise<boolean> {
  const db = getDb();
  if (who.userId) {
    const [member] = await db
      .select({ one: sql`1` })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, who.userId)),
      )
      .limit(1);
    if (member) return true;
    const [grant] = await db
      .select({ one: sql`1` })
      .from(profileAccess)
      .innerJoin(profiles, eq(profiles.id, profileAccess.profileId))
      .where(and(eq(profiles.workspaceId, workspaceId), eq(profileAccess.userId, who.userId)))
      .limit(1);
    if (grant) return true;
  }
  if (who.email) {
    const [invite] = await db
      .select({ one: sql`1` })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, who.email.trim().toLowerCase()),
        ),
      )
      .limit(1);
    if (invite) return true;
  }
  return false;
}

export async function countSpaces(workspaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId));
  return row?.n ?? 0;
}

export async function countProfilesInSpace(spaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(profiles)
    .where(eq(profiles.spaceId, spaceId));
  return row?.n ?? 0;
}

export async function countCategories(workspaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId));
  return row?.n ?? 0;
}

export async function countTags(workspaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId));
  return row?.n ?? 0;
}

// ── Assertions ─────────────────────────────────────────────────────────────

/**
 * A view-only workspace (an extra free one past its grace period) can't gain
 * anything — no members, spaces, profiles, categories or tags — even through
 * the workspace-admin paths that don't go through a profile role. Removing and
 * reading stay open, so the owner can still clean up or export.
 */
function assertWritable(ent: WorkspaceEntitlements): void {
  if (ent.readOnly) throw readOnlyWorkspaceError();
}

/** `assertWritable` for callers that hold only the id — granting access counts as adding. */
export async function assertWorkspaceWritable(workspaceId: string): Promise<void> {
  assertWritable(await getWorkspaceEntitlements(workspaceId));
}

/**
 * Throw `plan_limit` unless the workspace has room for one more person. A
 * person who already counts (a member being re-scoped, an invite being
 * edited) adds nobody and always passes.
 */
export async function assertCanAddMember(
  workspaceId: string,
  who: { userId?: string | null; email?: string | null },
): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertWritable(ent);
  if (await alreadyCounted(workspaceId, who)) return;
  const used = await countMembers(workspaceId);
  if (used + 1 > ent.limits.members) throw capError(ent, "members", "members", "member", used);
}

export async function assertCanAddSpace(workspaceId: string): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertWritable(ent);
  const used = await countSpaces(workspaceId);
  if (used + 1 > ent.limits.spaces) throw capError(ent, "spaces", "spaces", "space", used);
}

/** Room for `adding` more profiles in one space (creating, or moving profiles in). */
export async function assertCanAddProfilesToSpace(
  workspaceId: string,
  spaceId: string,
  adding = 1,
): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertWritable(ent);
  const used = await countProfilesInSpace(spaceId);
  if (used + adding > ent.limits.profilesPerSpace) {
    throw capError(ent, "profilesPerSpace", "profilesPerSpace", "profile", used, "Each space on this workspace's");
  }
}

/** The 15 seeded defaults count; deleting one frees a slot. */
export async function assertCanAddCategory(workspaceId: string): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertWritable(ent);
  const used = await countCategories(workspaceId);
  if (used + 1 > ent.limits.categories) {
    throw capError(ent, "categories", "categories", "category", used);
  }
}

export async function assertCanAddTag(workspaceId: string): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertWritable(ent);
  const used = await countTags(workspaceId);
  if (used + 1 > ent.limits.tags) throw capError(ent, "tags", "tags", "tag", used);
}

/**
 * Per-profile access (overrides, and new single-profile grants) needs Plus or
 * Pro. Existing overrides keep enforcing after a downgrade — only *changing*
 * them is gated — so a downgrade can never widen anyone's access.
 */
export async function assertProfileLevelAccess(workspaceId: string): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  if (ent.limits.profileLevelAccess) return;
  const upgradeTo = upgradeForFeature(ent.plan, "profileLevelAccess");
  throw planLimit(
    `Per-profile access is part of ${upgradeTo ? PLAN_NAMES[upgradeTo] : "a paid plan"}. On ${PLAN_NAMES[ent.plan]}, give people Read or Read + write on a whole space.`,
    { limit: "profileLevelAccess", plan: ent.plan, upgradeTo },
  );
}

/** Voice is on Pro — and keeps working for grandfathered workspaces during their grace period. */
export function voiceAllowed(ent: WorkspaceEntitlements): boolean {
  return ent.limits.voice || ent.inGrace;
}

export async function assertVoiceAllowed(workspaceId: string): Promise<void> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  if (voiceAllowed(ent)) return;
  const upgradeTo = upgradeForFeature(ent.plan, "voice");
  throw planLimit(
    `Voice entry is part of ${upgradeTo ? PLAN_NAMES[upgradeTo] : "a paid plan"}. You can still type or paste a note for the AI.`,
    { limit: "voice", plan: ent.plan, upgradeTo },
  );
}

/**
 * One free workspace per person (abuse rule C5). Creating another workspace
 * needs a paid plan for it — until checkout exists (personal phase 9) that
 * means the request is refused with an upgrade prompt.
 */
export async function assertCanCreateFreeWorkspace(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(and(eq(workspaces.ownerId, userId), eq(workspaces.plan, "free")));
  const used = row?.n ?? 0;
  if (used === 0) return;
  throw planLimit(
    "You already have a free workspace. Each extra workspace needs its own Plus or Pro plan.",
    { limit: "freeWorkspaces", plan: "free", max: 1, used, upgradeTo: "plus" },
  );
}

// ── Storage ────────────────────────────────────────────────────────────────

/** The workspace's storage limit in bytes (vault files + transaction attachments). */
export async function getStorageLimitBytes(workspaceId: string): Promise<number> {
  return (await getWorkspaceEntitlements(workspaceId)).limits.storageBytes;
}

/** The message for an upload that won't fit, worded from the plan. */
export function storageFullMessage(
  ent: WorkspaceEntitlements,
  usedBytes: number,
  incomingBytes: number,
): string {
  const limit = ent.limits.storageBytes;
  const remaining = Math.max(0, limit - usedBytes);
  const upgradeTo = upgradeForLimit(ent.plan, "storageBytes");
  const upgrade = upgradeTo
    ? ` Upgrade to ${PLAN_NAMES[upgradeTo]} for ${formatFileSize(PLAN_LIMITS[upgradeTo].storageBytes)}.`
    : "";
  return remaining <= 0
    ? `The workspace's ${formatFileSize(limit)} storage is full — delete some files to free up space.${upgrade}`
    : `Not enough storage left — this upload needs ${formatFileSize(incomingBytes)} but only ${formatFileSize(remaining)} of the ${formatFileSize(limit)} remains.${upgrade}`;
}

// ── AI allowance ───────────────────────────────────────────────────────────

/** The first instant of the calendar month (UTC) that `now` falls in. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** When the allowance next resets: the first instant of next month (UTC). */
export function nextMonthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * The SQL filter for "AI actions that count against this workspace": its own
 * rows — whatever plan it was on (C1, C3: cancelling, re-subscribing or
 * upgrading never resets usage) — and, for a Free workspace, every Free action
 * of the same owner this month, deleted workspaces included (C2: the free
 * allowance belongs to the person, so deleting and recreating a free workspace
 * doesn't refill it).
 */
export function aiUsageScope(ent: Pick<WorkspaceEntitlements, "workspaceId" | "ownerId" | "plan">) {
  return ent.plan === "free"
    ? or(
        eq(aiUsageLog.workspaceId, ent.workspaceId),
        and(eq(aiUsageLog.ownerId, ent.ownerId), eq(aiUsageLog.plan, "free")),
      )!
    : eq(aiUsageLog.workspaceId, ent.workspaceId);
}

/** AI actions counted against the workspace this calendar month. */
export async function aiActionsUsedThisMonth(
  ent: Pick<WorkspaceEntitlements, "workspaceId" | "ownerId" | "plan">,
  now: Date = new Date(),
  db: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ used: sql<string>`coalesce(sum(${aiUsageLog.units}), 0)::text` })
    .from(aiUsageLog)
    .where(and(aiUsageScope(ent), gte(aiUsageLog.createdAt, monthStartUtc(now))));
  return Number(row?.used ?? 0);
}

export type AiAllowance = {
  used: number;
  limit: number;
  remaining: number;
  /** Top-up actions left (personal phase 9); 0 until top-ups exist. */
  topUpRemaining: number;
  resetsAt: string;
};

export async function getAiAllowance(workspaceId: string, now: Date = new Date()): Promise<AiAllowance> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const used = await aiActionsUsedThisMonth(ent, now);
  const limit = ent.limits.aiActionsPerMonth;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    topUpRemaining: 0,
    resetsAt: nextMonthStartUtc(now).toISOString(),
  };
}

/** The `plan_limit` error for an exhausted monthly AI allowance. */
export function aiAllowanceError(ent: WorkspaceEntitlements, used: number): ApiError {
  const limit = ent.limits.aiActionsPerMonth;
  const upgradeTo = upgradeForLimit(ent.plan, "aiActionsPerMonth");
  const resets = nextMonthStartUtc().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const message = upgradeTo
    ? `This workspace has used its ${limit.toLocaleString("en-US")} AI actions for this month — they refill on ${resets}. Upgrade to ${PLAN_NAMES[upgradeTo]} for ${PLAN_LIMITS[upgradeTo].aiActionsPerMonth.toLocaleString("en-US")} a month.`
    : `This workspace has used its ${limit.toLocaleString("en-US")} AI actions for this month — they refill on ${resets}.`;
  return planLimit(message, { limit: "aiActions", plan: ent.plan, max: limit, used, upgradeTo });
}

// ── Usage summary ──────────────────────────────────────────────────────────

export type Meter = { used: number; limit: number };

export type WorkspaceUsage = {
  plan: PersonalPlan;
  grandfathered: boolean;
  inGrace: boolean;
  readOnly: boolean;
  ai: AiAllowance;
  storage: { usedBytes: number; limitBytes: number };
  members: Meter;
  spaces: Meter;
  categories: Meter;
  tags: Meter;
  /** Per-space profile cap (shown beside each space, not summed). */
  profilesPerSpace: number;
  voice: boolean;
  profileLevelAccess: boolean;
};

/** Everything the usage panel shows, in one call. */
export async function getUsage(workspaceId: string): Promise<WorkspaceUsage> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const [ai, storageUsed, members, spaceCount, categoryCount, tagCount] = await Promise.all([
    getAiAllowance(workspaceId),
    getWorkspaceStorageUsage(workspaceId),
    countMembers(workspaceId),
    countSpaces(workspaceId),
    countCategories(workspaceId),
    countTags(workspaceId),
  ]);
  return {
    plan: ent.plan,
    grandfathered: ent.grandfathered,
    inGrace: ent.inGrace,
    readOnly: ent.readOnly,
    ai,
    storage: { usedBytes: storageUsed, limitBytes: ent.limits.storageBytes },
    members: { used: members, limit: ent.limits.members },
    spaces: { used: spaceCount, limit: ent.limits.spaces },
    categories: { used: categoryCount, limit: ent.limits.categories },
    tags: { used: tagCount, limit: ent.limits.tags },
    profilesPerSpace: ent.limits.profilesPerSpace,
    voice: voiceAllowed(ent),
    profileLevelAccess: ent.limits.profileLevelAccess,
  };
}
