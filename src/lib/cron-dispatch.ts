/**
 * What the Worker's `scheduled()` does: run each cron job through the app's
 * own fetch handler, in-process, on its internal route — so the job runs as an
 * ordinary request (Hyperdrive, `after()` log shipping, `withRequestContext`)
 * instead of in the bare cron scope. See `cron-token.ts` for why, and for how
 * the route knows the request is ours.
 *
 * Dependency-free on purpose (no `server-only`, no app modules): `worker.ts`
 * imports it, and wrangler bundles that file outside Next's build.
 */
import { CRON_TOKEN_HEADER, issueCronToken, revokeCronToken } from "./cron-token";

/** Every cron job and the internal route that runs it. */
export const CRON_JOBS = {
  trashPurge: "/api/internal/cron/trash-purge",
} as const;

type FetchHandler<Env, Ctx> = (request: Request, env: Env, ctx: Ctx) => Promise<Response>;

/**
 * Run one cron job. `origin` is the deployment's public origin (the
 * `APP_ORIGIN` var): OpenNext records the first request it sees in an isolate
 * as the isolate's origin, which Next uses for server-action redirects, so the
 * synthetic request must carry the real one. Without it the run is skipped and
 * said so, rather than risk recording a made-up origin.
 */
export async function dispatchCronJob<Env, Ctx>(
  fetchHandler: FetchHandler<Env, Ctx>,
  env: Env,
  ctx: Ctx,
  origin: string | undefined,
  path: (typeof CRON_JOBS)[keyof typeof CRON_JOBS],
): Promise<void> {
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin)) {
    console.error(`[error] Cron job ${path} skipped: APP_ORIGIN is not set to an origin`);
    return;
  }
  const token = issueCronToken();
  try {
    const response = await fetchHandler(
      new Request(new URL(path, origin), {
        method: "POST",
        headers: { [CRON_TOKEN_HEADER]: token },
      }),
      env,
      ctx,
    );
    if (!response.ok) {
      console.error(`[error] Cron job ${path} answered ${response.status}`);
    }
    await response.body?.cancel();
  } finally {
    revokeCronToken(token);
  }
}
