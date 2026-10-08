/**
 * The Worker entry (`main` in wrangler.toml). OpenNext's generated handler
 * serves every request; this file only adds what a Next app can't declare on
 * its own — the Durable Object classes the bindings point at.
 * See https://opennext.js.org/cloudflare/howtos/custom-worker.
 *
 * Excluded from tsconfig: `.open-next/worker.js` only exists after
 * `opennextjs-cloudflare build`. `wrangler deploy` bundles this file.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;

// Per-person rate limits (abuse rule C8) — bound as RATE_LIMITER per env.
export { RateLimiter } from "./src/lib/rate-limit/durable-object";
