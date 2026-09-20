# Run

Every command in this file is a shell fence, which Warp's markdown viewer renders
as a **runnable block with a Run button** — open this file in Warp (`Cmd-P` →
`docs/run.md`) and click instead of typing. Fences must be tagged `sh`, `shell`,
or `zsh`; Warp does **not** treat ```` ```bash ```` as runnable.

Every script below already wraps its own `doppler run`, so none of them need a
prefix.

## Dev

Local dev server on port 3010:

```sh
doppler run -- pnpm dev
```

Free port 3010 when a previous dev server is still holding it:

```sh
pnpm kill-port
```

## Quality gates — both must stay clean

```sh
pnpm typecheck
```

```sh
pnpm lint
```

```sh
pnpm test
```

```sh
pnpm test:cov
```

Type-check `.design-sync/`, which `typecheck` cannot see (TypeScript skips
dot-directories). Run before a design-system re-sync:

```sh
pnpm typecheck:design
```

## Database

Write migration SQL from the Drizzle schema (no DB connection):

```sh
pnpm db:generate
```

Apply migrations to the **dev** branch:

```sh
pnpm db:migrate:dev
```

Apply migrations to **prod** — reviewed, replayable history, the preferred path
for prd:

```sh
pnpm db:migrate:prod
```

Push the schema straight to dev, bypassing migration files (dev only):

```sh
pnpm db:push:dev
```

Open Drizzle Studio:

```sh
pnpm db:studio:dev
```

Storage headroom against Neon's hard `neon.max_cluster_size` cap, largest
tables, slowest statements. **This also deletes** `ai_usage_log` /
`email_send_log` rows older than 30 days:

```sh
pnpm db:health:dev
```

Same check, report only — no pruning:

```sh
pnpm db:health:dev -- --no-prune
```

```sh
pnpm db:health:prod -- --no-prune
```

## Growth

Read-only signup report: per day, per channel, per "how did you hear about us"
answer, with activation:

```sh
pnpm growth:report:dev
```

```sh
pnpm growth:report:prod
```

## Worker build and deploy

Build the OpenNext Worker and preview it locally:

```sh
pnpm preview
```

Build the Worker without deploying:

```sh
pnpm build:worker
```

Regenerate `cloudflare-env.d.ts` from `wrangler.toml`:

```sh
pnpm cf-typegen
```

Deploy to the beta Worker:

```sh
pnpm deploy:dev
```

Deploy to production. Run `/deployment-check` first:

```sh
pnpm deploy:prod
```
