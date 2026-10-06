import { DurableObject } from "cloudflare:workers";
import { RateCounter } from "./counter";
import type { RateSnapshot } from "./sliding-window";

/**
 * One person's rate-limit counter (abuse rule C8), as a SQLite-backed Durable
 * Object — one instance per user, addressed by `getByName(userId)`.
 *
 * It only counts: `hit` records a request and returns the counts including it,
 * `undo` takes a refused one back. Judging the counts against the person's plan
 * happens in the Worker (`lib/rate-limit/index.ts`), so the plan lookup can run
 * while this call is in flight, and the plan numbers never live in here.
 *
 * Bound as `RATE_LIMITER` per env in `wrangler.toml` (with the `v1`
 * `new_sqlite_classes` migration) and exported from the Worker entry,
 * `worker.ts`. `next dev` and the tests have no binding; the limiter fails open
 * there.
 */
export class RateLimiter extends DurableObject {
  private readonly counter: RateCounter;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.counter = new RateCounter(ctx.storage.kv);
  }

  hit(bucket: string): RateSnapshot {
    return this.counter.hit(bucket, Date.now());
  }

  undo(bucket: string, at: number): void {
    this.counter.undo(bucket, at);
  }
}
