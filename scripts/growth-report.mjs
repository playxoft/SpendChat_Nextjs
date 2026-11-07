#!/usr/bin/env node
/**
 * Growth report — where signups come from and whether they stick.
 *
 * Read-only. Run via `pnpm growth:report:dev` / `pnpm growth:report:prod`
 * (each wraps its own `doppler run --config <env>`; don't prefix another).
 *
 * Usage (each script already wraps its own `doppler run --config <env>`):
 *   pnpm growth:report:dev
 *   pnpm growth:report:prod -- --days=90     # window for the per-day and
 *                                            # per-channel tables (default 30)
 *
 * `--days` is written with an `=`, and anything else is a hard error, matching
 * `db-health.mjs` — a report is read for its numbers, so quietly falling back to
 * 30 for `--days=90` or `--days abc` would print a header saying "last 30 days"
 * over figures the operator believes are 90 and has no way to tell apart.
 *
 * "Channel" is the first value present of utm_source, ?ref=, referrer host —
 * see `src/lib/attribution.ts`. `(direct)` means the browser recorded a visit
 * with no channel; `(unknown)` means no visit was recorded — the account
 * predates attribution (even if it later answered the card) or the browser
 * blocked storage. "Activated" = went on to add at least one
 * transaction. "Invited via" is recorded by the server at sign-up (a split
 * invite was waiting for the account's email); "Converted from a free tool" is
 * recorded by the server when a new account imports what it made on a tool
 * (a split calculator group). Days are UTC.
 *
 * "About you" is the optional welcome questionnaire (`src/lib/about-you.ts`),
 * asked once of every account — new and existing — so its tables count
 * answers *given* in the window (`users.about->>'at'`), not signups. Values are
 * the stored codes; the labels people saw are in `ABOUT_OPTIONS`.
 *
 * "Product news" counts accounts that said yes to news emails (the optional box
 * on the terms dialog, or Settings → Account; `users.news_emails_at`), new in
 * the window and in total. The addresses are listed only on request, and only
 * for sending through a tool that honours unsubscribes:
 *   select email from users where news_emails_at is not null;
 */
import pg from "pg";

/** `pnpm run x -- --flag` forwards a bare `--` too; it isn't an argument. */
const args = process.argv.slice(2).filter((a) => a !== "--");

const USAGE = "usage: pnpm growth:report:dev|prod [-- --days=<n>]";

function usageError(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

const DAYS_RANGE = { min: 1, max: 3650 };
for (const arg of args) {
  const [name] = arg.split("=");
  if (name !== "--days") usageError(`Unrecognised argument "${arg}".`);
  if (!arg.includes("=")) usageError("--days needs --days=<n>, not a space.");
}
const daysArg = args.find((a) => a.startsWith("--days="));
let DAYS = 30;
if (daysArg) {
  const raw = daysArg.slice("--days=".length);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < DAYS_RANGE.min || value > DAYS_RANGE.max) {
    usageError(
      `--days: expected a whole number in [${DAYS_RANGE.min}, ${DAYS_RANGE.max}], got "${raw}".`,
    );
  }
  DAYS = value;
}

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm growth:report:dev|prod");
  process.exit(2);
}

function table(rows) {
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? "");
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals) => "  " + vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(line(cols.map((c) => cell(r[c]))));
}

// Keep DATE columns as the 'YYYY-MM-DD' text Postgres sends (the default
// parser would turn them into local-midnight JS Dates and shift the day).
pg.types.setTypeParser(1082, (v) => v);
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
    `with bounds as (
       select (now() at time zone 'UTC')::date as today
     )
     select d::date as day, coalesce(s.n, 0)::int as signups
       from bounds, generate_series(today - ($1::int - 1), today, interval '1 day') d
       left join (
         select (created_at at time zone 'UTC')::date as day, count(*)::int as n
           from users
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
                     case when u.acquisition ? 'capturedAt' then '(direct)' else '(unknown)' end) as channel,
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

  // Server-recorded at the account's first bootstrap (`src/lib/split-signup.ts`,
  // rule in `src/lib/attribution.ts`): invitations to split groups were waiting
  // for the new account's email. "Joined split" = went on to join a group.
  const { rows: invited } = await client.query(
    `select coalesce(u.acquisition->>'invitedVia', '(not invited)') as invited_via,
            count(*)::int as signups,
            count(*) filter (where exists (select 1 from transactions t where t.user_id = u.id))::int as activated,
            count(*) filter (where exists (select 1 from split_members m
                                            where m.user_id = u.id and m.status = 'joined'))::int as joined_split
       from users u
      where u.created_at >= now() - make_interval(days => $1)
      group by 1
      order by 2 desc, 1`,
    [DAYS],
  );
  console.log(`\nInvited via (window)\n`);
  table(invited);

  // Server-recorded when a new account brings in what it made on a free tool
  // (`src/services/split-import.ts`, rule in `src/lib/attribution.ts`):
  // `tool:split` = imported a group from the split calculator.
  const { rows: converted } = await client.query(
    `select coalesce(u.acquisition->>'convertedFrom', '(no tool import)') as converted_from,
            count(*)::int as signups,
            count(*) filter (where exists (select 1 from transactions t where t.user_id = u.id))::int as activated
       from users u
      where u.created_at >= now() - make_interval(days => $1)
      group by 1
      order by 2 desc, 1`,
    [DAYS],
  );
  console.log(`\nConverted from a free tool (window)\n`);
  table(converted);

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

  const aboutWindow = `u.about is not null
        and (u.about->>'at')::timestamptz >= now() - make_interval(days => $1)`;
  const { rows: aboutStatus } = await client.query(
    `select u.about->>'status' as status, count(*)::int as people
       from users u
      where ${aboutWindow}
      group by 1
      order by 2 desc, 1`,
    [DAYS],
  );
  console.log(`\n"About you" — answered or skipped (window)\n`);
  table(aboutStatus);

  // Single-choice questions: one row per answer.
  for (const [key, title] of [
    ["useFor", "Personal or business"],
    ["teamSize", "Team size (business)"],
    ["describes", "Which best describes you"],
    ["useWith", "Who they'll use it with"],
    ["trackingNow", "How they track money now"],
    ["frequency", "How often they'll log"],
  ]) {
    const { rows } = await client.query(
      `select u.about->>'${key}' as answer, count(*)::int as people
         from users u
        where ${aboutWindow}
          and u.about ? '${key}'
        group by 1
        order by 2 desc, 1`,
      [DAYS],
    );
    console.log(`\n"About you": ${title} (window)\n`);
    table(rows);
  }

  // Multi-choice questions: each pick counts once.
  for (const [key, title] of [
    ["goals", "What brings them here"],
    ["features", "Features they're excited about"],
  ]) {
    const { rows } = await client.query(
      `select pick as answer, count(*)::int as people
         from users u, jsonb_array_elements_text(u.about->'${key}') as pick
        where ${aboutWindow}
          and jsonb_typeof(u.about->'${key}') = 'array'
        group by 1
        order by 2 desc, 1`,
      [DAYS],
    );
    console.log(`\n"About you": ${title} (window, each pick counted)\n`);
    table(rows);
  }

  const { rows: news } = await client.query(
    `select count(*) filter (where news_emails_at >= now() - make_interval(days => $1))::int as "yes (window)",
            count(*) filter (where news_emails_at is not null)::int as "yes (all time)",
            count(*)::int as accounts
       from users`,
    [DAYS],
  );
  console.log(`\nProduct news emails — said yes\n`);
  table(news);

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
