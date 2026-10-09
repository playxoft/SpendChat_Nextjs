import "server-only";
import { and, asc, eq, exists, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  organizations,
  profileAccess,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  tags,
  userSettings,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type BillingHold,
  type ProfileAccessLevel,
  type SpaceRole,
  type WorkspaceRole,
} from "@/db/schema";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "@/lib/categories";
import { findUserById } from "@/lib/directory";
import { notTrashed } from "@/lib/trash-scope";
import { ApiError, forbidden, notFound, planLimit } from "@/lib/errors";
import type { PersonalPlan } from "@/lib/plans";
import {
  accessLevelsAtLeast,
  atLeastRole,
  minRole as lowerRole,
  resolveProfileRole,
  rolesAtLeast,
  spaceRolesAtLeast,
} from "@/lib/rbac";
import {
  DEFAULT_SPACE_ICON,
  DEFAULT_SPACE_NAME,
  DEFAULT_WORKSPACE_ICON,
  ORGANIZATION_NAME_MAX,
} from "@/lib/validation";

/**
 * Workspace access resolution — the single source of truth for "which
 * workspaces/profiles can this user see, and with what role". Pure data
 * helpers only (no session, no bootstrap); `src/lib/auth.ts` and the services
 * build on these.
 *
 * The hierarchy is organisation → workspace → space → profile. Access to a
 * profile is decided by `resolveProfileRole` (`lib/rbac.ts`); this file runs
 * the same rules in SQL for list queries (`accessibleProfileIds`) and for one
 * profile (`getEffectiveProfileRole`), and the two must agree.
 */

export type WorkspaceSummary = {
  id: string;
  name: string;
  /** Optional emoji shown beside the name; null until set. */
  icon: string | null;
  ownerId: string;
  /** Currency + number format (locale) are per-workspace. */
  currency: string;
  locale: string;
  /** Workspace-wide role; null when access comes via per-profile grants only. */
  role: WorkspaceRole | null;
  organizationId: string;
  /** The workspace's plan — limits are shared by everyone in it. */
  plan: PersonalPlan;
};

const summaryColumns = {
  id: workspaces.id,
  name: workspaces.name,
  icon: workspaces.icon,
  ownerId: workspaces.ownerId,
  currency: workspaces.currency,
  locale: workspaces.locale,
  organizationId: workspaces.organizationId,
  plan: workspaces.plan,
};

/** Every workspace the user can open: memberships first, then grant-only ones. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const db = getDb();

  const memberOf = await db
    .select({ ...summaryColumns, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.createdAt));

  const memberIds = new Set(memberOf.map((w) => w.id));

  // Workspaces reachable only through a per-profile grant — on a live profile:
  // a grant whose profile is in the trash opens nothing.
  const granted = await db
    .selectDistinct(summaryColumns)
    .from(profileAccess)
    .innerJoin(profiles, eq(profileAccess.profileId, profiles.id))
    .innerJoin(workspaces, eq(profiles.workspaceId, workspaces.id))
    .where(and(eq(profileAccess.userId, userId), notTrashed(profiles)));

  return [
    ...memberOf,
    ...granted
      .filter((w) => !memberIds.has(w.id))
      .map((w) => ({ ...w, role: null as WorkspaceRole | null })),
  ];
}

/**
 * A workspace's currency + number format (locale), for parsing/formatting money.
 * Falls back to USD/en-US if the workspace vanished mid-request. Access is
 * assumed already checked by the caller (it resolved this workspace id).
 */
export async function getWorkspaceMoneyFormat(
  workspaceId: string,
): Promise<{ currency: string; locale: string }> {
  const db = getDb();
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { currency: true, locale: true },
  });
  return { currency: row?.currency ?? "USD", locale: row?.locale ?? "en-US" };
}

/** The user's workspace-wide role, or null when not a member. */
export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return row?.role ?? null;
}

// ── Read-only workspaces ───────────────────────────────────────────────────

