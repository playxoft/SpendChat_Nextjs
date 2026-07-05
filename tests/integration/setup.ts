import { beforeAll, afterEach, vi } from "vitest";

/**
 * Global wiring for the integration suite. We mock only the true edges:
 *   - `@/db`               → the in-process PGlite client (real SQL, real migrations)
 *   - `@/lib/firebase-verify` + `@/lib/identity` → a session we control (so the
 *     real `@/lib/auth`, `getAppContext`, and `/api/v1` stack run end-to-end)
 *   - `next/headers`       → empty headers + a `__session` cookie that's present
 *     iff a test is signed in (drives the web `getCurrentUser`)
 *   - `next/cache`         → no-op revalidation
 *   - `next/navigation`    → a throwing `redirect` (mirrors Next's control flow)
 *
 * Everything under test — actions, queries, auth bootstrap, directory — runs
 * unmocked. `signInAs()` sets the deterministic user id used across seeds.
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

// Bootstrap geo-detects default currency/locale from request headers. Tests run
// outside a request scope, so serve an empty header bag — detection falls back
// to the global defaults (USD / en-US). The `__session` cookie is present only
// when signed in, so `getCurrentUser` returns null when signed out.
vi.mock("next/headers", async () => {
  const { getSessionUser } = await import("./helpers/session");
  const { SESSION_COOKIE } = await import("@/lib/session-cookie");
  return {
    headers: async () => new Headers(),
    cookies: async () => ({
      get: (name: string) =>
        name === SESSION_COOKIE && getSessionUser() ? { value: "test-token" } : undefined,
      set: () => {},
      delete: () => {},
    }),
  };
});

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

// Web (cookie) and mobile (bearer) auth both verify a Firebase token then map
// it to our internal user via `resolveUser`. We mock those two edges so the
// real getCurrentUser/requireApiUser run driven by `signInAs()`. `resolveUser`
// returns the deterministic test id AND seeds a `users` row, so the real
// directory lookups (member names) work exactly as in production.
vi.mock("@/lib/firebase-verify", async () => {
  const { getSessionUser } = await import("./helpers/session");
  return {
    verifyFirebaseIdToken: async () => {
      const user = getSessionUser();
      if (!user) throw new Error("no session");
      return { sub: user.id, email: user.email, name: user.name };
    },
  };
});

vi.mock("@/lib/identity", async () => {
  const { getSessionUser } = await import("./helpers/session");
  const { getTestDb } = await import("./helpers/test-db");
  const schema = await import("@/db/schema");
  return {
    resolveUser: async () => {
      const user = getSessionUser();
      if (!user) throw new Error("no session");
      await getTestDb()
        .insert(schema.users)
        .values({
          id: user.id,
          firebaseUid: `fb-${user.id}`,
          email: user.email,
          name: user.name,
        })
        .onConflictDoNothing();
      return { id: user.id, email: user.email, name: user.name };
    },
    syncUserProfile: async () => {},
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
