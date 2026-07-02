import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, profiles, userSettings } from "@/db/schema";
import { auth } from "@/lib/neon-auth";
import { DEFAULT_CATEGORIES } from "./categories";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * Current user or null. Deduped per request with React `cache()` so the (app)
 * layout and the page it renders resolve the session once, not twice.
 *
 * neon-auth validates the signed session-data cookie locally (HMAC via the
 * cookie secret — no network), which is the hot path for a signed-in user and
 * costs zero round-trips to the Neon Auth server. We deliberately do NOT pass
 * `disableCookieCache`: that flag skips the local cache and forces an upstream
 * fetch on every call. `disableRefresh` stays — on a genuine cache miss neon-auth
 * falls back to an upstream fetch, and without it the response would carry a
 * Set-Cookie that makes neon-auth call `cookies().set()` during render, which
 * Next throws on ("Cookies can only be modified in a Server Action or Route
 * Handler"). Cache-cookie minting and token refresh still happen in the client
 * and the /api/auth route handler, where cookie writes are allowed.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await auth.getSession({
    query: { disableRefresh: true },
  });
  const user = data?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
  };
});

/** Current user, redirecting to sign-in when absent. Use in protected routes. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Create default settings + categories for a user. Idempotent. */
export async function ensureBootstrap(userId: string) {
  const db = getDb();
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();

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

  // Every user has at least one profile ("Personal") to attach transactions to.
  const existingProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
    columns: { id: true },
  });
  if (!existingProfile) {
    await db
      .insert(profiles)
      .values({ userId, name: "Personal", icon: "👤", sortOrder: 0 })
      .onConflictDoNothing();
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

/**
 * Resolve the authenticated user + their settings. `getUserSettings` bootstraps
 * a first-time user lazily, so there is no per-request bootstrap cost: the common
 * case (an existing user) is a single settings SELECT, not the insert + two
 * findFirst probes this used to run on every page load.
 */
export async function getAppContext() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return { user, settings };
}
