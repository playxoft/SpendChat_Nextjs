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
- `pnpm db:generate` (no DB — writes SQL only), then `pnpm db:migrate:dev` /
  `pnpm db:migrate:prod` — schema changes. Every DB script names its env
  explicitly (`:dev` = config `dev`, `:prod` = config `prd`) — there is no bare
  default. Each already wraps its own `doppler run --config <env>`, so **don't**
  prefix another `doppler run --` (that nests and the inner config wins).
  `db:push:dev` / `db:push:prod` push the schema directly, bypassing migration
  files — reserve them for dev; prefer `db:migrate:prod` for prod so prod stays a
  reviewed, replayable migration history. `db:studio:dev` / `db:studio:prod`
  open Studio.
- `pnpm preview` / `pnpm deploy:dev` / `pnpm deploy:prod` — Worker build / deploy

## Conventions
- **Money** is stored as integer minor units (`amount_minor`). Convert with `src/lib/money.ts`
  (`toMinorUnits` / `fromMinorUnits` / `formatMoney`). Never use floats for amounts.
- **Single currency + number format per workspace** (`workspaces.currency` / `.locale`, admin-
  editable via `updateWorkspaceCurrency`). Every member of a workspace sees amounts in that
  currency; read it from the *workspace* (`getAppContext`/`getApiContext` → `workspace`, or
  `getWorkspaceMoneyFormat`), never from `user_settings`. Don't introduce per-transaction
  currency. A new user's default workspace is seeded with a geo-detected currency/locale
  (`src/lib/geo.ts` + `geo.server.ts`: Cloudflare `cf-ipcountry`, then `Accept-Language` region)
  at bootstrap only; a new workspace an existing user creates inherits their current one.
  `user_settings` holds only per-user prefs that follow the user across workspaces: `theme`
  and `input_mode`.
