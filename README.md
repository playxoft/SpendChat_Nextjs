# MoneyTracker

A minimal, fast, and secure personal **money tracker** — add, view, filter, download, and print your income and expenses. Free to use.

🌐 **Live:** [moneytracker.playxoft.com](https://moneytracker.playxoft.com)

---

## ✨ Highlights

- **Effortless tracking** — add a transaction in seconds, see your balance instantly.
- **Powerful views** — filter by date, type, and category; search; sort.
- **Download & print** — export the current view to CSV or print/save as PDF.
- **Minimal & clean** — neutral palette, no noisy gradients, subtle motion.
- **Works everywhere** — responsive for mobile, tablet, and desktop, with light & dark mode.
- **Private & secure** — your data is scoped to your account and never shared.

## 🧱 Tech stack

| Layer | Choice |
|------|--------|
| Framework | [Next.js](https://nextjs.org) (App Router) + TypeScript |
| UI | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) |
| Hosting | Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) |
| Database | [Neon](https://neon.tech) Postgres (serverless HTTP driver) |
| ORM | Drizzle ORM + Drizzle Kit |
| Auth | Neon Auth ([`@neondatabase/auth`](https://neon.com/docs/auth)) — email + password |
| Secrets | [Doppler](https://doppler.com) |
| Validation | Zod + react-hook-form |

> Built for the Cloudflare Workers **free tier** (3 MB bundle, 10 ms CPU/request) — the architecture deliberately keeps server work lean.

## 🚀 Getting started

### Prerequisites
- Node.js ≥ 20 and **pnpm**
- **Doppler** CLI (`brew install dopplerhq/cli/doppler`) — provides all secrets
- A **Neon** project (Postgres + Neon Auth enabled)
- **Wrangler** (installed as a dev dependency)

### Setup
```bash
# 1. Install dependencies
pnpm install

# 2. Log in & select the Doppler project/config
doppler login
doppler setup            # choose project: moneytracker, config: dev

# 3. Apply database migrations (secrets injected by Doppler automatically)
pnpm db:migrate

# 4. Start the dev server
pnpm dev
```
App runs at http://localhost:3000.

> The `dev`, `build`, `start`, `preview`, `deploy`, and `db:*` scripts run through
> `doppler run` automatically, so secrets are injected for you — no need to prefix
> commands with `doppler run --`.

### Environment variables
Managed by **Doppler** — see [`.env.example`](./.env.example) for the full list. Never commit real values.

| Variable | Purpose |
|----------|---------|
| `NEON_POSTGRES_DATABASE_URL` | Neon Postgres connection string |
| `NEON_AUTH_BASE_URL` | Neon Auth URL (Neon console → Project → Auth → Configuration) |
| `NEON_AUTH_COOKIE_SECRET` | Session cookie signing secret (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO/sitemap |

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Local Next.js dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Build + run the Cloudflare Worker locally (OpenNext) |
| `pnpm deploy` | Build + deploy to Cloudflare Workers |
| `pnpm db:generate` | Generate Drizzle migrations from schema (no secrets) |
| `pnpm db:migrate` | Apply migrations to Neon |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check (no secrets) |

> Secret-injecting scripts use `doppler run` internally. `deploy` uses the Doppler
> `prd` config; everything else uses your selected config (e.g. `dev`).

## 🌍 Deployment

Deployed to **Cloudflare Workers** and served at `moneytracker.playxoft.com`.

```bash
pnpm deploy   # builds + deploys using the Doppler `prd` config
```
Production secrets live in the Doppler `prd` config; runtime secrets are also set on the Worker via `wrangler secret put`. See [`docs/CHECKLIST.md`](./docs/CHECKLIST.md) for the deploy steps.

## 🗂️ Project structure
```
src/
  app/
    (marketing)/        # static, SEO-first: landing, features, about, faq, privacy, terms
    (auth)/             # branded sign-in / sign-up (custom forms + server actions)
    (app)/              # authenticated shell: app (chat), transactions, analytics, settings
    api/auth/[...path]/ # Neon Auth handler
    api/transactions/export/  # CSV export route
    sitemap.ts · robots.ts · manifest.ts · layout.tsx
  actions/              # server actions: transactions, settings, categories
  components/
    ui/                 # shadcn/ui primitives
    marketing/          # header, footer, chat preview
    app/                # chat feed, composer, bulk add, table, filters, nav…
  db/                   # Drizzle schema, client, migrations
  lib/                  # auth helpers, neon-auth (server/client), money, queries, …
docs/
  CHECKLIST.md          # build checklist (source of truth)
```

## 🔒 Security

User data is scoped per account, all input is validated, queries are parameterized, and secrets are managed by Doppler. See the **Security & hardening** section of [`docs/CHECKLIST.md`](./docs/CHECKLIST.md).

## 📄 License

TBD.
