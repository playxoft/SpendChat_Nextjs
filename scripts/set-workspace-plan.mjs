#!/usr/bin/env node
/**
 * Set a workspace's plan by hand — **development only**, for trying the Plus
 * and Pro limits before billing exists (personal phase 9 will set plans from
 * the payment provider's webhooks).
 *
 * Usage (the script wraps its own `doppler run --config dev`; don't prefix another):
 *   pnpm plan:set:dev -- --list                          # workspaces with their plan
 *   pnpm plan:set:dev -- --workspace=<uuid> --plan=pro   # free | plus | pro
 *
 * There is deliberately no `plan:set:prod`. On a production database this would
 * hand out paid plans for free, so a write refuses to run unless Doppler says
 * the dev config is active. Unknown or malformed arguments are hard errors,
 * like `db-health.mjs`: a typo must never fall back to a default that writes.
 */
import pg from "pg";

/** `pnpm run x -- --flag` forwards a bare `--` too; it isn't an argument. */
const args = process.argv.slice(2).filter((a) => a !== "--");

const USAGE =
  "usage: pnpm plan:set:dev -- --list | --workspace=<uuid> --plan=free|plus|pro";
const PLANS = ["free", "plus", "pro"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usageError(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

const opts = {};
for (const arg of args) {
  if (arg === "--list") {
    opts.list = true;
    continue;
  }
  const match = /^--(workspace|plan)=(.+)$/.exec(arg);
  if (!match) usageError(`Unrecognised argument "${arg}".`);
  opts[match[1]] = match[2];
}

if (opts.list && (opts.workspace || opts.plan)) {
  usageError("--list doesn't take other arguments.");
}
if (!opts.list) {
  if (!opts.workspace || !UUID.test(opts.workspace)) usageError("--workspace=<uuid> is required.");
  if (!opts.plan) usageError("Nothing to change: pass --plan.");
  if (!PLANS.includes(opts.plan)) usageError(`--plan must be one of ${PLANS.join(", ")}.`);
}

const url = process.env.NEON_POSTGRES_DATABASE_URL;
if (!url) {
  console.error("NEON_POSTGRES_DATABASE_URL is not set — run via pnpm plan:set:dev");
  process.exit(2);
}

// The production guard. Reading `--list` is harmless anywhere; writing is not.
// `doppler run` exports the config it resolved as DOPPLER_CONFIG, so a write
// is only allowed under the dev config (or a branch of it, e.g. `dev_personal`)
// — `doppler run --config prd -- node scripts/set-workspace-plan.mjs` refuses.
if (!opts.list) {
  const config = process.env.DOPPLER_CONFIG ?? "";
  if (config !== "dev" && !config.startsWith("dev_")) {
    console.error(
      `Refusing to write: this only runs under Doppler's dev config (got "${config || "none"}"). Use pnpm plan:set:dev.`,
    );
    process.exit(2);
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (opts.list) {
    const { rows } = await client.query(
      `select w.id, w.name, w.plan, u.email as owner
         from workspaces w left join users u on u.id = w.owner_id
        order by w.created_at`,
    );
    for (const r of rows) {
      console.log(`${r.id}  ${String(r.plan).padEnd(4)}  ${r.name}  (${r.owner ?? "?"})`);
    }
    if (rows.length === 0) console.log("(no workspaces)");
  } else {
    const { rows } = await client.query(
      `update workspaces set plan = $2::workspace_plan, updated_at = now() where id = $1 returning id, name, plan`,
      [opts.workspace, opts.plan],
    );
    if (rows.length === 0) {
      console.error(`No workspace ${opts.workspace}.`);
      process.exitCode = 1;
    } else {
      const r = rows[0];
      console.log(`${r.name}: plan ${r.plan}`);
    }
  }
} finally {
  await client.end();
}
