---
name: deployment-check
description: Pre-deployment preflight for SpendChat — run BEFORE `pnpm deploy:prod` (or `deploy:dev`). Read-only GO/NO-GO audit of git state, version + API-spec integrity, typecheck/lint/tests/worker build, Neon migration parity, schema drift, Doppler + Cloudflare Worker secrets, wrangler bindings, and API-docs lockstep — then verifies the deploy via GET /version. Use when the user says "deploy", "ship to prod", "release", "deployment check", or "/deployment-check".
---

# SpendChat deployment preflight

A production deploy of this app can break in ways that are silent, slow to
notice, and awkward to reverse: a missing Worker secret disables a feature
without erroring, a `NEXT_PUBLIC_*` built from the wrong Doppler config bakes
dev values into a prod bundle, and code that expects a migration you didn't
apply 500s on first request. This skill is the gate that catches those before
they ship.

## Prime directive — this skill is READ-ONLY

**Never, under any circumstances, run any of these while executing this skill:**

- `pnpm deploy:prod` / `pnpm deploy:dev` — deploying is the user's call, after the report
- `pnpm db:migrate:prod` / `db:push:prod` / `db:push:dev` — schema changes are a separate, explicitly-authorized action
- `wrangler secret put`, `wrangler delete`, any `wrangler` write
- anything that mutates git history or the remote

You **report**. The user **decides**. If a gate fails, say so and stop — do not
"fix it quickly and deploy anyway". Every command below is a read.

Run the gates in order and collect results; don't abort on the first failure —
the user wants the whole picture in one pass. End with the verdict block.

---

## How this app deploys (context you need to judge the checks)

- **Runtime:** Next.js 16 on Cloudflare Workers via OpenNext. Two **named**
  wrangler environments, `production` (worker `spendchat-production`,
  spendchat.app) and `beta` (worker `spendchat-beta`, beta.spendchat.app).
  **There is no deployable top-level env** — a bare `wrangler deploy` does not
  target prod. Always go through the pnpm scripts.
- **Secrets:** Doppler. Config `prd` → production, `dev` → beta *and* the Neon
  dev branch. (This project does **not** use Phase.dev; if that ever changes,
  Gate 5 is the only part that needs rewriting.)
- **Two secret surfaces, and this is the #1 source of prod surprises:**
  - `NEXT_PUBLIC_*` are **inlined at build time** from whichever Doppler config
    the build ran under. `deploy:prod` builds under `--config prd`, so building
    any other way and deploying that artifact ships wrong values.
  - Everything else is read **at runtime from the Worker's own secrets**, set
    per worker via `wrangler secret put`. Doppler having a value does **not**
    mean the Worker has it.
- **Database:** Neon Postgres, separate branches for dev and prd. In the Worker
  it connects through the **Hyperdrive** binding; migrations run from your
  machine via drizzle-kit. Hyperdrive query caching is disabled on purpose.
- **`keep_vars = true`** in wrangler.toml stops a deploy deleting
  dashboard-managed vars. Do not remove it.
- **CI runs lint + typecheck only** (`.github/workflows/ci.yml`, on PRs to
  master). It does **not** run tests, build the Worker, or check migrations —
  which is exactly why this skill exists.

---

## Gate 1 — Git & build provenance

```bash
git status --short && git branch --show-current
git fetch -q origin && git log --oneline -1 HEAD && git log --oneline -1 origin/master
git status -sb | head -1
```

**Blockers**
- Working tree not clean → you'd ship uncommitted or untracked code you can't
  reproduce later. (`deploy:prod` builds the *working tree*, not `HEAD`.)
- Not on `master`, or `HEAD` ≠ `origin/master` → what you deploy won't match
  what the repo says is released.
- Commit not pushed → nobody can reproduce or roll back to this build.

**Also check CI is green for the exact commit:**
```bash
gh run list --branch master --limit 3 --json headSha,conclusion,workflowName \
  --jq '.[] | "\(.workflowName) \(.conclusion) \(.headSha[0:7])"'
```
A `conclusion` other than `success` on the current `HEAD` sha is a blocker.

---

## Gate 2 — Version & API-contract integrity

Two independent versions move on their own rules (AGENTS.md § Versioning):
the **app release** (`package.json` + `CHANGELOG.md`) and the **REST contract**
(`API_VERSION` + `openapi.yaml` + `01-api-reference.md` + `_changelog.md`).

