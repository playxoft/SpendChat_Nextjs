/**
 * Remap a user from one Firebase UID to another (same person, new Firebase
 * account): KEEP the original user's data and DELETE the throwaway data the new
 * Firebase login created (its bootstrap workspace / profiles / categories /
 * settings and any test transactions).
 *
 * Why this exists: deleting a Firebase Auth user and recreating it for the same
 * email mints a NEW Firebase UID. Our `users` table keys everything to an
 * internal uuidv7 via `firebase_uid`, so signing in with the new account created
 * a SECOND `users` row (and a fresh bootstrap) while the real data stayed on the
 * old row. This points the old row at the new UID and removes the new row.
 *
 * Run LOCALLY. Requires NEON_POSTGRES_DATABASE_URL (Doppler).
 *
 * Usage:
 *   doppler run -- node scripts/remap-firebase-user.mjs --old <OLD_UID> --new <NEW_UID> --dry-run
 *   doppler run -- node scripts/remap-firebase-user.mjs --old <OLD_UID> --new <NEW_UID>
 */
import { neon } from "@neondatabase/serverless";

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes("--dry-run");
const OLD_UID = argOf("--old");
const NEW_UID = argOf("--new");
const log = (...a) => console.log(...a);

// Every place a user id is stored: [table, column]. Used to count what each
// `users` row owns.
const OWNER_COLUMNS = [
  ["user_settings", "user_id"],
  ["profiles", "user_id"],
  ["categories", "user_id"],
  ["transactions", "user_id"],
  ["workspaces", "owner_id"],
  ["workspace_members", "user_id"],
  ["profile_access", "user_id"],
  ["workspace_invites", "invited_by"],
];

async function ownedCounts(sql, internalId) {
  const out = {};
  for (const [table, col] of OWNER_COLUMNS) {
    const rows = await sql`
      select count(*)::int as n
      from ${sql.unsafe(`"${table}"`)}
      where ${sql.unsafe(`"${col}"`)} = ${internalId}::uuid`;
    out[`${table}.${col}`] = rows[0].n;
  }
  return out;
}

function printCounts(label, counts) {
  log(`  ${label}`);
  let total = 0;
  for (const [k, n] of Object.entries(counts)) {
    log(`    ${k.padEnd(30)} ${n}`);
    total += n;
  }
  log(`    ${"TOTAL".padEnd(30)} ${total}`);
  return total;
}

async function main() {
  if (!OLD_UID || !NEW_UID) {
    log("Usage: --old <OLD_FIREBASE_UID> --new <NEW_FIREBASE_UID> [--dry-run]");
    process.exit(1);
  }
  if (OLD_UID === NEW_UID) throw new Error("--old and --new are identical; nothing to do.");
  const url = process.env.NEON_POSTGRES_DATABASE_URL;
  if (!url) throw new Error("NEON_POSTGRES_DATABASE_URL is not set");
  const sql = neon(url);

  log(`\n=== Firebase UID remap ${DRY ? "(DRY RUN — no changes)" : "(APPLY)"} ===`);
  log(`  old firebase_uid: ${OLD_UID}   -> keep this row's data`);
  log(`  new firebase_uid: ${NEW_UID}   -> delete this row + its data\n`);

  const oldRows = await sql`select id, email, name from users where firebase_uid = ${OLD_UID}`;
  const newRows = await sql`select id, email, name from users where firebase_uid = ${NEW_UID}`;

  if (!oldRows[0]) throw new Error(`No users row for old firebase_uid ${OLD_UID}. Aborting.`);
  const oldId = oldRows[0].id;
  log(`KEEP    users.id = ${oldId}  email=${oldRows[0].email}  name=${oldRows[0].name}`);
  const keep = await ownedCounts(sql, oldId);
  printCounts("data to KEEP (stays on this id, becomes reachable via the new UID):", keep);

  let newId = null;
  if (newRows[0]) {
    newId = newRows[0].id;
    log(`\nDELETE  users.id = ${newId}  email=${newRows[0].email}  name=${newRows[0].name}`);
    printCounts("data to DELETE (created by the new login):", await ownedCounts(sql, newId));
  } else {
    log(`\nNo separate users row for the new UID — nothing to delete; will only re-point the old row.`);
  }

  // Sanity: same person => same email. Warn (don't block) if they differ.
  if (oldRows[0].email && newRows[0]?.email && oldRows[0].email.toLowerCase() !== newRows[0].email.toLowerCase()) {
    log(`\n⚠ WARNING: emails differ (old=${oldRows[0].email}, new=${newRows[0].email}). Proceed only if intentional.`);
  }

  log(`\nPlan:`);
  let step = 1;
  if (newId) log(`  ${step++}. Delete every row owned by ${newId} across ${OWNER_COLUMNS.length} tables (FK-safe order).`);
  log(`  ${step}. UPDATE users SET firebase_uid = '${NEW_UID}' WHERE id = ${oldId}.`);

  if (DRY) {
    log(`\n[dry-run] No changes made. Re-run without --dry-run to apply.`);
    return;
  }

  // Apply atomically. Children before parents (FK checks are immediate), then
  // the new users row, then re-point the old row. Deleting the new row before
  // the UPDATE avoids a firebase_uid unique-constraint collision.
  const q = [];
  if (newId) {
    const id = newId;
    // profiles the new user created directly OR in workspaces it owns.
    const doomedProfiles = sql.unsafe(
      `select id from profiles where user_id = '${id}'::uuid or workspace_id in (select id from workspaces where owner_id = '${id}'::uuid)`,
    );
    const doomedWorkspaces = sql.unsafe(`select id from workspaces where owner_id = '${id}'::uuid`);

    q.push(sql`delete from transactions where user_id = ${id}::uuid or profile_id in (${doomedProfiles})`);
    q.push(sql`delete from workspace_invites where invited_by = ${id}::uuid or workspace_id in (${doomedWorkspaces}) or profile_id in (${doomedProfiles})`);
    q.push(sql`delete from profile_access where user_id = ${id}::uuid or profile_id in (${doomedProfiles})`);
    q.push(sql`delete from profiles where user_id = ${id}::uuid or workspace_id in (${doomedWorkspaces})`);
    q.push(sql`delete from categories where user_id = ${id}::uuid`);
    q.push(sql`delete from workspace_members where user_id = ${id}::uuid or workspace_id in (${doomedWorkspaces})`);
    q.push(sql`delete from workspaces where owner_id = ${id}::uuid`);
    q.push(sql`delete from user_settings where user_id = ${id}::uuid`);
    q.push(sql`delete from users where id = ${id}::uuid`);
  }
  q.push(sql`update users set firebase_uid = ${NEW_UID}, updated_at = now() where id = ${oldId}::uuid`);

  await sql.transaction(q);
  log(`\n✓ Remap complete.${newId ? " Deleted the new login's data and" : ""} re-pointed ${oldId} to ${NEW_UID}.`);

  // Verify.
  const after = await sql`select id, email from users where firebase_uid = ${NEW_UID}`;
  const stray = await sql`select count(*)::int as n from users where firebase_uid = ${OLD_UID}`;
  log(`\nVerify: new UID now resolves to users.id=${after[0]?.id} (email=${after[0]?.email}).`);
  log(`Verify: rows still on old UID = ${stray[0].n} (expected 0).`);
}

main().catch((e) => {
  console.error("Remap failed:", e);
  process.exit(1);
});
