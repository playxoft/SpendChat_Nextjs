// The Worker entry: OpenNext's generated fetch handler plus what OpenNext
// doesn't generate — the daily cron (trash purge) and, from phase 6, the
// rate-limit Durable Object export. Excluded from tsconfig: `.open-next/` and
// the Workers runtime types exist only after `opennextjs-cloudflare build` /
// `cf-typegen`, both git-ignored. Keep it thin; the logic lives in `src/lib`
// (dependency-free modules only — wrangler bundles this file outside Next).
// See https://opennext.js.org/cloudflare/howtos/custom-worker
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
