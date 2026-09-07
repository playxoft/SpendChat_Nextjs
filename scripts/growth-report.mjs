#!/usr/bin/env node
/**
 * Growth report — where signups come from and whether they stick.
 *
 * Read-only. Run via `pnpm growth:report:dev` / `pnpm growth:report:prod`
 * (each wraps its own `doppler run --config <env>`; don't prefix another).
 *
 *   --days N   window for the per-day and per-channel tables (default 30)
 *
 * "Channel" is the first value present of utm_source, ?ref=, referrer host —
 * see `src/lib/attribution.ts`. `(direct)` means the browser recorded a visit
 * with no channel; `(unknown)` means the account predates attribution or the
 * browser blocked storage. "Activated" = went on to add at least one
 * transaction. Days are UTC.
 */
import pg from "pg";

const args = process.argv.slice(2);
function number(flag) {
  const i = args.indexOf(`--${flag}`);
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
const DAYS = number("days") ?? 30;

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm growth:report:dev|prod");
  process.exit(1);
}

function table(rows) {
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals) => "  " + vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(line(cols.map((c) => cell(r[c]))));
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows: [totals] } = await client.query(
    `select count(*)::int as total_users,
            count(*) filter (where created_at >= now() - interval '7 days')::int as last_7_days,
            count(*) filter (where created_at >= now() - make_interval(days => $1))::int as in_window,
            count(*) filter (where acquisition is not null)::int as with_attribution
       from users`,
    [DAYS],
  );
  console.log(`\nSignups (window = last ${DAYS} days, UTC)\n`);
  table([totals]);

  const { rows: perDay } = await client.query(
    `select d::date as day, coalesce(s.n, 0)::int as signups
       from generate_series((now() - make_interval(days => $1 - 1))::date, now()::date, '1 day') d
       left join (
         select created_at::date as day, count(*)::int as n
           from users
          where created_at >= (now() - make_interval(days => $1 - 1))::date
          group by 1
       ) s on s.day = d::date
      order by 1`,
    [DAYS],
  );
  let running = 0;
  console.log(`\nPer day\n`);
  table(perDay.map((r) => ({ ...r, running: (running += r.signups) })));

  const { rows: byChannel } = await client.query(
    `select coalesce(u.acquisition->>'source', u.acquisition->>'ref', u.acquisition->>'referrer',
                     case when u.acquisition is null then '(unknown)' else '(direct)' end) as channel,
            count(*)::int as signups,
            count(*) filter (where exists (select 1 from transactions t where t.user_id = u.id))::int as activated
       from users u
      where u.created_at >= now() - make_interval(days => $1)
      group by 1
      order by 2 desc, 1`,
    [DAYS],
  );
  console.log(`\nBy channel (window)\n`);
  table(byChannel);

  const { rows: byCampaign } = await client.query(
    `select u.acquisition->>'campaign' as campaign, u.acquisition->>'medium' as medium, count(*)::int as signups
       from users u
      where u.created_at >= now() - make_interval(days => $1) and u.acquisition->>'campaign' is not null
      group by 1, 2
      order by 3 desc, 1
      limit 15`,
    [DAYS],
  );
  console.log(`\nBy campaign (window)\n`);
  table(byCampaign);

  const { rows: heardFrom } = await client.query(
    `select coalesce(u.acquisition->>'heardFrom', '(not answered)') as heard_from,
            count(*)::int as signups
       from users u
      where u.created_at >= now() - make_interval(days => $1)
      group by 1
      order by 2 desc, 1`,
    [DAYS],
  );
  console.log(`\n"How did you hear about us?" (window)\n`);
  table(heardFrom);

  const { rows: others } = await client.query(
    `select u.acquisition->>'heardFromOther' as said, count(*)::int as n
       from users u
      where u.created_at >= now() - make_interval(days => $1)
        and coalesce(u.acquisition->>'heardFromOther', '') <> ''
      group by 1
      order by 2 desc, 1
      limit 20`,
    [DAYS],
  );
  console.log(`\n"Other" answers (window)\n`);
  table(others);

  const { rows: landing } = await client.query(
    `select coalesce(u.acquisition->>'landing', '(unknown)') as landing_page, count(*)::int as signups
       from users u
      where u.created_at >= now() - make_interval(days => $1)
      group by 1
      order by 2 desc, 1
      limit 10`,
    [DAYS],
  );
  console.log(`\nLanding page (window)\n`);
  table(landing);
  console.log();
} finally {
  await client.end();
}
