import { beforeAll, afterEach, vi } from "vitest";

/**
 * Global wiring for the integration suite. We mock only the true edges:
 *   - `@/db`        → the in-process PGlite client (real SQL, real migrations)
 *   - `@/lib/neon-auth` → a session we control (so the real `@/lib/auth` runs)
 *   - `next/cache`  → no-op revalidation
 *   - `next/navigation` → a throwing `redirect` (mirrors Next's control flow)
 *
 * Everything under test — actions, queries, auth bootstrap — runs unmocked.
 */

vi.mock("@/db", async () => {
  const { getTestDb } = await import("./helpers/test-db");
  const schema = await import("@/db/schema");
  return { getDb: () => getTestDb(), schema };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  // Mirrors Next's redirect(): throws to halt execution. Tag with a digest so
  // tests can assert the destination via `expectRedirect`.
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT: ${url}`) as Error & {
      digest: string;
      url: string;
    };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    err.url = url;
    throw err;
  },
}));

vi.mock("@/lib/neon-auth", async () => {
  const { getSessionUser } = await import("./helpers/session");
  return {
    auth: {
      getSession: async () => {
        const user = getSessionUser();
        return { data: user ? { user } : null };
      },
      signIn: { email: vi.fn() },
      signUp: { email: vi.fn() },
      handler: () => ({ GET: vi.fn(), POST: vi.fn() }),
    },
  };
});

// The mobile API verifies a bearer JWT via `@/lib/jwt`. In tests we swap the
// real JWKS verification for the same controllable session, so `requireApiUser`
// (and the whole /api/v1 stack) runs end-to-end driven by `signInAs()`.
vi.mock("@/lib/jwt", async () => {
  const { getSessionUser } = await import("./helpers/session");
  return {
    verifyAccessToken: async () => {
      const user = getSessionUser();
      if (!user) throw new Error("no session");
      return { sub: user.id, email: user.email, name: user.name };
    },
  };
});

beforeAll(async () => {
  const { initTestDb } = await import("./helpers/test-db");
  await initTestDb();
});

afterEach(async () => {
  const { resetTestDb } = await import("./helpers/test-db");
  const { setSession } = await import("./helpers/session");
  await resetTestDb();
  setSession(null);
  vi.clearAllMocks();
});
