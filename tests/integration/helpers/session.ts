/**
 * Controllable "current session" for integration tests. The mocked
 * `@/lib/neon-auth` (see setup.ts) reads from here, so the *real* `requireUser`
 * / `getCurrentUser` in `@/lib/auth` run end-to-end against whatever user a test
 * signs in as. Switching users is how we prove per-user data isolation.
 */
export type TestSessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deterministic UUID for a short test alias — `user_id` columns are `uuid` in
 * Postgres, so bare aliases like "a" are no longer insertable. The alias is
 * hex-embedded in the tail (`uid("a")` → `…-000000000061`), keeping test ids
 * stable, readable, and collision-free. Idempotent for real UUIDs, so helpers
 * can normalize their inputs unconditionally.
 */
export function uid(alias: string): string {
  if (UUID_RE.test(alias)) return alias;
  const hex = Buffer.from(alias, "utf8").toString("hex");
  if (hex.length > 12) throw new Error(`Test user alias too long: ${alias}`);
  return `00000000-0000-4000-8000-${hex.padStart(12, "0")}`;
}

let current: TestSessionUser | null = null;

export function setSession(user: TestSessionUser | null): void {
  current = user;
}

/** Sign in as a short alias (the common case); the session id is `uid(alias)`. */
export function signInAs(alias: string): TestSessionUser {
  current = { id: uid(alias), email: `${alias}@example.com`, name: alias };
  return current;
}

export function getSessionUser(): TestSessionUser | null {
  return current;
}