/**
 * SQL boolean: is this workspace **view-only**? Two reasons, one definition:
 *
 *  - **an extra free workspace** — Free, and its owner has an *older* Free
 *    workspace ("one free workspace per person", from the day plans ship, with
 *    no grace period). The oldest free workspace always stays writable;
 *  - **a billing hold** — `billing_hold_from` has passed: a renewal that failed
 *    past its grace (abuse rule B3) or a disputed payment (B2), set only by the
 *    billing webhook (`services/billing-webhook.ts`). A future instant is a
 *    grace still running, so nothing is held yet.
 *
 * Nothing is deleted either way: members can still read and export, they just
 * can't add or change anything until the workspace upgrades or its billing is
 * sorted out (`readOnlyErrorFor` says which).
 *
 * One SQL definition, used by `accessibleProfileIds` (lists), by
 * `getEffectiveProfileRole` (one profile) and by the entitlements, so they
 * can't disagree. Pass a workspace id, or a *qualified* column reference
 * (`` sql`${profiles}."workspace_id"` ``) — never a bare Drizzle column.
 *
 * Every column inside is written out by hand, table-qualified. Drizzle drops
 * table names from columns interpolated into a field of a single-table select,
 * so `${alias.id}` would render as a bare `"id"` there — turning the self-join
 * into `"owner_id" = "owner_id"` and the whole condition into a constant. (It
 * did, and a test caught it: no workspace was ever read-only on the
 * single-profile path.)
 */
