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

let current: TestSessionUser | null = null;

export function setSession(user: TestSessionUser | null): void {
  current = user;
}

/** Sign in as a bare user id (the common case). */
export function signInAs(id: string): TestSessionUser {
  current = { id, email: `${id}@example.com`, name: id };
  return current;
}

export function getSessionUser(): TestSessionUser | null {
  return current;
}
