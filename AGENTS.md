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
- **Every query is scoped to the authenticated user.** Reads live in `src/lib/queries.ts`,
  mutations in `src/actions/*` (server actions), both validated with Zod (`src/lib/validation.ts`).
- Auth: Neon Auth (`@neondatabase/auth`). Server instance in `src/lib/neon-auth.ts` (`auth`),
  browser client in `src/lib/neon-auth-client.ts`. Helpers `getCurrentUser()` / `requireUser()` /
  `getAppContext()` in `src/lib/auth.ts` wrap `auth.getSession()`. The API handler lives at
  `app/api/auth/[...path]`. Route protection is enforced in the `(app)` layout via `requireUser()`
  (no `proxy.ts`/middleware — OpenNext on Workers can't run Next 16's Node-only middleware).
- DB client is lazy via `getDb()` so env is read inside the request context (Workers-safe).
- Keep the design minimal and neutral (no gradients); income uses a single emerald accent.

## Git
- Write commit messages and PR bodies as a normal engineering project. Do **not** add AI
  attribution: no `Co-Authored-By: Claude …` trailer and no "Generated with Claude Code" line.
