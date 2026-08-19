import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request memo for reads that several queries in the same request need.
 *
 * React's `cache()` already does this — but only inside an RSC render, where
 * there is a Flight request to hang the cache off. In a route handler or a
 * server action body there isn't one, and React quietly falls back to a
 * throwaway map per call, so a `cache()`d read runs again every time. That's the
 * whole mobile API and every server action.
 *
 * So this is the same idea keyed to the seam we *do* control: wherever
 * `withRequestContext` runs (`src/lib/request-context.ts`) — `handle()`,
 * `runAction()`, and the handful of route handlers that call it directly.
 * Outside any scope — RSC renders, scripts, tests, module init — it degrades to
 * calling straight through, never to cross-request state.
 *
 * Two things to know before caching something here:
 *  - It stores the *promise*, so concurrent callers share one round trip. A
 *    rejection evicts itself, so one transient failure doesn't poison the rest
 *    of the request.
 *  - Nothing expires on its own. Cache a read only if it can't change within a
 *    request, or call `forgetForRequest` from whatever changes it.
 */
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/** Open a memo scope for one request. Nested calls start a fresh, empty scope. */
export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), fn);
}

/**
 * Run `load` once per request per `key`, or straight through when there is no
 * request scope. Keys are global, so namespace them (`"profile-ids:…"`).
 */
export function memoizeForRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return load();
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const pending = load().catch((err: unknown) => {
    // Don't let one failed round trip stand in for every later read of the same
    // key. The caller still sees the rejection; the next one gets a fresh try.
    store.delete(key);
    throw err;
  });
  store.set(key, pending);
  return pending;
}

/** Drop a memoized entry, for the writer that just made it wrong. */
export function forgetForRequest(key: string): void {
  storage.getStore()?.delete(key);
}
