<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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
  it can gate a cron. **It also deletes** `ai_usage_log` / `email_send_log` /
  `split_rate_log` rows past `--retention-days` (default 30; `ai_usage_log` never below 62,
  since the monthly AI allowance is counted from it; `split_rate_log` never below 7) unless
  you pass `-- --no-prune`.
- `pnpm growth:report:dev` / `growth:report:prod` — read-only signup report:
  per day, per channel (`users.acquisition`, rules in `src/lib/attribution.ts`),
  per "how did you hear about us" answer, with activation (≥1 transaction).
- `pnpm preview` / `pnpm deploy:dev` / `pnpm deploy:prod` — Worker build / deploy
- **The Worker entry is `worker.ts`** (`wrangler.toml` `main`), wrapping OpenNext's generated
  `.open-next/worker.js` with what it doesn't generate: the daily cron's `scheduled()` (and
  Durable Object exports). Keep it thin and excluded from tsconfig — its runtime types and the
  generated file exist only after a build — and import only dependency-free `src/lib` modules
  into it: wrangler bundles it outside Next's `react-server` condition, where any
  `import "server-only"` throws at startup and takes the fetch handler down too. Cron jobs
  therefore run **through the app**: `scheduled()` calls the fetch handler in-process on a token-
  guarded internal route (`lib/cron-dispatch.ts`, `lib/cron-token.ts`,
  `app/api/internal/cron/*`), so they get Hyperdrive, `after()` log shipping and
  `withRequestContext` like any request. Each env's `vars` carries `APP_ORIGIN` for that request.
  Test a run locally with `wrangler dev --env beta --test-scheduled` and `curl /__scheduled`.

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
- **Organisations → workspaces → spaces → profiles, + RBAC.** Every user owns one personal
  organisation and a default workspace in it ("<name>'s Workspace", with a "Main" space and a
  "Personal" profile, created at bootstrap). Profiles live in spaces; spaces in workspaces.
  Roles viewer < editor < admin. Effective role on a profile (`resolveProfileRole` in
  `src/lib/rbac.ts`, the same rules in SQL in `accessibleProfileIds` /
  `getEffectiveProfileRole` in `src/lib/workspaces.ts` — keep them in step): workspace
  **admin** (`workspace_members.role`; the owner always is one) sees everything; otherwise a
  member's per-profile **override** (`profile_overrides`: none/read/write — it can *lower*
  access) decides; otherwise the higher of their **space role** (`space_members`, members
  only) and any legacy single-profile **grant** (`profile_access`, which only ever adds).
  Non-admin members see only the spaces they're in. In a single-table Drizzle select a raw
  `sql` field renders columns unqualified — build correlated subqueries with the query
  builder, never `` sql`(select … where x = ${table.col})` ``.
- **Plans are per workspace** (`workspaces.plan`: free | plus | pro). Every number a plan
  promises lives in `src/lib/plans.ts` (prices in `src/lib/pricing.ts`); the server checks
  them in `src/lib/entitlements.ts`, which throws 403 `plan_limit` (stable code + `details`
  for an upgrade prompt). Limits gate *adding* only — over a cap (after a downgrade) you
  keep everything and can't add more; nothing is ever deleted. They apply from the day plans
  ship — there is no grace period. The UI reads `getAddLimits` to show a limit *before* a
  create form is submitted. AI actions are a monthly allowance per workspace counted from
  `ai_usage_log.units`. Until billing exists, `pnpm plan:set:dev` changes a dev workspace's plan.
  Analytics' "Insights & trends" (`advancedAnalytics`, Plus+) is a read gate, not an add
  limit: `getAdvancedAnalytics` (`src/lib/insights-queries.ts`) asserts it before reading
  anything, the judgement maths (projection, unusual, recurring) is pure in `src/lib/insights.ts`,
  and Free sees the same section over `insights-sample.ts` numbers, locked.
  Transaction/profile reads scope to accessible profiles in the *current* workspace
  (`user_settings.last_workspace_id`, `X-Workspace-Id` header on the API); `transactions.user_id`
  is attribution, not access. Categories and tags are **per-workspace** (shared by every member;
  seeded from `DEFAULT_CATEGORIES` — 7 expense + 3 income — and `DEFAULT_TAGS` — 2 — when a
  workspace is created); reads need workspace access; adding needs edit access to some profile,
  renaming/deleting needs admin or edit access to every profile. Member invites go through ZeptoMail
  (`src/lib/email.ts`, `ZEPTOMAIL_TOKEN`/`MAIL_FROM_ADDRESS` in Doppler); unknown emails become
  `workspace_invites` rows — carrying a shared secret `token` — accepted at the invitee's first
  bootstrap *or* from the `/invite/<token>` join page (`acceptInviteByToken`), which binds
  acceptance to the invited email. Email bodies are built only in `src/lib/email-templates.ts`
  (pure, unit-tested, one shared layout: neutral, no images, plain-text twin); the one-time
  welcome email is claimed via `users.welcomed_at` in `src/lib/welcome-email.ts`. Split
  invites (`src/services/split-invites.ts`) email only people **without** an account, **once per
  group per address, ever** (claimed on `split_members.invite_emailed_at`), inside a per-sender
  daily cap and a per-inbox weekly cap (`reserveInviteEmails`, both in `split_rate_log` — **not**
  the shared hourly pool, whose 429 would expose who was emailed), only after the add itself
  succeeded; account holders get an in-app invitation instead. **Never let a response say
  whether an address has an account** — adds answer `invited` either way. ZeptoMail is
  transactional-only — don't add newsletters or drip campaigns to this pipe.
