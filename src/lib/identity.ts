import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { conflict } from "@/lib/errors";
import type { FirebaseTokenClaims } from "@/lib/firebase-verify";
import type { SessionUser } from "@/lib/auth";

/**
 * Emails are stored lowercased so "one account per email" is case-insensitive
 * (Foo@x.com === foo@x.com). Enforced at the DB by a unique index on
 * `lower(email)` (`users_email_lower_uq`); normalizing here keeps the stored
 * value canonical too. Returns null for missing/blank emails.
 */
function normalizeEmail(email: unknown): string | null {
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

/** Postgres unique-violation (23505), possibly wrapped by the driver/ORM. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/**
 * Attach `firebaseUid` to the existing account with this (already normalized)
 * email, returning it — or null when no such account exists. A single UPDATE
 * keyed on `lower(email)` (unique), so concurrent linkers can't duplicate.
 */
async function linkAccountByEmail(
  firebaseUid: string,
  email: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const [row] = await db
    .update(users)
    .set({ firebaseUid, updatedAt: new Date() })
    .where(sql`lower(${users.email}) = ${email}`)
    .returning({ id: users.id, email: users.email, name: users.name });
  return row ?? null;
}

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
 *
 * Account linking: when a new Firebase UID arrives with a *verified* email that
 * already has an account (e.g. Google sign-in after an email/password sign-up),
 * the UID is linked to that account instead of inserting a duplicate — the
 * `users_email_lower_uq` index would otherwise turn every such sign-in into a
 * 500. Unverified emails never claim an existing account; they get a clear 409.
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

  const email = normalizeEmail(claims.email);
  const name = (claims.name as string | undefined) ?? null;
  const image = (claims.picture as string | undefined) ?? null;
  const emailVerified = claims.email_verified === true;

  // Same email, different provider: link rather than insert a duplicate.
  if (email && emailVerified) {
    const linked = await linkAccountByEmail(firebaseUid, email);
    if (linked) return linked;
  }

  // First sign-in: create the row. onConflictDoUpdate keeps it safe if two
  // concurrent requests race to insert the same new user.
  try {
    const [row] = await db
      .insert(users)
      .values({ firebaseUid, email, name, image })
      .onConflictDoUpdate({ target: users.firebaseUid, set: { updatedAt: new Date() } })
      .returning({ id: users.id, email: users.email, name: users.name });
    return row!;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // The email index rejected the insert: either we lost a race with a
    // concurrent first sign-in (retry the link), or the email is unverified
    // and already belongs to an account it must not claim.
    if (email && emailVerified) {
      const linked = await linkAccountByEmail(firebaseUid, email);
      if (linked) return linked;
    }
    throw conflict("This email is already registered with a different sign-in method");
  }
}

/**
 * Refresh the mutable profile fields from a fresh token (called on sign-in and
 * on every hourly session refresh). Returns our internal user id for the
 * account, or null when no row exists yet (a brand-new user's row is created
 * lazily on first `getCurrentUser`). The id comes from the UPDATE's `RETURNING`,
 * so there's no extra query — the caller uses it to attribute the request in logs.
 *
 * `email` is always kept in step with the provider (it's the login identity).
 * `name`/`image` are only *seeded* from the token — `coalesce(existing, claim)`
 * keeps whatever the user already has, so an edited username or an uploaded
 * avatar (`users.image` pointing at our R2 bucket) survives the hourly refresh
 * instead of being overwritten by the Google `name`/`picture` claim. The very
 * first seed still happens: `resolveUser` sets them on the initial INSERT.
 */
export async function syncUserProfile(claims: FirebaseTokenClaims): Promise<string | null> {
  const db = getDb();
  const name = (claims.name as string | undefined) ?? null;
  const image = (claims.picture as string | undefined) ?? null;
  const [row] = await db
    .update(users)
    .set({
      email: normalizeEmail(claims.email),
      name: sql`coalesce(${users.name}, ${name})`,
      image: sql`coalesce(${users.image}, ${image})`,
      updatedAt: new Date(),
    })
    .where(eq(users.firebaseUid, claims.sub))
    .returning({ id: users.id });
  return row?.id ?? null;
}
