/**
 * The per-run secret that lets the Worker's cron reach its internal route.
 *
 * `worker.ts`'s `scheduled()` can't run app code directly (wrangler bundles it
 * outside the `react-server` condition, where every `server-only` module
 * throws, and outside OpenNext's request scope, where there's no Hyperdrive),
 * so it calls the app's own fetch handler **in-process** on an internal route.
 * That route is also reachable from the internet, so it answers 404 unless the
 * request carries a token minted for this one run.
 *
 * The token lives on `globalThis` under a registry symbol, not in this module:
 * `worker.ts` and the Next server bundle each get their own copy of this file,
 * but they share the isolate's global. Nothing outside the isolate can read
 * it, and it exists only while a run is in flight — with none in flight there
 * is no token, and nothing is accepted.
 *
 * Deliberately dependency-free (no `server-only`, no Node APIs) so the Worker
 * entry can import it.
 */

const REGISTRY = Symbol.for("spendchat.cron.tokens");

/** The header the in-process cron request carries its token in. */
export const CRON_TOKEN_HEADER = "x-spendchat-cron-token";

function active(): Set<string> {
  const g = globalThis as unknown as Record<symbol, Set<string> | undefined>;
  let set = g[REGISTRY];
  if (!set) {
    set = new Set<string>();
    g[REGISTRY] = set;
  }
  return set;
}

/** Mint a token for one run. 244 bits of `crypto.randomUUID()` randomness. */
export function issueCronToken(): string {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  active().add(token);
  return token;
}

/** Forget a run's token once the run is over. */
export function revokeCronToken(token: string): void {
  active().delete(token);
}

/** Length-checked, then compared without an early exit. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Whether `presented` is the token of a run in flight. False for a missing or
 * empty value, and always false while no run is in flight — an unset token
 * never matches anything, the empty string included.
 */
export function isValidCronToken(presented: string | null | undefined): boolean {
  if (typeof presented !== "string" || presented.length === 0) return false;
  let ok = false;
  for (const token of active()) {
    // Every active token is compared (no early return), so the timing doesn't
    // depend on which one matched.
    if (token.length > 0 && constantTimeEqual(presented, token)) ok = true;
  }
  return ok;
}
