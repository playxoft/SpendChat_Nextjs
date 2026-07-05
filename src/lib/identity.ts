import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { FirebaseTokenClaims } from "@/lib/firebase-verify";
import type { SessionUser } from "@/lib/auth";

/**
 * Translate a verified Firebase token into our internal identity.
 *
 * `users.firebase_uid` maps the provider's UID to our own `uuidv7` `id`, which
 * is the value every table stores as `user_id` / `owner_id`. This is the ONLY
 * place the Firebase UID becomes an internal id; both the web session
 * (`getCurrentUser`) and the mobile API (`requireApiUser`) route through here,
 * so nothing downstream ever sees a provider id.
 *
 * Hot path is a single indexed SELECT (returning user). A first-seen user is
 * inserted (with a concurrency-safe upsert). Email/name/image are seeded on
 * insert; they refresh via the session route rather than on every read.
 */
export async function resolveUser(claims: FirebaseTokenClaims): Promise<SessionUser> {
  const db = getDb();
  const firebaseUid = claims.sub;

  const existing = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);
  if (existing[0]) return existing[0];

  const email = (claims.email as string | undefined) ?? null;
  const name = (claims.name as string | undefined) ?? null;
  const image = (claims.picture as string | undefined) ?? null;

  // First sign-in: create the row. onConflictDoUpdate keeps it safe if two
  // concurrent requests race to insert the same new user.
  const [row] = await db
    .insert(users)
    .values({ firebaseUid, email, name, image })
    .onConflictDoUpdate({ target: users.firebaseUid, set: { updatedAt: new Date() } })
    .returning({ id: users.id, email: users.email, name: users.name });
  return row!;
}

/** Refresh the mutable profile fields from a fresh token (called on sign-in). */
export async function syncUserProfile(claims: FirebaseTokenClaims): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      email: (claims.email as string | undefined) ?? null,
      name: (claims.name as string | undefined) ?? null,
      image: (claims.picture as string | undefined) ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.firebaseUid, claims.sub));
}
