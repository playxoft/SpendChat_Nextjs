import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, userSettings } from "@/db/schema";
import { stackServerApp } from "@/stack/server";
import { DEFAULT_CATEGORIES } from "./categories";

/** Current user or null. */
export async function getCurrentUser() {
  return stackServerApp.getUser();
}

/** Current user, redirecting to sign-in when absent. Use in protected routes. */
export async function requireUser() {
  return stackServerApp.getUser({ or: "redirect" });
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
