/**
 * One-time migration: Neon Auth users -> Firebase Auth, and re-key our data
 * from Neon's UUIDv4 user ids -> our own UUIDv7 ids (via the new `users` table).
 *
 * Run LOCALLY (never on Workers) after `pnpm db:migrate` has created the
 * `users` table. Requires:
 *   - NEON_POSTGRES_DATABASE_URL           (Doppler)
 *   - GOOGLE_APPLICATION_CREDENTIALS=./.firebase-service-account.json
 *     (or FIREBASE_SERVICE_ACCOUNT = the JSON string)
 *
 * Usage:
 *   doppler run -- node scripts/migrate-to-firebase.mjs --dry-run   # preview
 *   doppler run -- node scripts/migrate-to-firebase.mjs             # execute
 *
 * BACK UP FIRST: run against a Neon *branch* copy before production.
 *
 * What it does, idempotently:
 *   1. Read every neon_auth."user" (id v4, email, name, emailVerified).
 *   2. Ensure a Firebase user exists for each email (create, or reuse existing).
 *   3. Ensure a `users` row exists (firebase_uid unique) -> our uuidv7 `id`.
 *   4. Re-key all 8 user-id columns old v4 -> new v7 in ONE transaction.
 *   5. Print password-reset links for email/password users (Google users just
 *      sign in with Google — same email links to the pre-created account).
 */
import { neon } from "@neondatabase/serverless";
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const DRY = process.argv.includes("--dry-run");
const log = (...a) => console.log(...a);

// Columns to re-key: [table, column]. All hold a user id.
const USER_ID_COLUMNS = [
  ["user_settings", "user_id"],
  ["profiles", "user_id"],
  ["categories", "user_id"],
  ["transactions", "user_id"],
  ["workspaces", "owner_id"],
  ["workspace_members", "user_id"],
  ["profile_access", "user_id"],
  ["workspace_invites", "invited_by"],
];

/**
 * Resolve the Firebase Admin credential.
 *
 * We accept the service-account JSON *contents* from either
 * `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS`. Google's own
 * libraries treat `GOOGLE_APPLICATION_CREDENTIALS` strictly as a *file path*, so
 * when a secret manager (Doppler) stores the JSON contents in it,
 * `applicationDefault()` tries to `lstat` the whole JSON blob and dies with
 * `ENAMETOOLONG`. Detect JSON (starts with `{`) and pass it via `cert()`;
 * otherwise assume it's a real path and let `applicationDefault()` read it.
 */
function resolveCredential() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "").trim();
  if (raw.startsWith("{")) return cert(JSON.parse(raw)); // inline JSON contents
  return applicationDefault(); // empty (ADC) or a genuine file path in GAC
}

function initAdmin() {
  if (getApps().length) return;
  initializeApp({ credential: resolveCredential() });
}

async function ensureFirebaseUser(auth, { email, name, emailVerified }) {
  try {
    const existing = await auth.getUserByEmail(email);
    return existing.uid;
  } catch (e) {
    // Only "user not found" means we should create one. Anything else
    // (bad credentials, network) must surface — otherwise dry-run silently
    // swallows it and looks like it worked while the real run fails.
    if (e?.code !== "auth/user-not-found") throw e;
  }
  if (DRY) return `(dry-run-uid-for:${email})`;
  const created = await auth.createUser({
    email,
    emailVerified: !!emailVerified,
    displayName: name || undefined,
  });
  return created.uid;
}

async function main() {
  const url = process.env.NEON_POSTGRES_DATABASE_URL;
  if (!url) throw new Error("NEON_POSTGRES_DATABASE_URL is not set");
  const sql = neon(url);
  initAdmin();
  const auth = getAuth();

  const neonUsers = await sql`
    select "id", "email", "name", "emailVerified"
    from neon_auth."user" order by "email"`;
  log(`Found ${neonUsers.length} Neon Auth users.\n`);

  const mapping = []; // { oldId, newId, firebaseUid, email, emailVerified }
  for (const u of neonUsers) {
    if (!u.email) {
      log(`  skip (no email): ${u.id}`);
      continue;
    }
    const firebaseUid = await ensureFirebaseUser(auth, {
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
    });

    // Idempotent: reuse an existing users row for this firebase_uid.
    const found = await sql`select id from users where firebase_uid = ${firebaseUid} limit 1`;
    let newId = found[0]?.id;
    if (!newId) {
      if (DRY) {
        newId = `(dry-run-new-uuidv7)`;
      } else {
        const [row] = await sql`
          insert into users (firebase_uid, email, name)
          values (${firebaseUid}, ${u.email}, ${u.name})
          returning id`;
        newId = row.id;
      }
    }
    mapping.push({
      oldId: u.id,
      newId,
      firebaseUid,
      email: u.email,
      emailVerified: !!u.emailVerified,
    });
    log(`  ${u.email}: ${u.id}  ->  ${newId}  (firebase ${firebaseUid})`);
  }

  // Sanity: any user id present in data but not covered by the mapping?
  const known = new Set(mapping.map((m) => m.oldId));
  for (const [table, col] of USER_ID_COLUMNS) {
    const rows = await sql`select distinct ${sql.unsafe(`"${col}"`)} as uid from ${sql.unsafe(`"${table}"`)}`;
    for (const r of rows) {
      if (r.uid && !known.has(r.uid)) {
        log(`  ⚠ ${table}.${col} references unknown user id ${r.uid} (no Neon Auth user).`);
      }
    }
  }

  if (DRY) {
    log(`\n[dry-run] Would re-key ${USER_ID_COLUMNS.length} columns for ${mapping.length} users. No changes made.`);
    return;
  }

  // Atomic re-key: bijective old->new (v7 != v4) so no intermediate collision.
  const queries = [];
  for (const { oldId, newId } of mapping) {
    for (const [table, col] of USER_ID_COLUMNS) {
      queries.push(
        sql`update ${sql.unsafe(`"${table}"`)} set ${sql.unsafe(`"${col}"`)} = ${newId}::uuid where ${sql.unsafe(`"${col}"`)} = ${oldId}::uuid`,
      );
    }
  }
  await sql.transaction(queries);
  log(`\n✓ Re-keyed ${USER_ID_COLUMNS.length} columns for ${mapping.length} users.`);

  // Password reset links (email/password users; harmless for Google-only users).
  log(`\nPassword-reset links (send to email/password users):`);
  for (const m of mapping) {
    try {
      const link = await auth.generatePasswordResetLink(m.email);
      log(`  ${m.email}: ${link}`);
    } catch (e) {
      log(`  ${m.email}: (could not generate link: ${e.message})`);
    }
  }
  log(`\nDone. Next: add the FK-constraints migration, then run pnpm db:migrate.`);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