export function readOnlyWorkspaceSql(workspaceId: SQL | string): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from "workspaces" as "ro_self"
    where "ro_self"."id" = ${workspaceId}
      and (
        ("ro_self"."billing_hold_from" is not null and "ro_self"."billing_hold_from" <= now())
        or (
          "ro_self"."plan" = 'free'
          and exists (
            select 1 from "workspaces" as "ro_older"
            where "ro_older"."owner_id" = "ro_self"."owner_id"
              and "ro_older"."plan" = 'free'
              and ("ro_older"."created_at", "ro_older"."id") < ("ro_self"."created_at", "ro_self"."id")
          )
        )
      )
  )`;
}

/** Why a workspace is view-only, for the words a refusal or a notice uses. */
export type ReadOnlyReason = "extra_free" | BillingHold;

/**
 * The billing hold in force on a workspace row right now, or null — a hold
 * whose instant hasn't come (a B3 grace still running) isn't in force yet.
 */
export function activeBillingHold(
  row: { billingHold: BillingHold | null; billingHoldFrom: Date | null },
  now: Date = new Date(),
): BillingHold | null {
  if (!row.billingHold || !row.billingHoldFrom) return null;
  return row.billingHoldFrom.getTime() <= now.getTime() ? row.billingHold : null;
}

/** The `plan_limit` error for a write into an extra free workspace. */
export function readOnlyWorkspaceError(): ApiError {
  return planLimit(
    "This workspace is view-only on the Free plan — you can have one free workspace. Upgrade it to keep adding to it.",
    { limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" },
  );
}

/**
 * The 403 `billing_hold` for a write into a workspace billing has made
 * view-only. Not a `plan_limit`: upgrading isn't the way out — paying the
 * failed renewal (B3) or settling the dispute with support (B2) is.
 */
export function billingHoldError(hold: BillingHold): ApiError {
  return new ApiError(
    403,
    "billing_hold",
    hold === "dispute"
      ? "This workspace is view-only while a disputed payment is reviewed. Everything in it is still here — contact support to sort it out."
      : "This workspace is view-only because its plan's payment didn't go through. Update the payment method in Settings → Billing to keep adding.",
    { reason: hold },
  );
}

/** The right refusal for a write into a view-only workspace (one read, only on the failure path). */
export async function readOnlyErrorFor(workspaceId: string): Promise<ApiError> {
  const [row] = await getDb()
    .select({ billingHold: workspaces.billingHold, billingHoldFrom: workspaces.billingHoldFrom })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const hold = row ? activeBillingHold(row) : null;
  return hold ? billingHoldError(hold) : readOnlyWorkspaceError();
}

// ── Profile access ─────────────────────────────────────────────────────────

export type ProfileAccessResult = {
  role: WorkspaceRole;
  workspaceId: string;
  spaceId: string;
  /** The workspace is view-only (`readOnlyWorkspaceSql`); `role` is capped at viewer. */
  readOnly: boolean;
};

/**
 * The user's effective role on one profile (`resolveProfileRole`), or null when
 * the profile doesn't exist / isn't accessible. One round trip: every input is
 * a correlated subquery on the profile row.
 *
 * In a view-only workspace the role is capped at viewer, so every write check
 * built on this refuses — `requireProfileRole` turns that into a `plan_limit`
 * error instead of a plain 403.
 */
export async function getEffectiveProfileRole(
  userId: string,
  profileId: string,
): Promise<ProfileAccessResult | null> {
  const db = getDb();
  // Each input is a correlated subquery built with the query builder, not a
  // hand-written `sql` string: in a single-table select Drizzle renders the
  // outer columns unqualified (`"workspace_id"`), which inside a subquery would
  // silently bind to the *inner* table's column of the same name.
  const one = <T>(q: { getSQL(): SQL }) => sql<T>`(${q})`;
  const [row] = await db
    .select({
      workspaceId: profiles.workspaceId,
      spaceId: profiles.spaceId,
      workspaceRole: one<WorkspaceRole | null>(
        db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, profiles.workspaceId),
              eq(workspaceMembers.userId, userId),
            ),
          ),
      ),
      override: one<ProfileAccessLevel | null>(
        db
          .select({ access: profileOverrides.access })
          .from(profileOverrides)
          .where(
            and(eq(profileOverrides.profileId, profiles.id), eq(profileOverrides.userId, userId)),
          ),
      ),
      spaceRole: one<SpaceRole | null>(
        db
          .select({ role: spaceMembers.role })
          .from(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, profiles.spaceId), eq(spaceMembers.userId, userId))),
      ),
      grantRole: one<WorkspaceRole | null>(
        db
          .select({ role: profileAccess.role })
          .from(profileAccess)
          .where(and(eq(profileAccess.profileId, profiles.id), eq(profileAccess.userId, userId))),
      ),
      readOnly: readOnlyWorkspaceSql(sql`${profiles}."workspace_id"`),
    })
    .from(profiles)
    // A profile in the trash grants nothing to anyone — this and
    // `accessibleProfileIds` are what hide a trashed profile's transactions,
    // files and folders from every read and write that scopes through them.
    .where(and(eq(profiles.id, profileId), notTrashed(profiles)))
    .limit(1);
  if (!row) return null;

  const role = resolveProfileRole(row);
  if (!role) return null;
  const readOnly = Boolean(row.readOnly);
  return {
    role: readOnly ? lowerRole(role, "viewer") : role,
    workspaceId: row.workspaceId,
    spaceId: row.spaceId,
    readOnly,
  };
}

/**
 * SQL condition selecting profiles (of the `profiles` table) in `workspaceId`
 * that the user can access with at least `minRole`. Composable into any query
 * via `inArray(<col>, accessibleProfileIds(...))`.
 *
 * The same rules as `resolveProfileRole`, as SQL:
 *   admin member
 *   OR (member AND an override at ≥ minRole)
 *   OR (NOT (member AND any override) AND ((member AND space role ≥ minRole) OR legacy grant ≥ minRole))
 * and, for writes, the workspace must not be view-only.
 */
export function accessibleProfileIds(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = "viewer",
) {
  const db = getDb();
  const roles = rolesAtLeast(minRole);
  const spaceRoles = spaceRolesAtLeast(minRole);
  const levels = accessLevelsAtLeast(minRole);

  const memberRow = (extra?: SQL) =>
    db
      .select({ one: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, profiles.workspaceId),
          eq(workspaceMembers.userId, userId),
          extra,
        ),
      );
  const isMember = exists(memberRow());
  const isAdmin = exists(memberRow(eq(workspaceMembers.role, "admin")));
  const overrideRow = (extra?: SQL) =>
    db
      .select({ one: profileOverrides.userId })
      .from(profileOverrides)
      .where(
        and(
          eq(profileOverrides.profileId, profiles.id),
          eq(profileOverrides.userId, userId),
          extra,
        ),
      );
  const hasOverride = exists(overrideRow());

  const branches: SQL[] = [isAdmin];
  if (levels.length > 0) {
    branches.push(and(isMember, exists(overrideRow(inArray(profileOverrides.access, levels))))!);
  }
  const viaSpaceOrGrant: SQL[] = [];
  if (spaceRoles.length > 0) {
    viaSpaceOrGrant.push(
      and(
        isMember,
        exists(
          db
            .select({ one: spaceMembers.userId })
            .from(spaceMembers)
            .where(
              and(
                eq(spaceMembers.spaceId, profiles.spaceId),
                eq(spaceMembers.userId, userId),
                inArray(spaceMembers.role, spaceRoles),
              ),
            ),
        ),
      )!,
    );
  }
  viaSpaceOrGrant.push(
    exists(
      db
        .select({ one: profileAccess.userId })
        .from(profileAccess)
        .where(
          and(
            eq(profileAccess.profileId, profiles.id),
            eq(profileAccess.userId, userId),
            inArray(profileAccess.role, roles),
          ),
        ),
    ),
  );
  branches.push(and(not(and(isMember, hasOverride)!), or(...viaSpaceOrGrant))!);

  return db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.workspaceId, workspaceId),
        // Live profiles only — see `getEffectiveProfileRole`.
        notTrashed(profiles),
        or(...branches),
        atLeastRole(minRole, "editor") ? not(readOnlyWorkspaceSql(workspaceId)) : undefined,
      ),
    );
}

/**
 * The caller's effective role on every profile they can see in the workspace,
 * in one round trip — for payloads that tag each profile with what the caller
 * can do (`access` on the API's profiles, the sidebar). Same rules and the same
 * view-only cap as `getEffectiveProfileRole`.
 */
export async function profileRolesFor(
  userId: string,
  workspaceId: string,
): Promise<Map<string, WorkspaceRole>> {
  const db = getDb();
  const one = <T>(q: { getSQL(): SQL }) => sql<T>`(${q})`;
  const [wsRole, readOnlyRow] = await Promise.all([
    getWorkspaceRole(userId, workspaceId),
    db.execute<{ ro: boolean }>(sql`select ${readOnlyWorkspaceSql(workspaceId)} as ro`),
  ]);
  const readOnly = Boolean(readOnlyRow.rows[0]?.ro);
  const rows = await db
    .select({
      id: profiles.id,
      override: one<ProfileAccessLevel | null>(
        db
          .select({ access: profileOverrides.access })
          .from(profileOverrides)
          .where(
            and(eq(profileOverrides.profileId, profiles.id), eq(profileOverrides.userId, userId)),
          ),
      ),
      spaceRole: one<SpaceRole | null>(
        db
          .select({ role: spaceMembers.role })
          .from(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, profiles.spaceId), eq(spaceMembers.userId, userId))),
      ),
      grantRole: one<WorkspaceRole | null>(
        db
          .select({ role: profileAccess.role })
          .from(profileAccess)
          .where(and(eq(profileAccess.profileId, profiles.id), eq(profileAccess.userId, userId))),
      ),
    })
    .from(profiles)
    .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)));
  const out = new Map<string, WorkspaceRole>();
  for (const r of rows) {
    const role = resolveProfileRole({ workspaceRole: wsRole, ...r });
    if (role) out.set(r.id, readOnly ? lowerRole(role, "viewer") : role);
  }
  return out;
}

/**
 * Whether the user can write (≥ editor) to at least one profile in the
 * workspace. Drives the UI's viewer gate: a "pure viewer" (no editor access
 * anywhere) sees the compose/add controls replaced with a read-only notice.
 * Backend mutations enforce the per-profile role regardless.
 */
export async function canWriteInWorkspace(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await accessibleProfileIds(userId, workspaceId, "editor").limit(1);
  return rows.length > 0;
}

/**
 * Whether more than one distinct user has access to the workspace — via
 * workspace membership or a per-profile grant on one of its profiles. Drives the
 * tracker chat's author labels (WhatsApp-group style): a solo workspace shows no
 * names, a shared one shows who entered each row.
 */
export async function workspaceHasMultipleUsers(workspaceId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .union(
      db
        .select({ userId: profileAccess.userId })
        .from(profileAccess)
        .innerJoin(profiles, eq(profileAccess.profileId, profiles.id))
        // trash: grants on a trashed profile still count — it's an author-label
        // heuristic, and the people come back with the profile on restore.
        .where(eq(profiles.workspaceId, workspaceId)),
    );
  return new Set(rows.map((r) => r.userId)).size > 1;
}

/**
 * Throw 403/404 unless the user has ≥ `minRole` on the profile. A write into a
 * view-only workspace gets the `plan_limit` error rather than a plain 403, so
 * the client can offer the upgrade instead of "ask an admin".
 */
export async function requireProfileRole(
  userId: string,
  profileId: string,
  minRole: WorkspaceRole,
): Promise<ProfileAccessResult> {
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access) throw notFound("Profile not found");
  if (!atLeastRole(access.role, minRole)) {
    if (access.readOnly && atLeastRole(minRole, "editor")) throw await readOnlyErrorFor(access.workspaceId);
    throw forbidden("You don't have permission to do that");
  }
  return access;
}

/**
 * Gate for adding to a workspace's shared lists (categories, tags): a workspace
 * member with ≥ editor who can also write at least one profile. Since spaces, a
 * workspace "editor" isn't automatically an editor of anything — one in no
 * space (or a viewer in every space) mustn't grow lists everyone shares.
 */
export async function requireSharedListAdd(userId: string, workspaceId: string): Promise<void> {
  const role = await requireWorkspaceRole(userId, workspaceId, "editor");
  if (role === "admin") return;
  if (!(await canWriteInWorkspace(userId, workspaceId))) {
    throw forbidden("You need edit access to a profile here to add to the shared lists");
  }
}

/**
 * Gate for renaming or deleting a shared-list entry (a category or a tag).
 * Those edits reach every transaction in the workspace — deleting a category
 * clears it on all of them, deleting a tag strips it from all of them — so
 * below admin they need write access to *every* profile, the reach a workspace
 * editor had before spaces existed (and still has after the backfill, which
 * puts each one in the space holding every profile). A view-only workspace
 * refuses them too.
 */
export async function requireSharedListEdit(userId: string, workspaceId: string): Promise<void> {
  const role = await requireWorkspaceRole(userId, workspaceId, "editor");
  const db = getDb();
  const [ro] = (
    await db.execute<{ ro: boolean }>(sql`select ${readOnlyWorkspaceSql(workspaceId)} as ro`)
  ).rows;
  if (ro?.ro) throw await readOnlyErrorFor(workspaceId);
  if (role === "admin") return;
  const [all, writable] = await Promise.all([
    // Live profiles: a trashed one is nobody's to write, so counting it would
    // lock every non-admin editor out of the shared lists.
    db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles))),
    accessibleProfileIds(userId, workspaceId, "editor"),
  ]);
  if (writable.length < all.length) {
    throw forbidden(
      "Only someone who can edit every profile in this workspace can rename or delete its shared categories and tags",
    );
  }
}

/**
 * What the shared-list screens (Settings → Categories / Tags) should offer —
 * the same rules as `requireSharedListAdd` / `requireSharedListEdit`, as
 * booleans, so the page never shows a button the server will refuse.
 */
export async function sharedListAccess(
  userId: string,
  workspaceId: string,
): Promise<{ canAdd: boolean; canEdit: boolean }> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!atLeastRole(role, "editor")) return { canAdd: false, canEdit: false };
  const db = getDb();
  const [[ro], all, writable] = await Promise.all([
    db
      .execute<{ ro: boolean }>(sql`select ${readOnlyWorkspaceSql(workspaceId)} as ro`)
      .then((r) => r.rows),
    db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles))),
    accessibleProfileIds(userId, workspaceId, "editor"),
  ]);
  if (ro?.ro) return { canAdd: false, canEdit: false };
  if (role === "admin") return { canAdd: true, canEdit: true };
  return { canAdd: writable.length > 0, canEdit: writable.length >= all.length };
}

/** Throw unless the user is a workspace member with ≥ `minRole`. */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) throw notFound("Workspace not found");
  if (!rolesAtLeast(minRole).includes(role)) {
    throw forbidden("You don't have permission to do that");
  }
  return role;
}

// ── Organisations, spaces, workspace creation ──────────────────────────────

type DbOrTx = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** "<name>'s organisation", kept within `ORGANIZATION_NAME_MAX`. */
export function defaultOrganizationName(display?: string | null): string {
  const name = display?.trim();
  if (!name) return "My organisation";
  const suffix = "'s organisation";
  const room = ORGANIZATION_NAME_MAX - suffix.length;
  const trimmed = name.length > room ? name.slice(0, room).trimEnd() : name;
  return trimmed ? `${trimmed}${suffix}` : "My organisation";
}

/**
 * The id of the user's personal organisation, creating it on first use. Safe
 * under concurrency: the partial unique index (one personal organisation per
 * owner) turns a losing insert into a no-op, and the re-read finds the winner.
 */
export async function ensurePersonalOrganization(
  userId: string,
  display?: string | null,
  db: DbOrTx = getDb(),
): Promise<string> {
  const find = () =>
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.ownerId, userId), eq(organizations.kind, "personal")))
      .limit(1);
  const [existing] = await find();
  if (existing) return existing.id;

  let name = display;
  if (name === undefined) {
    const user = await findUserById(userId);
    name = user?.name?.trim() || user?.email?.split("@")[0] || null;
  }
  await db
    .insert(organizations)
    .values({ ownerId: userId, kind: "personal", name: defaultOrganizationName(name) })
    .onConflictDoNothing({
      target: organizations.ownerId,
      where: sql`${organizations.kind} = 'personal'`,
    });
  const [created] = await find();
  return created!.id;
}

/**
 * The workspace's first space (lowest `position`) — where a profile goes when
 * no space is named. Recreates the default space if a workspace somehow has
 * none, so a profile always has somewhere to live.
 */
export async function getDefaultSpaceId(workspaceId: string, db: DbOrTx = getDb()): Promise<string> {
  const first = () =>
    db
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(asc(spaces.position), asc(spaces.createdAt))
      .limit(1);
  const [existing] = await first();
  if (existing) return existing.id;
  await db
    .insert(spaces)
    .values({ workspaceId, name: DEFAULT_SPACE_NAME, icon: DEFAULT_SPACE_ICON, position: 0 })
    .onConflictDoNothing();
  const [created] = await first();
  return created!.id;
}

/** 404 unless `spaceId` is a space of `workspaceId`; returns the id for chaining. */
export async function requireSpaceInWorkspace(
  workspaceId: string,
  spaceId: string,
  db: DbOrTx = getDb(),
): Promise<string> {
  const [row] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw notFound("Space not found");
  return row.id;
}

/**
 * Create a workspace with its currency/locale, admin membership, default space,
 * default "Personal" profile, and default category and tag lists, and point the
 * creator's `last_workspace_id` at it when unset (`makeCurrent` forces the
 * switch, for explicit "create workspace" flows). Currency/locale default to
 * USD/en-US; bootstrap passes geo-detected values, and the "create workspace"
 * flow can pass the creator's current-workspace values so a new workspace
 * inherits them.
 *
 * The workspace joins the creator's personal organisation (created on first
 * use) on the Free plan. Everything happens in one transaction, so a failure
 * part-way can't leave a workspace without its space or profile.
 */
export async function createWorkspaceWithDefaults(
  userId: string,
  name: string,
  opts: {
    makeCurrent?: boolean;
    currency?: string;
    locale?: string;
    icon?: string | null;
    /** The owner's display name, for naming a brand-new personal organisation. */
    ownerDisplayName?: string | null;
    /**
     * Bootstrap's mode: create only if the user owns no workspace yet, else
     * return their oldest. Checked under the per-user lock below, so two
     * concurrent first requests create one workspace, not two — a second one
     * would be an extra *free* workspace, which `readOnlyWorkspaceSql` makes
     * view-only, and the new user could land in it.
     */
    ifNoneOwned?: boolean;
    /**
     * The explicit "create workspace" flow: refuse (`plan_limit`) if the user
     * already owns a free workspace — one free workspace per person (C5),
     * re-checked under the lock so two concurrent creates can't both pass.
     */
    requireNoFreeWorkspace?: boolean;
  } = {},
): Promise<WorkspaceSummary> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Serializes everything that creates a workspace for this user. Blocking
    // is fine: it's one person's own create racing itself, held for a few
    // inserts. Namespace 5 (1 AI, 2 email, 3 invites, 4 AI allowance).
    await tx.execute(sql`select pg_advisory_xact_lock(5, hashtext(${userId}))`);
    if (opts.ifNoneOwned) {
      const [existing] = await tx
        .select({ ...summaryColumns, role: workspaceMembers.role })
        .from(workspaces)
        .leftJoin(
          workspaceMembers,
          and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)),
        )
        .where(eq(workspaces.ownerId, userId))
        .orderBy(asc(workspaces.createdAt))
        .limit(1);
      if (existing) return existing;
    }
    if (opts.requireNoFreeWorkspace) {
      const [free] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.ownerId, userId), eq(workspaces.plan, "free")))
        .limit(1);
      if (free) {
        throw planLimit(
          "You already have a free workspace. Each extra workspace needs its own Plus or Pro plan.",
          { limit: "freeWorkspaces", plan: "free", max: 1, used: 1, upgradeTo: "plus" },
        );
      }
    }
    const organizationId = await ensurePersonalOrganization(userId, opts.ownerDisplayName, tx);
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name,
        // Seed a default emoji so every workspace shows one (like a profile's 👤).
        icon: opts.icon || DEFAULT_WORKSPACE_ICON,
        ownerId: userId,
        organizationId,
        ...(opts.currency ? { currency: opts.currency } : {}),
        ...(opts.locale ? { locale: opts.locale } : {}),
      })
      .returning();
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace!.id, userId, role: "admin" })
      .onConflictDoNothing();
    const [space] = await tx
      .insert(spaces)
      .values({
        workspaceId: workspace!.id,
        name: DEFAULT_SPACE_NAME,
        icon: DEFAULT_SPACE_ICON,
        position: 0,
      })
      .returning({ id: spaces.id });
    await tx
      .insert(profiles)
      .values({
        userId,
        workspaceId: workspace!.id,
        spaceId: space!.id,
        name: "Personal",
        icon: "👤",
        sortOrder: 0,
      })
      .onConflictDoNothing();

    // Seed the workspace's shared tag list.
    await tx
      .insert(tags)
      .values(DEFAULT_TAGS.map((t) => ({ userId, workspaceId: workspace!.id, name: t.name, color: t.color })))
      .onConflictDoNothing();

    // Seed the workspace's shared category list.
    await tx
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          userId,
          workspaceId: workspace!.id,
          name: c.name,
          kind: c.kind,
          icon: c.icon,
        })),
      )
      .onConflictDoNothing();

    // Point last_workspace_id here — always for an explicit "create workspace",
    // otherwise only when the user has no current workspace yet (first bootstrap).
    await tx
      .update(userSettings)
      .set({ lastWorkspaceId: workspace!.id, updatedAt: new Date() })
      .where(
        opts.makeCurrent
          ? eq(userSettings.userId, userId)
          : and(eq(userSettings.userId, userId), isNull(userSettings.lastWorkspaceId)),
      );

    return {
      id: workspace!.id,
      name: workspace!.name,
      icon: workspace!.icon,
      ownerId: userId,
      currency: workspace!.currency,
      locale: workspace!.locale,
      role: "admin",
      organizationId,
      plan: workspace!.plan,
    };
  });
}

// ── Invites ────────────────────────────────────────────────────────────────

/** The columns `convertInvites` needs from a `workspace_invites` row. */
export type ConvertibleInvite = {
  id: string;
  workspaceId: string;
  profileId: string | null;
  role: WorkspaceRole;
  /** Spaces a workspace-wide invite below admin joins; null = every space. */
  spaceIds: string[] | null;
};

/**
 * Add a workspace member to spaces at `role` (capped at editor — "admin" is
 * workspace-wide, not a space role). `spaceIds` null means every space in the
 * workspace; ids from another workspace are ignored. Existing rows keep their
 * role, so this never lowers anyone.
 */
export async function addToSpaces(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
  spaceIds: string[] | null,
  db: DbOrTx = getDb(),
): Promise<void> {
  if (role === "admin") return; // admins see every space without a row
  if (spaceIds && spaceIds.length === 0) return;
  const target = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(
      and(
        eq(spaces.workspaceId, workspaceId),
        spaceIds ? inArray(spaces.id, spaceIds) : undefined,
      ),
    );
  if (target.length === 0) return;
  const spaceRole: SpaceRole = role === "viewer" ? "viewer" : "editor";
  await db
    .insert(spaceMembers)
    .values(target.map((s) => ({ spaceId: s.id, userId, role: spaceRole })))
    .onConflictDoNothing();
}

/**
 * Turn invite rows into what they promise — a workspace membership (plus its
 * spaces) for a workspace-wide row, a profile grant for a profile-scoped one —
 * then delete them. Shared by the two acceptance paths: by email at first
 * bootstrap (`acceptPendingInvites`) and by token from the join page
 * (`services/workspaces.ts#acceptInviteByToken`). Idempotent against access the
 * user already holds (`onConflictDoNothing`), so accepting twice is harmless.
 */