- **Ids are UUIDv7** (`uuid` columns, Postgres 18's `uuidv7()` as the DB default). No text
  or v4 ids for anything we mint. Exception: `user_id` values come from Neon Auth (v4,
  outside our control) — the columns are typed `uuid`, but the version isn't ours to choose.
- **Workspaces + RBAC.** Profiles live in workspaces; every user owns a default
  workspace ("<name>'s Workspace", created at bootstrap). Access = workspace membership
  (`workspace_members`) or per-profile grant (`profile_access`); roles viewer < editor < admin,
  effective role on a profile = max of the two (`src/lib/rbac.ts`, `src/lib/workspaces.ts`).
  Transaction/profile reads scope to accessible profiles in the *current* workspace
  (`user_settings.last_workspace_id`, `X-Workspace-Id` header on the API); `transactions.user_id`
  is attribution, not access. Categories are **per-workspace** (shared by every member;
  `categories.workspace_id`, seeded from `DEFAULT_CATEGORIES` when a workspace is created);
  reads need workspace access, writes need the editor role. Member invites go through ZeptoMail
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
  Driver is **node-postgres** (`drizzle-orm/node-postgres`). In the deployed Worker it connects
  through the Cloudflare **Hyperdrive** binding (`env.HYPERDRIVE`, defined in `wrangler.toml`),
  which pools warm connections to Neon; the in-Worker pool is created **per request** (keyed on the
  execution context) because Workers forbid reusing a socket across requests. Everywhere else (local
  `next dev`, tests, `drizzle-kit` migrations) it falls back to a direct Neon connection via
  `NEON_POSTGRES_DATABASE_URL`. Hyperdrive **query caching is disabled** (create the config with
  `--caching-disabled`) so a just-written balance is never served stale. `[placement] mode = "smart"`
  co-locates the Worker with Neon's region to cut round-trip latency.
- Keep the design minimal and neutral (no gradients); income uses a single emerald accent.

## Logging — the message is prose, the slug goes in `event`
Logs ship to BetterStack (`src/lib/logger.ts`), whose list view shows **only the
`message` field**. So `message` MUST be a sentence that reads on its own — the
whole point is to scan the list without clicking into every row. The stable
machine-readable name goes in `event`:

```ts
logger.info(`Action ${action} succeeded in ${durationMs}ms`, {
  event: "action.ok",        // filter/chart on this — event:"action.ok"
  action,
  durationMs,
});
```

**Never pass a slug as the message** (`logger.info("db.write", { op })`) — it
renders as a wall of identical `db.write` rows. Keeping the slug in `event` also
means filters and dashboards survive a reworded message.

- Write the message at the level's altitude: `warn`/`error` messages should say
  what went wrong (`` `Email to ${to} failed with status ${res.status}` ``),
  since those are what you scan for.
- Use `describeError(err)` from `@/lib/logger` to interpolate a thrown value —
  it stringifies non-Errors so a raw object can't spill internals into the text.
- **Keep user data out of the message.** It's interpolated free text: no notes,
  amounts, names, or raw emails (redact with `redactEmail()`). Ids and
  structured values belong in `meta`, which is normalized and scrubbed.

**Every log automatically carries the request identity** — `requestId`,
`platform`, `userId`, `workspaceId`, `profileId` — merged in from a per-request
`AsyncLocalStorage` context (`src/lib/log-context.ts`). You never pass these by
hand; they're always present (null outside a request or before auth resolves).
The context is established at the two entry seams — `handle()` for the REST API
and `runAction()` for server actions (`withRequestContext` in
`src/lib/request-context.ts`) — and enriched as identity is resolved
(`getApiContext` stamps user+workspace; the transaction service stamps the
resolved `profileId`; `runAction` seeds from the action's `meta`). If you add a
new request entry point outside those seams, wrap it in `withRequestContext(...)`
so its logs aren't identity-less. `requestId` is Cloudflare's `cf-ray` in prod
(a generated uuid in dev); `platform` comes from the `X-Client-Platform` header
(`web` for server actions, `api` when a mobile request omits it) — documented in
the mobile API contract (`_developer/flutter/*`), so a change there follows the
API-docs lockstep rule below.

## SEO — every new public page must be indexable
**Every new page under `(marketing)` (or any other publicly reachable route) MUST
export metadata built with `createMetadata()` from `src/lib/seo.ts`:**

```ts
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Features",          // no site name — the root template appends " — SpendChat"
  description: "50–160 chars; this is the Google snippet and the chat preview subtitle.",
  path: "/features",          // REQUIRED — sets the canonical URL
});
```

Never hand-write a bare `Metadata` object for a public page. **Metadata is
inherited in Next**, so a page that omits `alternates` silently inherits the root
layout's `canonical: "/"` and tells Google it's a duplicate of the homepage —
which deindexes it. Omitting `openGraph.url` likewise makes the page report the
homepage as its `og:url`. `createMetadata` takes `path` as a required argument so
neither can be forgotten. If a page needs extra `alternates` (e.g. an RSS feed),
**spread** the result and merge — don't replace `alternates` wholesale, or you
drop the canonical (see `(marketing)/blog/page.tsx`).

Also for each new public page:
- **Add it to `src/app/sitemap.ts`** — it isn't automatic. Give it a sensible
  `priority`/`changeFrequency`. Private/auth routes instead go in the `disallow`
  list in `src/app/robots.ts`.
- **One `<h1>` per page**, matching the page's search intent; use real heading
  levels rather than styled `<div>`s.
- Add **JSON-LD** via `<JsonLd data={...} />` (`src/components/json-ld.tsx`) when a
  schema.org type genuinely fits (`FAQPage`, `BlogPosting`, `WebApplication`, …).
  Don't mark up content that isn't visible on the page — Google treats that as spam.
- Use `noIndex: true` for pages that shouldn't rank (thank-you, gated pages).

**Social/chat previews (WhatsApp, Telegram, X, Slack)** come from the branded
`public/opengraph-image.png` (1200×630), declared once as `ogImage` in
`src/lib/seo.ts` and used by both `createMetadata` and the root layout. Pages get
it automatically: `createMetadata` sets it, and pages without their own
`openGraph` inherit the root layout's.

Three constraints to respect if you touch it:
- **Keep it a static PNG in `public/`.** Generating it with `next/og`/`ImageResponse`
  makes OpenNext bundle `@vercel/og` + `resvg.wasm` (~2.2 MB) into the Worker, and
  Next's `opengraph-image` file convention serves it from a route handler (a Worker
  invocation) instead of straight off Cloudflare's CDN.
- **Always restate `images` when you define `openGraph` on a page.** Next replaces
  `openGraph` per segment rather than deep-merging it, so a page that defines
  `openGraph` without `images` ships with **no preview image at all** — it fails
  silently, and only a crawler or `curl | grep og:image` will tell you.
- **Keep it under ~300 KB**, or WhatsApp falls back to a small thumbnail.

Regenerate from `scripts/og-image.html` (the command is in its header comment).

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
