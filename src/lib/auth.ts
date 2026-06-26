import "server-only";
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

/** Current user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Server Components / layouts can't write cookies (Next.js throws "Cookies can
  // only be modified in a Server Action or Route Handler"). A plain getSession()
  // refreshes the session-data cache cookie on a cache miss, which triggers that
  // write during render. `disableCookieCache` + `disableRefresh` keep the upstream
  // read-only (no Set-Cookie), so this is safe to call anywhere. The cache cookie
  // and token refresh are still maintained by the client + the /api/auth route
  // handler, where cookie writes are allowed.
  const { data } = await auth.getSession({
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const user = data?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
  };
}

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

export async function getUserSettings(userId: string) {
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
}

/** Resolve the authenticated user + their settings, bootstrapping if needed. */
export async function getAppContext() {
  const user = await requireUser();
  await ensureBootstrap(user.id);
  const settings = await getUserSettings(user.id);
  return { user, settings };
}