export async function convertInvites(
  userId: string,
  pending: ConvertibleInvite[],
): Promise<number> {
  if (pending.length === 0) return 0;
  const db = getDb();
  for (const invite of pending) {
    if (invite.profileId) {
      await db
        .insert(profileAccess)
        .values({ profileId: invite.profileId, userId, role: invite.role })
        .onConflictDoNothing();
    } else {
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
        .onConflictDoNothing();
      await addToSpaces(invite.workspaceId, userId, invite.role, invite.spaceIds, db);
    }
  }
  await db.delete(workspaceInvites).where(
    inArray(
      workspaceInvites.id,
      pending.map((i) => i.id),
    ),
  );
  return pending.length;
}

/** The invite columns `convertInvites` reads, for `select()`. */
export const convertibleInviteColumns = {
  id: workspaceInvites.id,
  workspaceId: workspaceInvites.workspaceId,
  profileId: workspaceInvites.profileId,
  role: workspaceInvites.role,
  spaceIds: workspaceInvites.spaceIds,
};

/**
 * Convert any pending email invites for this (new) user into memberships /
 * profile grants, then clear them. Called once from first bootstrap.
 */
export async function acceptPendingInvites(userId: string, email: string): Promise<number> {
  const db = getDb();
  const pending = await db
    .select(convertibleInviteColumns)
    .from(workspaceInvites)
    .where(eq(workspaceInvites.email, email.trim().toLowerCase()));
  return convertInvites(userId, pending);
}
