/**
 * Database health check + retention sweep.
 *
 * Neon enforces a hard storage cap per branch (`neon.max_cluster_size`). It is
 * not a soft limit: once the branch's data exceeds it Postgres stops accepting
 * writes with a "could not extend file" error — no warning shoulder, no graceful
 * degradation. This script is the warning shoulder. It exits non-zero past a
 * threshold so it can gate a cron or a CI job.
 *
 * It also prunes the two append-only rate-limit logs. `ai_usage_log` and
 * `email_send_log` are read by the quota checks over a one-hour window, but
 * nothing else deletes from them, so without this they grow forever. Pruning
 * caps that growth; it does not hand the space back — see the note above the
 * VACUUM below.
 *
 * Usage (each script already wraps its own `doppler run --config <env>`):
 *   pnpm db:health:dev
 *   pnpm db:health:prod
 *   pnpm db:health:prod -- --no-prune         # report only, change nothing
 *   pnpm db:health:prod -- --dry-run          # alias of --no-prune
 *   pnpm db:health:prod -- --retention-days=90
 *   pnpm db:health:prod -- --warn-at=70       # exit 1 past 70% of the cap
 *
 * **It deletes by default.** Every unrecognised or malformed argument is a hard
 * error rather than a shrug, because the failure mode of ignoring one is a
 * silent prune of production: `--dry-run` mistaken for the opt-out, `--warn-at
 * 70` written with a space, `--retention-days=abc` reaching the interval parser.
 * The quota tables are the only thing standing between an authenticated account
 * and the operator's AI budget or verified sending domain, so a typo must never
 * be the thing that empties them.
 *
 * Exit codes: 0 healthy · 1 past the storage threshold · 2 bad usage or a cap we
 * can't read (so a gate never passes blind) · 3 the run itself failed.
 */
import pg from "pg";

/** `pnpm run x -- --flag` forwards a bare `--` too; it isn't an argument. */
const args = process.argv.slice(2).filter((a) => a !== "--");

const USAGE =
  "usage: pnpm db:health:dev|prod [-- --no-prune|--dry-run] [-- --retention-days=<n>] [-- --warn-at=<n>]";

/** Bad input exits 2 — never a warning we might scroll past on the way to a delete. */
function usageError(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

/** Bare switches, and the numeric options with the range each accepts. */
const SWITCHES = ["--no-prune", "--dry-run"];
const NUMBERS = {
  // A floor of 1 day: 0 or a negative value would sweep away the live hour the
  // quota checks read, resetting every user's AI and email budget.
  "retention-days": { min: 1, max: 3650 },
  "warn-at": { min: 1, max: 100 },
};

const seen = new Set();
for (const arg of args) {
  const [name] = arg.split("=");
  // A repeated flag means someone edited the command and meant the new value;
  // silently keeping the first would be the same failing-open this whole block
  // exists to prevent.
  if (seen.has(name)) usageError(`${name} was given twice.`);
  seen.add(name);
  if (SWITCHES.includes(name)) {
    if (arg.includes("=")) usageError(`${name} takes no value — write it bare.`);
    // `hasOwn`, not `in` or a truthiness check: `--constructor=5` would
    // otherwise find `Object.prototype.constructor` and sail through validation.
  } else if (name.startsWith("--") && Object.hasOwn(NUMBERS, name.slice(2))) {
    if (!arg.includes("=")) usageError(`${name} needs ${name}=<n>, not a space.`);
  } else {
    usageError(`Unrecognised argument "${arg}".`);
  }
}

const number = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  const raw = hit.slice(name.length + 3);
  const value = Number(raw);
  const { min, max } = NUMBERS[name];
  if (!Number.isInteger(value) || value < min || value > max) {
    usageError(`--${name}: expected a whole number in [${min}, ${max}], got "${raw}".`);
  }
  return value;
};

const PRUNE = !args.includes("--no-prune") && !args.includes("--dry-run");
const RETENTION_DAYS = number("retention-days") ?? 30;
const WARN_AT = number("warn-at") ?? 80;

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm db:health:dev|prod");
  process.exit(2);
}

const MB = 1024 * 1024;
const pct = (n) => `${n.toFixed(1)}%`;
const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

/** The connection string may be a libpq keyword/value DSN, which `URL` rejects —
 * and the thrown error carries the whole string, password included. The host is
 * a label; it must never be able to abort the run or print what it came from. */
function hostOf(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "unknown host";
  }
}

/** Bytes across every database on the branch — `neon.max_cluster_size` is
 * enforced against the branch, not the database we happen to be connected to,
 * and a Neon project carries `postgres` and the templates alongside ours. */
const SIZE_SQL = `
  select current_database()                                          as db,
         (select sum(pg_database_size(datname))::bigint
            from pg_database)                                        as size_bytes,
         (select setting::bigint from pg_settings
           where name = 'neon.max_cluster_size')                     as cap,
         (select unit from pg_settings
           where name = 'neon.max_cluster_size')                     as cap_unit`;

