/**
 * The Worker entry (`main` in wrangler.toml). OpenNext's generated handler
 * serves every request; this file only adds what a Next app can't declare on
 * its own — the Durable Object classes the bindings point at, and the daily
 * cron's `scheduled()` handler.
 * See https://opennext.js.org/cloudflare/howtos/custom-worker.
 *
 * Excluded from tsconfig: `.open-next/worker.js` only exists after
 * `opennextjs-cloudflare build`. `wrangler deploy` bundles this file — outside
 * Next's build, so import only dependency-free `src/lib` modules here.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import { CRON_JOBS, dispatchCronJob } from "./src/lib/cron-dispatch";

export default {
  fetch: handler.fetch,

  // Daily (`[triggers] crons` in wrangler.toml): runs each job through the
  // app's own fetch handler, in-process, on its token-guarded internal route.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchCronJob(handler.fetch, env, ctx, env.APP_ORIGIN, CRON_JOBS.trashPurge));
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Per-person rate limits (abuse rule C8) — bound as RATE_LIMITER per env.
export { RateLimiter } from "./src/lib/rate-limit/durable-object";