```bash
grep '"version"' package.json
grep 'API_VERSION =' src/lib/version.ts
grep -m1 '^## \[0' CHANGELOG.md
grep -m1 '^## 5' _developer/flutter/_changelog.md
grep -m1 'API spec version' _developer/flutter/01-api-reference.md
grep -m1 '^  version:' _developer/flutter/openapi.yaml
grep -m1 'currently spec' CHANGELOG.md
```

All app numbers must agree; all four API numbers must agree.

**The real enforcement is a test — run it rather than eyeballing:**
```bash
pnpm vitest run tests/unit/version.test.ts
```
It fails if `APP_VERSION` disagrees with the newest `CHANGELOG.md` heading, or
if the four API-version sources drift. **When it fails it is telling you which
file you forgot — never relax the test to get a deploy out.**

**Blockers**
- Version test red.
- `/api/v1/**` changed since the last release but `API_VERSION` didn't move:
  ```bash
  git diff --name-only $(git describe --tags --abbrev=0 2>/dev/null || echo origin/master~1)..HEAD -- src/app/api/v1 src/services
  ```
  Anything a mobile client can observe (path, method, status, header, JSON
  shape) requires the spec bump **and** a `_changelog.md` entry with a Flutter
  impact line.
- `CHANGELOG.md` has content under `## [Unreleased]` that belongs in this
  release — ship it under a version heading or the deploy reports a version
  that describes nothing.

---

## Gate 3 — Quality gates (what CI does not do)

```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expect: typecheck silent; lint 0 errors (2 pre-existing *warnings* in the
generated `cloudflare-env.d.ts` are known and fine); tests all passing.

**Then build the actual Worker bundle** — a Next build passing does not mean
the OpenNext/Workers build does (Node-only APIs, bundle size, `nodejs_compat`):
```bash
pnpm build:worker
```

**Blockers:** any failure. A red test on a money app is a stop, not a warning.

> If integration suites fail with `Hook timed out`, re-run the file alone before
> calling it a blocker — under heavy machine load the PGlite boot flakes. Say
> explicitly that you re-ran it, and what the isolated result was.

---

## Gate 4 — Database: migration parity and schema drift

**This gate decides deploy ordering.** Code that reads a new column must not
reach production before the migration that adds it.

### 4a. Is prod actually up to date?

Do **not** trust a report, a changelog, or an agent's summary — query the
database. Match `drizzle.__drizzle_migrations.created_at` against the journal's
`when` values; the counts alone can mislead.

```bash
python3 -c "
import json;e=json.load(open('src/db/migrations/meta/_journal.json'))['entries']
print('journal entries:',len(e))
for x in e[-3:]: print(' ',x['idx'],x['tag'],x['when'])"
```

```bash
doppler run --config prd -- node -e "
const {Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:process.env.NEON_POSTGRES_DATABASE_URL});
  await c.connect();
  console.log('host:', new URL(process.env.NEON_POSTGRES_DATABASE_URL).host);
  const m=await c.query('select count(*)::int n from drizzle.__drizzle_migrations');
  const l=await c.query('select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1');
  console.log('applied:', m.rows[0].n, '| newest created_at:', String(l.rows[0].created_at));
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)})" 2>&1 | grep -v Warning
```

**Confirm the host is the prod branch, not dev.** They are separate Neon
branches and the endpoint ids differ — if the two ever read the same host,
stop everything and tell the user.

- Applied count == journal length, and newest `created_at` == the last journal
  `when` → prod is current.
- Behind → **name the pending tags explicitly.** `drizzle-kit migrate` applies
  *every* pending migration, not just the one you have in mind:
  ```bash
  python3 -c "
  import json;e=json.load(open('src/db/migrations/meta/_journal.json'))['entries']
  print('pending after <PASTE newest created_at>:',[x['tag'] for x in e if x['when']>PASTE])"
  ```
  Report them and **stop** — applying to prod is a separate authorization.

### 4b. Does the schema match the code?

Uncommitted schema edits that were never turned into a migration are invisible
until runtime:
```bash
git status --short src/db/schema.ts src/db/migrations
pnpm db:generate   # SAFE: writes SQL files only, never touches a database
git status --short src/db/migrations
```
If `db:generate` produces a **new** migration file, the schema has drifted from
the migration history → blocker. Revert the generated file and tell the user;
do not invent a migration mid-deploy.

### 4c. Deploy ordering

- **Additive** (new nullable column, new table, new index, data backfill):
  migrate **first**, then deploy.
- **Destructive/renaming** (drop or rename a column the running code still
  reads): needs an expand→migrate→contract split across two deploys. If you
  see one in the pending set, flag it as a **hard blocker** for a single-step
  deploy.

---

## Gate 5 — Secrets: Doppler *and* the Worker (they are different)

Doppler holding a value proves nothing about the deployed Worker. Check both.

### 5a. Required runtime secrets — must exist on the **worker**

Derived from what the code actually reads:

| Secret | Missing ⇒ |
|---|---|
| `NEON_POSTGRES_DATABASE_URL` | fallback DB path breaks; **hard fail** |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | vault + attachments 503 |
| `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_API_URL`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | member invites silently never arrive |
| `BETTERSTACK_SOURCE_TOKEN`, `BETTERSTACK_INGESTING_HOST`, `LOG_LEVEL` | you are flying blind in prod |
| `AI_PARSE_MODEL`, `AI_PARSE_MODEL_CURRENT` | composer AI mode answers "not available" |
| `AI_TRANSCRIBE_MODEL`, `AI_TRANSCRIBE_MODEL_CURRENT` | hold-to-talk mic dies |

**The AI and mail ones fail *quietly*** — no error, just a feature that stopped
existing. That is why they are enumerated instead of "it deployed fine".

Values can live on a Worker in **two different forms**, and checking only one
gives a false reading:

```bash
# (a) secret_text entries only — returns [] if everything is stored as vars
npx wrangler secret list --env production

