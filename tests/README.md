# Tests

Two suites, both Node, run by Vitest (`vitest.config.ts` defines them as projects).

```bash
pnpm test            # everything, once
pnpm test:watch      # watch mode
pnpm test:cov        # with coverage + the enforced gate
pnpm test:unit       # Layer 1 only
pnpm test:integration# Layer 2 only
```

No Doppler/secrets needed — the integration suite runs against an in-process
Postgres, so nothing touches the real Neon database.

## Layer 1 — `tests/unit` (pure logic)

Deterministic, no I/O: money conversion/formatting, dates & timezones, the bulk
paste parser, CSV, query-string filter parsing, currencies, keyboard shortcuts,
auth-error mapping, every Zod schema, and the static config/data modules.

## Layer 2 — `tests/integration` (DB-backed)

Server actions, `lib/queries.ts`, `lib/auth.ts` bootstrap, and the CSV export
route — run end-to-end against real SQL.

What is real vs. mocked (`tests/integration/setup.ts`):

- **Real:** every action, query, `ensureBootstrap`, `requireUser`/`getCurrentUser`,
  and the actual Drizzle SQL.
- **`@/db`** → an in-process **PGlite** (Postgres 16) with the real migrations
  applied. PGlite predates Postgres 18's `uuidv7()`, so `helpers/test-db.ts`
  shims it onto `gen_random_uuid()` (a valid, unique UUID — all the tests need).
- **`@/lib/neon-auth`** → a session we control via `helpers/session.ts`
  (`signInAs(id)` / `setSession(null)`). Switching users is how the
  **tenant-isolation** tests prove one user can never read or mutate another's
  rows.
- **`next/cache`** → no-op `revalidatePath`.
- **`next/navigation`** → a throwing `redirect` (mirrors Next's control flow);
  tests assert `rejects.toMatchObject({ url: "/sign-in" })`.

Each test starts from a truncated database (`afterEach` in setup).

## Coverage gate

Enforced on the core (`src/lib/**`, `src/actions/**`, the export route):
**100% lines / statements / functions**, **97% branches**.

The handful of uncovered branches are unreachable defensive fallbacks
(`zodError.issues[0]?.message ?? "…"`, `row?.count ?? 0`, `coalesce(...) ?? 0`,
`formatToParts(...) ?? ""`) — covering them would mean faking library internals,
not testing behaviour. `blog.ts` (MDX imports) and the thin `neon-auth*`
wrappers are excluded from the gate.

## Not covered here (deliberately)

Layer 3 (React component tests) and Layer 4 (Playwright E2E) — interactive
components and full user journeys — are the next phase.
