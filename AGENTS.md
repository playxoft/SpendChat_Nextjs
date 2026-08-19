<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SpendChat — project notes

A minimal, chat-style money tracker. Next.js 16 (App Router) + TS + Tailwind v4 + shadcn/ui,
deployed to Cloudflare Workers via OpenNext. Neon Postgres (Drizzle), Firebase
Authentication, secrets via Doppler.

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
- `pnpm db:health:dev` / `db:health:prod` — storage headroom against Neon's hard
  `neon.max_cluster_size` cap (writes fail at the cap with no warning shoulder),
  largest tables, slowest statements. Exits 1 past `--warn-at` (default 80%), so
  it can gate a cron. **It also deletes** `ai_usage_log` / `email_send_log` rows
  past `--retention-days` (default 30) unless you pass `-- --no-prune`.
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
  or v4 ids for anything we mint — including `user_id`: `users.id` is our own uuidv7, and
  the provider's identifier is confined to `users.firebase_uid` (see the auth bullet).
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
- **Auth: Firebase Authentication** (Google + email/password). Sign-in happens in the browser
  via the Firebase Web SDK (`src/lib/firebase.ts`; config parsed from the single
  `NEXT_PUBLIC_FIREBASE_CONFIG` JSON env var in `firebase-config.ts`). The resulting **ID token**
  is bridged to an httpOnly `__session` cookie (plus `__refresh`) by `POST /api/auth/session`
  (`src/app/api/auth/session/route.ts`) so server components can read it. Tokens are verified
  **statelessly with `jose`** against Google's JWKS in `src/lib/firebase-verify.ts` — no
  `firebase-admin`, which is Node-only and unfit for Workers — pinning `alg=RS256`, issuer, and
  audience to the project. `src/lib/identity.ts` (`resolveUser`) is the **only** place a Firebase
  UID becomes an internal id: `users.firebase_uid` → our own `uuidv7` `users.id`, which is what
  every table stores. Helpers `getCurrentUser()` / `requireUser()` / `getAppContext()` live in
  `src/lib/auth.ts`; the mobile API takes the same ID token as `Authorization: Bearer` via
  `requireApiUser`. Route protection is enforced in the `(app)` layout via `requireUser()`
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
- **AI models are configured, never hard-coded.** No model id appears anywhere in
  `src/`. Each AI feature owns a pair of env vars — a JSON registry of named
  entries (`{model_id, api_key, provider?, base_url?}`) plus the name of the
  active one — resolved by `resolveModelFromEnv()` in `src/lib/ai-model-registry.ts`:
  `AI_PARSE_MODEL(_CURRENT)` for text→drafts, `AI_TRANSCRIBE_MODEL(_CURRENT)` for
  voice→text. The pairs are **independent on purpose** and never fall back to one
  another: parsing runs on any chat model, transcription needs one that accepts
  audio (Anthropic has no speech model at all). Adding a feature means adding a
  pair, an adapter in `ai-provider.ts` if the protocol is new, and the secret to
  the `wrangler.toml` list — unset simply disables that feature.
- **Voice entry** (`m`, held) records in the browser, transcribes server-side, and
  drops the text into the AI note for the user to check — it never creates
  transactions directly, so the existing parse→review→confirm path is unchanged
  and a misheard merchant is caught by a human. Audio is transcribed and
  discarded; nothing is stored. The languages the model is told to expect are a
  per-user setting (`user_settings.voice_languages`, Settings → Voice) and a
  *list*, because the transcription prompt can name several at once — that's what
  makes code-mixed speech work. Whisper-style hosts take a single language code,
  so the same list degrades to a vocabulary hint there; don't add a `language`
  parameter to that adapter, since pinning one language transliterates the rest.
- Keep the design minimal and neutral (no gradients); income uses a single emerald accent.
  **One exception:** AI affordances (the composer's Manual/AI toggle and AI mode's
  primary actions) use a blue→violet gradient, so "this calls a model" is visually
  distinct from ordinary entry. Don't extend it to anything else, and don't add a
  second gradient — if a new surface needs one, it reuses this one.

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
so its logs aren't identity-less — and because the same scope carries the
per-request read memo (`src/lib/request-cache.ts`), which is what stands in for
React's `cache()` everywhere outside an RSC render (React silently stops
memoizing there). `requestId` is Cloudflare's `cf-ray` in prod
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
  (OpenAPI 3.1). `info.version` is the API version. (An older `_developer/api/`
  spec used to sit alongside it; it was deleted — this is now the only spec.)
- **`_developer/flutter/01-api-reference.md`** — the human-readable contract
  (endpoint tables, models); its "API spec version" line mirrors the spec version.
- **`_developer/flutter/_changelog.md`** — per-version history of API changes.

**Whenever you change anything under `src/app/api/v1/**` (or the request/response
shape it serializes) — even a one-line tweak — you MUST, in the same change:**
1. **bump the version** in `openapi.yaml` (`info.version`), the "API spec
   version" line in `01-api-reference.md`, *and* `API_VERSION` in
   `src/lib/version.ts` (what `GET /version` reports). Semver-ish: **major** =
   breaking (removed/renamed/retyped field, changed status) → Flutter must
   change; **minor** = backward-compatible addition (new endpoint/optional
   field); **patch** = docs/clarification only.
2. **add a `_changelog.md` entry** (newest first) with the version, date, what
   changed, and a **Flutter impact** line.
3. **update `openapi.yaml` + `01-api-reference.md`** to match the new behaviour.

No API change ships without these three docs updated. If you're unsure whether a
change is "API-visible", it is if a mobile client could observe it (path, method,
status, headers, or JSON shape).

## Versioning — every user-visible change ships a version
The deployment answers **`GET /version`** (alias of `GET /api/v1/version`) with
what it is: app release, API contract version, environment, Worker build, and
links to both changelogs. For that answer to be worth anything, the version has
to move when the app moves.

**So every user-visible change MUST, in the same change:**
1. **bump `version` in `package.json`** — **patch** for a fix or an internal
   tweak someone could notice, **minor** for a new capability, **major** for a
   break. (Pure refactors, comments, and test-only edits don't count.)
2. **add that version's section to `CHANGELOG.md`** — a `## [x.y.z] — YYYY-MM-DD`
   heading directly under `## [Unreleased]`, with Keep-a-Changelog subsections
   (`Added` / `Changed` / `Fixed` / `Security`). Write for someone deciding
   whether to care, not a commit log.
3. **leave `/version` alone** — it reads `package.json`, so it updates itself.
   Only touch `src/lib/version.ts` to change the *shape* of the payload, which
   is an API change (see the mobile-API rule above) and bumps `API_VERSION` too.

`package.json` and `CHANGELOG.md` are the app release; `API_VERSION` /
`openapi.yaml` are the REST contract — **two independent versions**, bumped on
their own rules. A change can move one, the other, or both.

`tests/unit/version.test.ts` is the enforcement: it fails if `APP_VERSION`
disagrees with the newest `CHANGELOG.md` heading, or if `API_VERSION`, the spec,
the API reference, and `_changelog.md` drift apart. When it fails, it's telling
you which file you forgot — don't relax the test.

Keep `GET /version` itself as it is: the **only** endpoint with no bearer token
(a client must be able to read the contract version before it has one), no
per-user data, no DB, and nothing in the payload that isn't already public.

## Git
- Write commit messages and PR bodies as a normal engineering project. Do **not** add AI
  attribution: no `Co-Authored-By: Claude …` trailer and no "Generated with Claude Code" line.