- **Split groups live outside workspaces.** `split_groups` and everything under them
  are user-scoped: no `workspace_id`, no plan (50 people per group, the creator included,
  on every plan — `SPLIT_GROUP_MAX_PEOPLE`), and nothing in them is a transaction. Each
  group has one currency; amounts are minor units in it, divided by `src/lib/split-math.ts`
  on the server (equal: leftovers to the payer first, then join order; percent: to the
  largest remainders first). Who may do what is
  `src/lib/split-access.ts`; only a *joined* member sees a group — everyone else gets
  404 — and members' emails are shown only to the group's creator. Member rows are never
  deleted while the group exists (leave/remove/decline = `left`), balances are always
  computed, never stored. Adds take the group row `FOR UPDATE` before counting. The
  only bridge into a workspace is "add my share", which writes one ordinary expense through
  `createTransactionId` (so budget checks fire) and links it on `split_shares.transaction_id`;
  "Update my entry" / "Remove from my workspace" go through `updateTransaction` /
  `deleteTransaction` (the trash). A trashed linked entry still counts as added.
- **Budgets** — monthly spending limits for the whole workspace, one space (its live profiles as
  they are now — a moved profile takes its month along), one profile, or one expense category
  (across every profile); one per scope, each with a title and an optional note; a space budget is
  deleted with its space; capped per plan (`PLAN_LIMITS.budgets`). Rules
  are pure in `src/lib/budgets.ts`, CRUD in `src/services/budgets.ts`. **Every budget number comes
  from `getMonthExpenseMatrix` (`src/lib/budget-spend.ts`)** — its one `where` decides which
  transactions count (expenses only, the calendar month of `occurred_on`, every profile of the
  workspace, trashed rows and trashed profiles excluded); never sum spending for a budget anywhere
  else. A budget is shown only to admins and people who can read **every** live profile it covers;
  a budget on a trashed profile is hidden from everyone (and not counted toward the plan) until the
  profile is restored. Managing it needs edit access to every covered profile. **Every
  transaction write that can raise spending calls `scheduleBudgetCheck` after it writes**
  (`src/services/budget-alerts.ts`; in the service layer, so web and API are both covered; trash
  restore calls it too) — a new write path must as well.
  The check runs after the response through `afterResponse` (`src/lib/defer.ts`: Next's `after()`,
  `ctx.waitUntil` on Workers) and claims each alert once per budget × threshold × month in
  `budget_alerts` (never deleted; it fires again only for a higher amount; a claim that didn't fit
  the pool or whose check failed before committing is retried, a failed send isn't). Alert emails
  come from the workspace's own monthly pool (`budgetAlertEmailsLeft`, `email-quota.ts`), filled
  claim by claim, never the writer's. In-app alerts are computed live — there is no
  notifications table. Put any other post-response DB work through `afterResponse` too.
- **Trash: every read excludes trashed rows.** `transactions`, `files`, `folders` and `profiles`
  carry `deleted_at` (`timestamptz(3)`): deleting a transaction, a profile, or (Plus/Pro) a file or
  folder moves it to the trash for `TRASH_DAYS` (30), and a daily cron purges it (`lib/trash-purge.ts`).
  "Live" has two halves: the **row** — `notTrashed(table)` from `lib/trash-scope.ts`, which
  `buildConditions` applies first for every transaction read — and its **profile** — the access
  layer (`accessibleProfileIds` / `getEffectiveProfileRole`) skips trashed profiles, which hides
  everything in them. A new read of one of these tables uses one of those, or carries a
  `// trash: <reason>` comment saying why it reads everything (the storage sum — trashed bytes count
  until purged, abuse rule C6 — destroy paths, sweeps); `tests/unit/trash-coverage.test.ts` fails
  otherwise, and `tests/integration/trash-reads.test.ts` runs every read in `queries.ts` against
  seeded trash. Attachments have no trash state of their own — always read it through the parent
  transaction. Keep the literal `deleted_at is null` in feed queries: the feed index is partial.
- **Rate limits are per person** (abuse rule C8; numbers in `RATE_LIMITS`, `src/lib/plans.ts`).
  Every authenticated request counts against one bucket — `create`, `read` or `ai` — over 1-,
  5- and 60-minute windows, judged by the plan of the workspace in context (with no workspace,
  the best plan among the person's workspaces). It's enforced at the two seams, so a new route
  needs nothing. **A new server action does need a bucket if it isn't a create:** a read-only
  action, or a write of the person's own UI prefs, passes `rateLimit: "read"` in its `runAction`
  meta; an AI call passes `"ai"`.
  - `runAction`: the bucket comes from `meta.rateLimit` (default `create`).
  - The REST API: the check runs in `getApiContext` / `requireApiUser`. `/api/v1/ai/*` → ai,
    `GET`/`HEAD` → read, else create.
  - A cookie-auth route handler outside both seams calls `rateLimitedResponse()`.
  - A heavy read can weigh more than one request: a CSV export counts as `EXPORT_WEIGHT` (20)
    reads, on the API (`rateOfApiRequest`) and the web route alike.
  - Over the limit: 429 `rate_limited`, with `Retry-After` on the API and
    `details.retryAfterSeconds` from an action.
  - The counts live in one SQLite-backed Durable Object per user (`src/lib/rate-limit/`). It's
    exported from the Worker entry **`worker.ts`** (`main` in wrangler.toml) and bound as
    `RATE_LIMITER` in each env, not at the top level, which `next dev` reads.
  - The limiter **fails open** when the binding is missing (`next dev`, tests), and when the
    object errors or is slow — **except for AI**, which then fails closed (429, retry in 5 s):
    nothing else bounds paid provider calls.
  - After a `wrangler.toml` change, run `pnpm cf-typegen`: `cloudflare-env.d.ts` is generated
    and gitignored, and typecheck needs the new binding types.
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
  voice→text, `AI_CHAT_MODEL(_CURRENT)` for Ask (questions answered in Markdown
  from a data summary, `src/lib/ai-chat.ts`). The pairs are **independent on
  purpose** and never fall back to one another: parsing runs on any chat model,
  transcription needs one that accepts audio (Anthropic has no speech model at all). Adding a feature means adding a
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
- **Ask** (`/app/ask`, `c`) answers questions about the workspace's money. The
  model never queries anything: `gatherChatData` (`src/services/ai-chat.ts`) builds
  a bounded summary through `src/lib/queries.ts` — so access scoping and the trash
  rule come for free — and it rides in the system prompt. One question = one AI
  action (`chargeAiChat`): refunded when the data read or the model call fails;
  a failed *save* after the model answered keeps the charge. Chats (`ai_chats` /
  `ai_chat_messages`) are **private to their author within a workspace** — admins
  can't open them; anything else is a 404. Asking needs edit access (it spends the
  workspace's shared AI actions). Removal from a workspace — `removeCollaborator`
  (Settings → Remove / Leave) and `removeMember`, both through `forgetAskChats` in
  `src/services/workspaces.ts` — deletes the person's chats there; **narrowing access does not** — a
  space, profile or role change keeps the chat history, answers included, built
  from what they could see at the time. Answers are untrusted Markdown: render
  them only through `AnswerMarkdown` (no HTML, no images, safe links that show
  their host). **No model, same page:** in local dev, tests and on beta
  (`sampleAnswersAllowed`: `NODE_ENV` isn't "production", or `APP_ENV` is exactly
  "beta") a question gets `buildSampleAnswer` — this month's numbers from the same
  data, stored with `units = 0`, never charged; anywhere else (an unset `APP_ENV`
  on a deployed Worker included) a plain "Couldn't answer right now" on that
  question. Never a "not set up" banner.
- Keep the design minimal and neutral (no gradients); income uses a single emerald accent.
  **One exception:** AI affordances (the composer's Manual/AI toggle, AI mode's
  primary actions and Ask's send button) use a blue→violet gradient, so "this calls a model" is visually
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
   **Dependency bumps don't count either** — a Dependabot PR that only moves
   `package.json` ranges and `pnpm-lock.yaml` ships no version, even when the
   upgrade changes rendered output (Next 16.3.4 re-enabling AVIF, lucide-react
   redrawing an icon). The line is who wrote the change: `CHANGELOG.md` is for
   decisions we made, and padding it with upstream patch notes is how it stops
   being read. A bump we take *deliberately* — adopting a new capability, or
   pulling a fix we were waiting on — is a change we made, and ships a version
   like anything else.
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
