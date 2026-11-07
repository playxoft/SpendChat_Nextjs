#!/usr/bin/env node
/**
 * Replay a new account's onboarding on one dev account — **development only**
 * (local `next dev` and beta.spendchat.app, which share the dev database).
 *
 * Usage (the script wraps its own `doppler run --config dev`; don't prefix another):
 *   pnpm onboarding:reset:dev                    # the account named in package.json
 *   doppler run --config dev -- node scripts/onboarding-reset.mjs --user=<uuid>
 *
 * The account is named by its `users.id`, never an email, so nothing personal
 * sits in this public repo. On its next page load the account sees, in order:
 * the terms dialog (with the optional product-news box), the currency step
 * (which sends the welcome email again — to the account's real address, if
 * dev has a mail token), the product tour, then "About you".
 *
 * It resets only onboarding state: the terms acceptance, the product-news
 * choice, the About-you answers, the welcome email's "sent" mark and the
 * onboarding flags in `ui_prefs`. Transactions, workspaces, files and
 * everything else are untouched. "Where did you hear about us?" comes back
 * only for accounts under a week old, so an older account won't see it.
 *
 * Refuses to run unless Doppler says the dev config is active, so it can't
 * touch production.
 */
import pg from "pg";

/** `pnpm run x -- --flag` forwards a bare `--` too; it isn't an argument. */
const args = process.argv.slice(2).filter((a) => a !== "--");

const USAGE = "usage: pnpm onboarding:reset:dev  (or: node scripts/onboarding-reset.mjs --user=<uuid>)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usageError(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

let userId = null;
for (const arg of args) {
  const match = /^--user=(.+)$/.exec(arg);
  if (!match) usageError(`Unrecognised argument "${arg}".`);
  userId = match[1];
}
if (!userId || !UUID.test(userId)) usageError("--user=<uuid> is required.");

const config = process.env.DOPPLER_CONFIG ?? "";
if (config !== "dev" && !config.startsWith("dev_")) {
  console.error(
    `Refusing to run: this only runs under Doppler's dev config (got "${config || "none"}"). Use pnpm onboarding:reset:dev.`,
  );
  process.exit(2);
}

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm onboarding:reset:dev");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const { rowCount } = await client.query(
    `update users
        set terms_version = null,
            terms_accepted_at = null,
            news_emails_at = null,
            about = null,
            welcomed_at = null,
            updated_at = now()
      where id = $1`,
    [userId],
  );
  if (rowCount === 0) {
    await client.query("rollback");
    console.error(`No account ${userId} in this database.`);
    process.exitCode = 1;
  } else {
    // Merge into the onboarding namespace only: the composer, the sidebar and
    // a dismissed invite nudge stay as they are.
    await client.query(
      `update user_settings
          set ui_prefs = ui_prefs || jsonb_build_object(
                'onboarding',
                coalesce(ui_prefs -> 'onboarding', '{}'::jsonb)
                  || '{"currencyPending": true, "tourPending": true, "aboutDone": false}'::jsonb
              ),
              updated_at = now()
        where user_id = $1`,
      [userId],
    );
    await client.query("commit");
    console.log(
      `Onboarding reset for ${userId}: terms, product-news choice, About you, welcome email and the tour.\n` +
        "Nothing else changed. Reload /app to go through it again.",
    );
  }
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
