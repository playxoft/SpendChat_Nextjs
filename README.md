# SpendChat

A minimal, fast, and secure personal **money tracker** — add, view, filter, download, and print your income and expenses. Free to use.

🌐 **App Link:** [spendchat.app](https://spendchat.app)

---

## ✨ Highlights

- **Effortless tracking** — add a transaction in seconds, see your balance instantly.
- **Profiles** — keep separate spaces (Personal, Company, Home…) and switch in one keystroke.
- **Keyboard-first** — jump anywhere (`T` `R` `A` `S`), add with `E`, search with `/`, send with `⌘/Ctrl + ↵`.
- **Powerful views** — filter by date, type, and category; search; sort.
- **Download & print** — export the current view to CSV or print/save as PDF.
- **Minimal & clean** — neutral palette, no noisy gradients, subtle motion.
- **Works everywhere** — responsive for mobile, tablet, and desktop, with light & dark mode.
- **Private & secure** — your data is scoped to your account and never shared.

## ⌨️ Keyboard shortcuts

Modifier keys adapt to your platform — `⌘` on macOS, `Ctrl` on Windows/Linux.
Single-key shortcuts fire only when you're not typing in a field.
You can also browse these any time in **Settings → Keyboard shortcuts**.

| Context | Shortcut | Action |
|---------|----------|--------|
| Navigation | `T` / `R` / `A` / `S` | Tracker / Transactions / Analytics / Settings |
| Actions | `E` | Add a transaction |
| Actions | `B` | Bulk add transactions |
| Actions | `/` | Focus search (where a search bar exists) |
| Tracker | `⌘/Ctrl + ↵` | Send the transaction |
| Tracker | `⇧ + ↵` | Jump to the description field |
| Tracker | `/` | Tag a category from the title field |
| Tracker | `⌘/Ctrl + E` | Switch between expense and income |
| Profiles | `` ⇧ + ` `` | Show all profiles |
| Profiles | `⇧ + 1…9`, `⇧ + 0` | Switch to a profile by position (0 = the 10th) |
| Global | `⌘/Ctrl + P` | Print the current page |

## 🧱 Tech stack

| Layer | Choice |
|------|--------|
| Framework | [Next.js](https://nextjs.org) (App Router) + TypeScript |
| UI | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) |
| Hosting | Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) |
| Database | [Neon](https://neon.tech) Postgres — node-postgres, via [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) in the Worker |
| ORM | Drizzle ORM + Drizzle Kit |
| Auth | [Firebase Authentication](https://firebase.google.com/docs/auth) — Google + email/password |
| Secrets | [Doppler](https://doppler.com) (optional — see below) |
| Validation | Zod + react-hook-form |

> Built for the Cloudflare Workers **free tier** (3 MB bundle, 10 ms CPU/request) — the architecture deliberately keeps server work lean.

## 🚀 Getting started

### Prerequisites
- Node.js ≥ 20 and **pnpm**
- A **Neon** project (Postgres) — the free tier is enough
- A **Firebase** project with Authentication enabled (Google and/or email+password)
- **Wrangler** (installed as a dev dependency) — only needed to deploy

### Setup

Copy the example environment file and fill in your own values:

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local env file and fill it in
cp .env.example .env.local

# 3. Apply database migrations
pnpm db:migrate:local

# 4. Start the dev server
pnpm dev:local
```

App runs at **http://localhost:3010**.

The `*:local` scripts read `.env.local` directly and need no extra tooling.
Use these if you're building on or contributing to SpendChat.

<details>
<summary><strong>Maintainers: using Doppler instead of <code>.env.local</code></strong></summary>

The unsuffixed `dev`, `build`, `start`, `preview`, `deploy:*`, and `db:*:dev` /
`db:*:prod` scripts wrap `doppler run` internally, so they **require the Doppler
CLI** and access to the project's Doppler config:

```bash
brew install dopplerhq/cli/doppler
doppler login
doppler setup            # project: spend-chat, config: dev
```

Doppler is the maintainers' secret store, not a requirement of the project —
everything it injects is documented in `.env.example`, and the `*:local` scripts
above cover the same ground from a plain file.

</details>

### Environment variables

Copy [`.env.example`](./.env.example) → `.env.local` and fill it in. Never commit real values.

| Variable | Purpose |
|----------|---------|
| `NEON_POSTGRES_DATABASE_URL` | Neon Postgres pooled connection string (`sslmode=require`) |
| `NEXT_PUBLIC_FIREBASE_CONFIG` | The whole Firebase **web config** as one JSON value (Firebase console → Project settings → General → Your apps → Web). Public by design — it's inlined into the client bundle |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO/sitemap |

`.env.example` documents the rest — logging (BetterStack), analytics, email
(ZeptoMail), R2 storage, and the AI model registries. Everything optional is
marked as such; an unset AI pair simply disables that feature.

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev:local` | Dev server on port 3010, reading `.env.local` |
| `pnpm build:local` | Production build, reading `.env.local` |
| `pnpm db:generate` | Generate Drizzle migrations from schema (no secrets) |
| `pnpm db:migrate:local` | Apply migrations, reading `.env.local` |
| `pnpm db:studio:local` | Open Drizzle Studio, reading `.env.local` |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check (no secrets) |
| `pnpm test` | Run the Vitest suite |

Maintainer (Doppler-backed) equivalents: `pnpm dev`, `pnpm build`, `pnpm preview`,
`pnpm deploy:dev` / `pnpm deploy:prod`, and `pnpm db:migrate:dev` /
`pnpm db:migrate:prod` / `pnpm db:studio:dev` / `pnpm db:studio:prod`.

> Every DB script names its environment explicitly — there is no bare default, so
> you can't apply a migration to the wrong database by forgetting a flag.

## 🌍 Deployment

Deployed to **Cloudflare Workers** and served at `spendchat.app`.

```bash
pnpm deploy:dev    # → beta.spendchat.app (Doppler `dev` config)
pnpm deploy:prod   # → spendchat.app      (Doppler `prd` config)
```

Production secrets live in the Doppler `prd` config; runtime secrets are also set on the Worker via `wrangler secret put`. See [`docs/CHECKLIST.md`](./docs/CHECKLIST.md) for the deploy steps.

> **Deploying a fork?** `wrangler.toml` hardcodes our routes (`spendchat.app`,
> `beta.spendchat.app`) and expects a [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
> binding. Replace or delete the `[[env.*.routes]]` blocks, and create your own
> Hyperdrive config with `--caching-disabled` (so a just-written balance is never
> served stale), or the deploy will fail on domains you don't own.

## 🗂️ Project structure
```
src/
  app/
    (marketing)/        # static, SEO-first: landing, features, about, faq, privacy, terms
    (auth)/             # branded sign-in / sign-up (custom forms + Firebase Web SDK)
    (app)/              # authenticated shell: app (chat), transactions, analytics, files, settings
    api/auth/session/   # Firebase ID token → httpOnly session cookie bridge
    api/v1/             # versioned REST API for the Flutter client
    api/transactions/export/  # CSV export route
    version/            # GET /version — deployed app + API version (public JSON)
    sitemap.ts · robots.ts · manifest.ts · layout.tsx
  actions/              # server actions (thin wrappers over src/services/*)
  services/             # shared business logic, used by both server actions and /api/v1
  components/
    ui/                 # shadcn/ui primitives
    marketing/          # header, footer, chat preview
    app/                # chat feed, composer, bulk add, table, filters, nav…
  db/                   # Drizzle schema, client, migrations
  lib/                  # auth + firebase helpers, identity, money, queries, rbac, …
docs/
  CHECKLIST.md          # build checklist (source of truth)
```

## 🔒 Security

User data is scoped per account, all input is validated with Zod, queries are parameterized via Drizzle, and secrets are never committed. Firebase ID tokens are verified statelessly against Google's JWKS and bridged to an httpOnly `__session` cookie.

Found a vulnerability? Please report it privately — see [`SECURITY.md`](./SECURITY.md), not a public issue.

## 📄 License

Licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0) — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Copyright © 2026 Playxoft.

> **Why AGPL?** AGPL-3.0 is a strong copyleft license: anyone who runs a modified
> version of SpendChat as a network service must make their source available
> under the same terms. This keeps the project and its improvements open.

> **Open core:** this repository is open source and stays that way. Playxoft also
> offers a commercial/SaaS product built on top of it. Contributions are accepted
> under a CLA — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). Features released here as
> open source are never paywalled or removed.
