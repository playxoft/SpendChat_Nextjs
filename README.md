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
| Auth | Neon Auth ([Stack Auth](https://stack-auth.com)) — email + password |
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

# 3. Apply database migrations
doppler run -- pnpm db:migrate

# 4. Start the dev server (secrets injected by Doppler)
doppler run -- pnpm dev
```
App runs at http://localhost:3000.

### Environment variables
Managed by **Doppler** — see [`.env.example`](./.env.example) for the full list. Never commit real values.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Neon Auth (Stack) project id |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Neon Auth publishable client key |
| `STACK_SECRET_SERVER_KEY` | Neon Auth secret server key |

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Local Next.js dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Build + run the Cloudflare Worker locally (OpenNext) |
| `pnpm deploy` | Build + deploy to Cloudflare Workers |
| `pnpm db:generate` | Generate Drizzle migrations from schema |
| `pnpm db:migrate` | Apply migrations to Neon |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check |

> Run any command needing secrets through `doppler run -- <cmd>`.

## 🌍 Deployment

Deployed to **Cloudflare Workers** and served at `moneytracker.playxoft.com`.

```bash
doppler run --config prd -- pnpm deploy
```
Production secrets live in the Doppler `prd` config and are synced to Cloudflare. See [`docs/CHECKLIST.md`](./docs/CHECKLIST.md) for the deploy steps.

## 🗂️ Project structure
```
src/
  app/
    (marketing)/        # static, SEO-first: landing, features, about, faq, privacy, terms
    (auth)/             # branded sign-in / sign-up (Stack Auth)
    (app)/              # authenticated shell: app (chat), transactions, analytics, settings
    handler/[...stack]/ # Stack Auth callback handler
    api/transactions/export/  # CSV export route
    sitemap.ts · robots.ts · manifest.ts · layout.tsx
  actions/              # server actions: transactions, settings, categories
  components/
    ui/                 # shadcn/ui primitives
    marketing/          # header, footer, chat preview
    app/                # chat feed, composer, bulk add, table, filters, nav…
  db/                   # Drizzle schema, client, migrations
  lib/                  # auth, money, currencies, validation, bulk parser, csv, dates, queries
  stack/                # Neon Auth (Stack) server app
docs/
  CHECKLIST.md          # build checklist (source of truth)
```

## 🔒 Security

User data is scoped per account, all input is validated, queries are parameterized, and secrets are managed by Doppler. See the **Security & hardening** section of [`docs/CHECKLIST.md`](./docs/CHECKLIST.md).

## 📄 License

TBD.
