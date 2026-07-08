import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, userSettings, workspaces } from "@/db/schema";
import { refreshFirebaseIdToken, verifyFirebaseIdToken } from "@/lib/firebase-verify";
import { resolveUser } from "@/lib/identity";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/lib/session-cookie";
import { DEFAULT_CATEGORIES } from "./categories";
import { detectSettingsDefaults } from "./geo.server";
import { findUserById } from "./directory";
import {
  acceptPendingInvites,
  createWorkspaceWithDefaults,
  listUserWorkspaces,
  type WorkspaceSummary,
} from "./workspaces";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * Current user or null. Deduped per request with React `cache()` so the (app)
 * layout and the page it renders resolve the session once, not twice.
 *
 * Reads the httpOnly `__session` cookie (a Firebase ID token, written by
 * `POST /api/auth/session`) and verifies it statelessly with `jose` against
 * Google's public keys (no network to a session server, no `firebase-admin`).
 * `resolveUser` maps the Firebase UID → our internal `uuidv7` id.
 *
 * The ID token lives only ~1h, so when it's expired we re-mint one from the
 * long-lived `__refresh` cookie (Google's Secure Token API) — that's what keeps
 * the session alive for the cookie's full month instead of bouncing the user to
 * sign-in an hour after they close the app. We can't persist the fresh cookie
 * here (Next forbids cookie writes during render); the browser's `AuthBridge`
 * re-sets it on load. Cookie writes only happen in `/api/auth/session`.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();

  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      return await resolveUser(await verifyFirebaseIdToken(token));
    } catch {
      // Expired/invalid ID token — fall through to the refresh token below.
    }
  }

  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      const fresh = await refreshFirebaseIdToken(refresh);
      return await resolveUser(await verifyFirebaseIdToken(fresh.idToken));
    } catch {
      return null;
    }
  }

  return null;
});

/** Current user, redirecting to sign-in when absent. Use in protected routes. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** "<name>'s Workspace", from the best identity evidence available. */
export function defaultWorkspaceName(name?: string | null, email?: string | null): string {
  const display = name?.trim() || email?.split("@")[0]?.trim();
  return display ? `${display}'s Workspace` : "My Workspace";
}

/**
 * Create default settings + categories + workspace for a user. Idempotent.
 * The settings row is seeded with the geo-detected currency/locale for the
 * current request (`onConflictDoNothing` means detection only ever applies to
 * a first sign-in — an existing user's currency is never silently changed).
 *
 * Every user owns a default workspace ("<name>'s Workspace", named via the
 * Neon Auth directory) with an admin membership and a "Personal" profile.
 * On that first bootstrap, pending email invites are converted into
 * memberships/profile grants — invites only ever exist for emails that had no
 * account when they were invited (known accounts are added directly).
 */
export async function ensureBootstrap(userId: string) {
  const db = getDb();
  const defaults = await detectSettingsDefaults();
  await db.insert(userSettings).values({ userId, ...defaults }).onConflictDoNothing();

  const existing = await db.query.categories.findFirst({
    where: eq(categories.userId, userId),
    columns: { id: true },
  });
  if (!existing) {
    await db
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          userId,
          name: c.name,
          kind: c.kind,
          icon: c.icon,
        })),
      )
      .onConflictDoNothing();
  }

  const ownWorkspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
    columns: { id: true },
  });
  if (!ownWorkspace) {
    const identity = await findUserById(userId);
    await createWorkspaceWithDefaults(
      userId,
      defaultWorkspaceName(identity?.name, identity?.email),
    );
    if (identity?.email) await acceptPendingInvites(userId, identity.email);
  }
}

/**
 * A user's settings (currency, locale, theme, input mode…), deduped per request
 * so the layout and page don't each hit the DB. Bootstraps lazily on a cache
 * miss: a brand-new user's first read creates their settings, categories, and
 * default profile, then re-reads; every subsequent read is a single SELECT.
 */
export const getUserSettings = cache(async (userId: string) => {
  const db = getDb();
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  if (!settings) {
    await ensureBootstrap(userId);
    settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
  }
  return settings!;
});

/** All workspaces the user can open, deduped per request. */
export const getUserWorkspaces = cache(async (userId: string) => {
  await getUserSettings(userId); // lazily bootstraps a brand-new user first
  return listUserWorkspaces(userId);
});

/**
 * The user's current workspace: `last_workspace_id` when still accessible,
 * else their first workspace (bootstrap guarantees at least one — their own).
 */
export const getCurrentWorkspace = cache(async (userId: string): Promise<WorkspaceSummary> => {
  const [settings, list] = await Promise.all([
    getUserSettings(userId),
    getUserWorkspaces(userId),
  ]);
  return list.find((w) => w.id === settings.lastWorkspaceId) ?? list[0]!;
});

/**
 * Resolve the authenticated user + their settings + current workspace.
 * `getUserSettings` bootstraps a first-time user lazily, so there is no
 * per-request bootstrap cost: the common case (an existing user) is a settings
 * SELECT plus the workspace lookups, all deduped per request via `cache()`.
 */
export async function getAppContext() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const workspace = await getCurrentWorkspace(user.id);
  return { user, settings, workspace };
}
