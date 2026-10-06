import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RateBucket } from "@/lib/plans";
import type { RateSnapshot } from "./sliding-window";

/** The two calls the limiter makes on a person's Durable Object. */
export type RateLimiterStub = {
  hit(bucket: RateBucket, weight: number): Promise<RateSnapshot>;
  undo(bucket: RateBucket, at: number, weight: number): Promise<void>;
};

/**
 * A person's rate-limit Durable Object, or null when there is no binding —
 * `next dev` (the top level of wrangler.toml has none), tests and scripts,
 * where the limiter fails open. The one seam the integration tests replace
 * with an in-memory counter.
 *
 * The object is named by our internal user id, which only ever comes from a
 * verified token, so a caller can't pick whose counter they hit.
 */
export function getRateLimiterStub(userId: string): RateLimiterStub | null {
  let namespace: CloudflareEnv["RATE_LIMITER"] | undefined;
  try {
    namespace = getCloudflareContext().env.RATE_LIMITER;
  } catch {
    return null; // outside a Worker request
  }
  if (!namespace) return null;
  // The RPC stub's generated type wraps every return in `Rpc` helpers; the
  // two methods we call return plain data, so name them as such.
  return namespace.getByName(userId) as unknown as RateLimiterStub;
}
