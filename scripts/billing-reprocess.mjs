#!/usr/bin/env node
/**
 * Let a billing webhook that was already applied be applied again — for manual
 * recovery after a fix (a config mistake, a bug), when a replay from the
 * provider's dashboard would otherwise be ignored as a duplicate.
 *
 * The webhook records each delivery's `webhook-id` in `billing_webhook_events`
 * when it applies it, and ignores that id from then on. This forgets one id;
 * then resend the event from Dodo → Developer → Webhooks → your endpoint →
 * the event → Resend. (Events the webhook *couldn't* apply — an unknown
 * product, a payment it couldn't place — were never recorded, so a replay of
 * those works without this.)
 *
 * Re-applying is safe: subscription events are snapshots, payments and refunds
 * are keyed by the provider's ids, a top-up is granted once per payment, and a
 * dispute counts once per payment.
 *
 * Usage (each wraps its own `doppler run --config <env>`; don't prefix another):
 *   pnpm billing:reprocess:dev -- --list               # the 20 newest applied events
 *   pnpm billing:reprocess:dev -- --event=<webhook-id> # forget one, then resend it
 *   pnpm billing:reprocess:prod -- --event=<webhook-id>
 */
import pg from "pg";

const args = process.argv.slice(2).filter((a) => a !== "--");
const USAGE = "usage: pnpm billing:reprocess:dev|prod -- --list | --event=<webhook-id>";
let list = false;
let event = null;
for (const arg of args) {
  if (arg === "--list") list = true;
  else if (/^--event=\S+$/.test(arg)) event = arg.slice("--event=".length);
  else {
    console.error(`Unrecognised argument "${arg}".\n${USAGE}`);
    process.exit(2);
  }
}
if (list === Boolean(event)) {
  console.error(`Pass exactly one of --list or --event=<webhook-id>.\n${USAGE}`);
  process.exit(2);
}

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm billing:reprocess:dev|prod");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (list) {
    const { rows } = await client.query(
      "select id, type, processed_at from billing_webhook_events order by processed_at desc limit 20",
    );
    for (const r of rows) console.log(`${r.processed_at.toISOString()}  ${r.type.padEnd(28)}  ${r.id}`);
    if (rows.length === 0) console.log("(no applied events)");
  } else {
    const { rows } = await client.query("delete from billing_webhook_events where id = $1 returning type, processed_at", [
      event,
    ]);
    if (rows.length === 0) {
      console.log(`No applied event ${event} — a replay will be applied as it is.`);
    } else {
      console.log(
        `Forgot ${rows[0].type} ${event} (applied ${rows[0].processed_at.toISOString()}). Now resend it from Dodo → Developer → Webhooks → your endpoint.`,
      );
    }
  }
} finally {
  await client.end();
}