# (b) what the deployed version ACTUALLY has bound (names only — see warning)
npx wrangler deployments list --env production 2>&1 | grep -oE '[0-9a-f-]{36}' | head -1
npx wrangler versions view <VERSION_ID> --env production 2>&1 \
  | grep -oE 'env\.[A-Z0-9_]+' | sort -u
```

> **Never run `wrangler versions view` without that `grep`.** Plain-text
> Environment Variables are printed **with their values**, so an unfiltered run
> dumps live credentials into the transcript. The `grep -oE 'env\.[A-Z0-9_]+'`
> pipe keeps it to names. If you have already run it unfiltered, do not echo,
> quote, or summarise the values anywhere.

Reconcile (b) against the table above — (b) is the source of truth, because it
is the running Worker. Bindings are **per worker**: `spendchat-beta` having a
value says nothing about `spendchat-production`.

Also flag, as warnings rather than blockers:
- **Anything bound as a plain Environment Variable that should be a secret.**
  `wrangler secret list` returning `[]` while (b) shows credentials means they
  are stored as dashboard vars — readable in plaintext by anyone with dashboard
  or API read access, and printed by the command above. Recommend migrating
  each to `wrangler secret put`; note that `keep_vars = true` means a deploy
  will not clean up the old var, so it must be deleted on the dashboard after.
- **Bindings present on the Worker that no longer exist in the code** (compare
  (b) against the `process.env` grep in 5c). Stale auth/config values from a
  removed integration are dead weight and a standing disclosure risk.

### 5b. Build-time public vars — must be in Doppler `prd`

These are inlined into the client bundle at build time:
```bash
doppler secrets --config prd --only-names | grep -E 'NEXT_PUBLIC_|^AI_|^R2_|^ZEPTOMAIL|^MAIL_FROM|^BETTERSTACK|^NEON_'
```
`NEXT_PUBLIC_FIREBASE_CONFIG` and `NEXT_PUBLIC_SITE_URL` are the ones that
break login and canonical URLs if wrong. Confirm `NEXT_PUBLIC_SITE_URL` is the
production origin, not localhost or beta.

**Never print secret values.** Use `--only-names` / `secret list`. If you need
to compare a value, compare a hash or a host, as Gate 4a does.

### 5c. New secrets introduced by this release
```bash
git diff origin/master~1..HEAD -- src | grep -nE '\+.*process\.env\.[A-Z_]+' | head
```
Any newly-read env var must be in **both** Doppler `prd` and the Worker, and
added to the documented list in `wrangler.toml`'s trailing comment.

---

## Gate 6 — Cloudflare Worker configuration

```bash
git diff origin/master~1..HEAD -- wrangler.toml
grep -nE 'keep_vars|^\[env\.production|id = |binding = |pattern = |mode = ' wrangler.toml
```

**Blockers**
- `keep_vars = true` removed → the next deploy can wipe dashboard-managed vars
  and 500 the app.
- `[env.production.hyperdrive]` id changed/absent, or it points at the beta
  config id → prod would read the dev database. Verify the prod id is distinct
  from the beta id.
- Binding shape differing between `production` and `beta` (`HYPERDRIVE`,
  `ASSETS`, `CF_VERSION_METADATA`) → `cf-typegen` reads `--env production` and
  the generated types drift.
- `routes` custom domain changed unintentionally.
- `compatibility_date` / `compatibility_flags` changed without a deliberate
  reason (`nodejs_compat` and `global_fetch_strictly_public` are both load-bearing).

If Hyperdrive was recreated, confirm it was created `--caching-disabled` — a
cached read can serve a stale balance right after a write.

---

## Gate 7 — API-docs lockstep (only if `/api/v1` changed)

```bash
git diff --name-only origin/master~1..HEAD -- src/app/api/v1 _developer/flutter
```
If `src/app/api/v1/**` changed, all three of `openapi.yaml`,
`01-api-reference.md` and `_changelog.md` must have changed too, and the
`_changelog.md` entry must carry a **Flutter impact** line. Missing docs are a
blocker: the mobile client is a real consumer that cannot read your diff.

---

## Gate 8 — Verdict

Report exactly this shape, with real evidence per line:

```
DEPLOYMENT PREFLIGHT — <env> — <short sha> — app <x.y.z> / spec <a.b.c>

  ✅ 1 Git & provenance   clean, master, synced, CI green (<sha>)
  ✅ 2 Versions           app 0.5.0 ↔ CHANGELOG; spec 5.9.0 ↔ 4 sources; version test passing
  ✅ 3 Quality            typecheck ✓  lint 0 errors  tests 651 ✓  worker build ✓
  ❌ 4 Database           prod at 27/28 — PENDING: 0027_attachment_profile_backfill
  ✅ 5 Secrets            17/17 worker secrets present; NEXT_PUBLIC_SITE_URL = https://spendchat.app
  ✅ 6 Cloudflare         keep_vars on; prod hyperdrive id distinct from beta; bindings aligned
  ✅ 7 API docs           n/a — no /api/v1 changes

VERDICT: NO-GO — 1 blocker
  → Apply 0027 to prod first (`pnpm db:migrate:prod`), then re-run this check.
     Additive/data-only, so migrate-then-deploy is the correct order.
```

**GO only when every gate passes.** One blocker ⇒ NO-GO, with the specific
remedy and who must authorize it. Never soften a blocker into a warning to let
a deploy proceed.

---

## Gate 9 — After the user deploys (verification, not optional)

The deploy isn't done when the command exits — it's done when the running
Worker says it is.

```bash
curl -s -w '\nHTTP %{http_code}\n' https://spendchat.app/version | tail -20
```
If this returns **HTML or a 404**, the running Worker predates the `/version`
route (added in app 0.2.0) — which means the deploy did not take, or prod is
older than you think. Treat it as a failed verification, not a quirk.

Otherwise confirm:
- `version` == the `package.json` you just shipped
- `apiVersion` == `API_VERSION`
- `environment` == `"production"`
- `build` is non-null and newer than before (from `CF_VERSION_METADATA`; it is
  `null` until the first deploy that includes the binding)

Then smoke the paths most likely to be broken by *this* release:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://spendchat.app/
curl -s -o /dev/null -w '%{http_code}\n' https://spendchat.app/api/v1/version
```
And watch live logs for the first minute:
```bash
npx wrangler tail --env production --format pretty
```
Look for `db.` errors (a missed migration), `r2.` warnings (missing/wrong R2
secrets), and `*.bad_config` (a missing AI pair).

**Rollback:** Cloudflare keeps prior Worker versions — roll back in the
dashboard (Workers → spendchat-production → Deployments) or with
`npx wrangler rollback --env production`. Note the limit that matters: **a
rollback does not undo a database migration.** If the release included a
destructive migration, rolling the Worker back leaves old code against a new
schema — which is why Gate 4c refuses to ship those in one step.

---

## Beta first

`beta.spendchat.app` runs the same Worker shape against the dev Neon branch.
For anything touching the database, storage, or auth, recommend
`pnpm deploy:dev` and a pass over beta before prod. It is the only place these
gates can be validated end-to-end without production data.