async function clusterSize(client) {
  const {
    rows: [meta],
  } = await client.query(SIZE_SQL);
  return { db: meta.db, size: Number(meta.size_bytes), cap: meta.cap, unit: meta.cap_unit };
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  const { db, size, cap, unit } = await clusterSize(client);

  // The cap comes back in whatever `pg_settings.unit` says; today Neon reports
  // MB. Anything else and the percentage below would be off by a factor of
  // 1024, so treat it as unreadable rather than gate on a number we've misread
  // — which lands on the same "FAIL, cannot tell" verdict as a missing GUC.
  if (cap !== null && unit !== "MB") {
    console.error(`neon.max_cluster_size is reported in "${unit}", not MB — ignoring it.`);
  }
  const capMb = cap === null || unit !== "MB" ? null : Number(cap);
  // Neon reports -1 for "no limit"; that is a real, healthy answer, not a
  // missing one.
  const capBytes = capMb !== null && capMb > 0 ? capMb * MB : null;
  const used = capBytes ? (size / capBytes) * 100 : null;

  console.log(`database        ${db} @ ${hostOf(url)}`);
  console.log(`branch size     ${mb(size)}  (all databases on the branch)`);
  console.log(
    capBytes
      ? `cap             ${mb(capBytes)}  (${pct(used)} used, ${mb(Math.max(capBytes - size, 0))} free)`
      : capMb === null
        ? `cap             not readable`
        : `cap             none enforced (neon.max_cluster_size = ${capMb})`,
  );

  // The verdict comes before the sweep on purpose: it is the one line the run
  // exists to produce, and a failure further down must not swallow it.
  if (used === null && capMb === null) {
    console.error(
      "\nFAIL neon.max_cluster_size is not readable — cannot tell how much headroom is left.",
    );
    process.exitCode = 2;
  } else if (used !== null && used >= WARN_AT) {
    console.error(
      `\nFAIL storage is at ${pct(used)} of the ${mb(capBytes)} cap (threshold ${WARN_AT}%).` +
        `\n     Postgres refuses writes at 100%. Upgrade the Neon plan or reclaim space.`,
    );
    process.exitCode = 1;
  } else if (used !== null) {
    console.log(`\nOK storage at ${pct(used)} of cap (threshold ${WARN_AT}%).`);
  } else {
    console.log("\nOK no storage cap is enforced on this branch.");
  }

  // Biggest tables, so a surprise is attributable at a glance.
  const { rows: tables } = await client.query(`
    select c.relname as name, pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
    order by bytes desc limit 5`);
  console.log(
    "\nlargest tables  " + tables.map((t) => `${t.name} ${mb(Number(t.bytes))}`).join(", "),
  );

  if (PRUNE) {
    const cutoff = `${RETENTION_DAYS} days`;
    let total = 0;
    // Table names are interpolated, so this list must stay a hard-coded literal
    // — the moment it becomes configurable it needs `pg.escapeIdentifier`.
    //
    // Both tables are indexed on `(user_id, created_at)`, so filtering on
    // `created_at` alone is a sequential scan. That's the right trade here: the
    // tables are small and capped per user, this runs by hand or on a cron, and
    // a second index would cost a write on every AI call and every email send.
    for (const table of ["ai_usage_log", "email_send_log"]) {
      const { rowCount } = await client.query(
        `delete from ${table} where created_at < now() - $1::interval`,
        [cutoff],
      );
      const removed = rowCount ?? 0;
      total += removed;
      console.log(`pruned          ${table}: ${removed} row(s) older than ${cutoff}`);
      // DELETE only marks tuples dead. VACUUM makes their space reusable by
      // future inserts, which is what stops these tables growing without bound.
      // It does *not* hand the space back to the branch — these are append-only
      // logs, so the freed pages are at the front of the relation and only
      // VACUUM FULL (an ACCESS EXCLUSIVE rewrite) would truncate them. So the
      // size above will not drop; the point is that it stops climbing.
      if (removed > 0) await client.query(`vacuum (analyze) ${table}`);
    }
    if (total === 0) console.log(`pruned          nothing older than ${cutoff}`);
  } else {
    console.log(`pruned          skipped (${args.find((a) => SWITCHES.includes(a))})`);
  }

  // Slowest statements, when pg_stat_statements is available. Being in
  // `pg_extension` isn't enough — the library also has to be preloaded, and the
  // only way to find out is to read the view. Without it there is no
  // query-level visibility at all, so say so rather than staying silent.
  //
  // The text is normalized (literals become `$1`) for anything Drizzle sends,
  // but utility statements are not — treat this output as potentially sensitive
  // and don't paste it into a public issue.
  try {
    const { rows: slow } = await client.query(`
      select calls, round(mean_exec_time::numeric, 1) as mean_ms,
             round(total_exec_time::numeric) as total_ms, left(query, 90) as query
      from pg_stat_statements
      where query not like '%pg_stat_statements%'
      order by total_exec_time desc limit 5`);
    console.log("\nslowest statements by total time");
    for (const q of slow) {
      console.log(
        `  ${String(q.total_ms).padStart(8)} ms  ${String(q.calls).padStart(6)}x  ${q.mean_ms} ms avg  ${q.query.replace(/\s+/g, " ")}`,
      );
    }
  } catch {
    console.log("\npg_stat_statements is not available — no query-level visibility.");
    console.log("  enable with: create extension pg_stat_statements;");
    console.log("  (Neon also needs it in shared_preload_libraries.)");
  }
}

try {
  await main();
} catch (err) {
  // Distinct from the threshold failure above: a crash must not read as
  // "storage critical", or the alert sends someone after the wrong problem.
  console.error(`\nERROR db-health failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 3;
} finally {
  await client.end().catch(() => {});
}
