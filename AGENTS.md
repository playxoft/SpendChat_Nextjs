<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpendChat — project notes

A minimal, chat-style money tracker. Next.js 16 (App Router) + TS + Tailwind v4 + shadcn/ui,
deployed to Cloudflare Workers via OpenNext. Neon Postgres (Drizzle), Neon Auth
(`@neondatabase/auth`), secrets via Doppler.

## Commands (secrets come from Doppler)
- `doppler run -- pnpm dev` — local dev
- `pnpm typecheck` / `pnpm lint` — must stay clean
- `pnpm db:generate` then `doppler run -- pnpm db:migrate` — schema changes
- `pnpm preview` / `doppler run -- pnpm deploy` — Worker build / deploy

## Conventions
- **Money** is stored as integer minor units (`amount_minor`). Convert with `src/lib/money.ts`
  (`toMinorUnits` / `fromMinorUnits` / `formatMoney`). Never use floats for amounts.
- **Single currency per user** (in `user_settings`). Don't introduce per-transaction currency.
  New users default to a geo-detected currency/locale (`src/lib/geo.ts` + `geo.server.ts`:
  Cloudflare `cf-ipcountry`, then `Accept-Language` region) applied only at bootstrap —
  never silently change an existing user's currency.
- **Ids are UUIDv7** (`uuid` columns, Postgres 18's `uuidv7()` as the DB default). No text
  or v4 ids for anything we mint. Exception: `user_id` values come from Neon Auth (v4,
  outside our control) — the columns are typed `uuid`, but the version isn't ours to choose.
- **Workspaces + RBAC.** Profiles live in workspaces; every user owns a default
  workspace ("<name>'s Workspace", created at bootstrap). Access = workspace membership
  (`workspace_members`) or per-profile grant (`profile_access`); roles viewer < editor < admin,
  effective role on a profile = max of the two (`src/lib/rbac.ts`, `src/lib/workspaces.ts`).
  Transaction/profile reads scope to accessible profiles in the *current* workspace
  (`user_settings.last_workspace_id`, `X-Workspace-Id` header on the API); `transactions.user_id`
  is attribution, not access. Categories remain per-user. Member invites go through ZeptoMail
  (`src/lib/email.ts`, `ZEPTOMAIL_TOKEN`/`MAIL_FROM_ADDRESS` in Doppler); unknown emails become
  `workspace_invites` rows accepted at the invitee's first bootstrap.
- **Every query is scoped to the authenticated user's access.** Reads live in `src/lib/queries.ts`,
  mutations in `src/actions/*` (server actions), both validated with Zod (`src/lib/validation.ts`).
- Auth: Neon Auth (`@neondatabase/auth`). Server instance in `src/lib/neon-auth.ts` (`auth`),
  browser client in `src/lib/neon-auth-client.ts`. Helpers `getCurrentUser()` / `requireUser()` /
  `getAppContext()` in `src/lib/auth.ts` wrap `auth.getSession()`. The API handler lives at
  `app/api/auth/[...path]`. Route protection is enforced in the `(app)` layout via `requireUser()`
  (no `proxy.ts`/middleware — OpenNext on Workers can't run Next 16's Node-only middleware).
- DB client is lazy via `getDb()` so env is read inside the request context (Workers-safe).
- Keep the design minimal and neutral (no gradients); income uses a single emerald accent.

## Mobile API (`/api/v1`) — keep docs in lockstep
The Flutter app consumes the versioned REST API under `src/app/api/v1/*`. Its
contract is documented in three files that MUST stay in sync with the code:
- **`_developer/flutter/openapi.yaml`** — the **canonical** machine-readable spec
  (OpenAPI 3.1). `info.version` is the API version. (`_developer/api/openapi.yaml`
  is **deprecated** — never update it.)
- **`_developer/flutter/01-api-reference.md`** — the human-readable contract
  (endpoint tables, models); its "API spec version" line mirrors the spec version.
- **`_developer/flutter/_changelog.md`** — per-version history of API changes.

**Whenever you change anything under `src/app/api/v1/**` (or the request/response
shape it serializes) — even a one-line tweak — you MUST, in the same change:**
1. **bump the version** in `openapi.yaml` (`info.version`) *and* the "API spec
   version" line in `01-api-reference.md`. Semver-ish: **major** = breaking
   (removed/renamed/retyped field, changed status) → Flutter must change;
   **minor** = backward-compatible addition (new endpoint/optional field);
   **patch** = docs/clarification only.
2. **add a `_changelog.md` entry** (newest first) with the version, date, what
   changed, and a **Flutter impact** line.
3. **update `openapi.yaml` + `01-api-reference.md`** to match the new behaviour.

No API change ships without these three docs updated. If you're unsure whether a
change is "API-visible", it is if a mobile client could observe it (path, method,
status, headers, or JSON shape).

## Git
- Write commit messages and PR bodies as a normal engineering project. Do **not** add AI
  attribution: no `Co-Authored-By: Claude …` trailer and no "Generated with Claude Code" line.
