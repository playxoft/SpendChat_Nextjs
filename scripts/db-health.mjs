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
 * `email_send_log` are only ever read over a one-hour window, but nothing else
 * deletes from them, so without this they grow forever.
 *
 * Usage (each script already wraps its own `doppler run --config <env>`):
 *   pnpm db:health:dev
 *   pnpm db:health:prod
 *   pnpm db:health:prod -- --no-prune         # report only, change nothing
 *   pnpm db:health:prod -- --retention-days=90
 *   pnpm db:health:prod -- --warn-at=70       # exit 1 past 70% of the cap
 *
 * Read-only apart from the retention deletes, which are skipped by --no-prune.
 */
import pg from "pg";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const PRUNE = !args.includes("--no-prune");
const RETENTION_DAYS = flag("retention-days", 30);
const WARN_AT = flag("warn-at", 80);

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm db:health:dev|prod");
  process.exit(2);
}

const MB = 1024 * 1024;
const pct = (n) => `${n.toFixed(1)}%`;
const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows: [meta] } = await client.query(`
    select current_database()                                    as db,
           pg_database_size(current_database())                  as size_bytes,
           (select setting::bigint from pg_settings
             where name = 'neon.max_cluster_size')               as cap_mb`);

  const size = Number(meta.size_bytes);
  const capBytes = meta.cap_mb ? Number(meta.cap_mb) * MB : null;
  const used = capBytes ? (size / capBytes) * 100 : null;

  console.log(`database        ${meta.db} @ ${new URL(url).host}`);
  console.log(`size            ${mb(size)}`);
  console.log(
    capBytes
      ? `cap             ${mb(capBytes)}  (${pct(used)} used, ${mb(capBytes - size)} free)`
      : `cap             none reported (not a capped Neon branch)`,
  );

  // Biggest tables, so a surprise is attributable at a glance.
  const { rows: tables } = await client.query(`
    select c.relname as name, pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
    order by bytes desc limit 5`);
  console.log("largest tables  " + tables.map((t) => `${t.name} ${mb(Number(t.bytes))}`).join(", "));

  if (PRUNE) {
    const cutoff = `${RETENTION_DAYS} days`;
    let total = 0;
    for (const table of ["ai_usage_log", "email_send_log"]) {
      const { rowCount } = await client.query(
        `delete from ${table} where created_at < now() - $1::interval`,
        [cutoff],
      );
      total += rowCount;
      console.log(`pruned          ${table}: ${rowCount} row(s) older than ${cutoff}`);
    }
    if (total === 0) console.log(`pruned          nothing older than ${cutoff}`);
  } else {
    console.log("pruned          skipped (--no-prune)");
  }

  // Slowest statements, when pg_stat_statements is installed. Without it there
  // is no query-level visibility at all, so say so rather than staying silent.
  const { rows: [ext] } = await client.query(
    `select 1 as ok from pg_extension where extname = 'pg_stat_statements'`,
  ).then((r) => ({ rows: r.rows.length ? r.rows : [{ ok: null }] }));

  if (ext.ok) {
    const { rows: slow } = await client.query(`
      select calls, round(mean_exec_time::numeric, 1) as mean_ms,
             round(total_exec_time::numeric) as total_ms, left(query, 90) as query
      from pg_stat_statements
      where query not like '%pg_stat_statements%'
      order by total_exec_time desc limit 5`);
    console.log("\nslowest statements by total time");
    for (const q of slow) {
      console.log(`  ${String(q.total_ms).padStart(8)} ms  ${String(q.calls).padStart(6)}x  ${q.mean_ms} ms avg  ${q.query.replace(/\s+/g, " ")}`);
    }
  } else {
    console.log("\npg_stat_statements is not installed — no query-level visibility.");
    console.log("  enable with: create extension pg_stat_statements;");
  }

  if (used !== null && used >= WARN_AT) {
    console.error(
      `\nFAIL storage is at ${pct(used)} of the ${mb(capBytes)} cap (threshold ${WARN_AT}%).` +
        `\n     Postgres refuses writes at 100%. Upgrade the Neon plan or reclaim space.`,
    );
    process.exitCode = 1;
  } else if (used !== null) {
    console.log(`\nOK storage at ${pct(used)} of cap (threshold ${WARN_AT}%).`);
  }
} finally {
  await client.end();
}
