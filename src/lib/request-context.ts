import "server-only";
import { headers } from "next/headers";
import { runWithLogContext, seedFromHeaders, setLogContext } from "@/lib/log-context";

/**
 * Establish a per-request logging context around `fn` so every log emitted
 * inside it automatically carries `requestId` + `platform` (and `userId` /
 * `workspaceId` / `profileId` once auth and the mutation resolve them —
 * `getApiContext`, `runAction`, and the transaction services call
 * `setLogContext`). This is the seam that makes the five identity fields
 * mandatory on every log line without touching each call site.
 *
 * `fallbackPlatform` is the platform to record when the client sends no
 * `X-Client-Platform` header: "web" for server actions (only the Next.js app
 * invokes them), "api" for the mobile REST API.
 */
export function withRequestContext<T>(
  fallbackPlatform: string,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithLogContext({}, async () => {
    let get: (name: string) => string | null = () => null;
    try {
      const store = await headers();
      get = (name) => store.get(name);
    } catch {
      // Outside a request scope the seed still gets a generated id + platform.
    }
    setLogContext(seedFromHeaders(get, fallbackPlatform));
    return fn();
  });
}
