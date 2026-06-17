# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Project setup**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui (neutral, minimal theme).
- **Cloudflare Workers** deployment via `@opennextjs/cloudflare` with `wrangler.toml`; verified the Worker bundle (~1.97 MB gzip) fits the free-tier 3 MB limit.
- **Light / dark / system** theme toggle (`next-themes`) on both the marketing site and the app.
- **Neon Postgres + Drizzle ORM**: indexed schema for `user_settings`, `categories`, and `transactions` (user-scoped composite indexes); initial migration generated.
- **Neon Auth (`@neondatabase/auth`)**: email + password sign-up and sign-in via custom branded forms + server actions; same-origin `/api/auth` handler; route protection enforced in the app layout via `requireUser()`.
- **Chat-style tracker** (`/app`): transactions as message bubbles with day dividers, a running monthly balance, and a chat composer for instant entry.
- **Bulk add**: paste many transactions (`amount, note, category, type, date`) with a live parsed preview before importing.
- **Transactions** (`/transactions`): filter by date range, type, category, and note search; pagination; CSV download; print-friendly layout.
- **Analytics** (`/analytics`): monthly income/expense/net summary, spending-by-category bars, and a 6-month trend.
- **Settings** (`/settings`): single app-wide currency, number format, theme, category management, and a danger zone to clear all transactions.
- **Marketing site** (6 pages): landing, features, about, FAQ, privacy, and terms — all with written copy.
- **SEO**: per-page metadata, canonical URLs, Open Graph/Twitter tags, `sitemap.xml`, `robots.txt`, web manifest, and JSON-LD (WebApplication + FAQPage).
- **Security**: strict headers (CSP, HSTS, X-Frame-Options, etc.), per-user query scoping, Zod-validated input, and Doppler-managed secrets.
- Money stored as integer minor units to avoid floating-point drift.

### Changed
- Removed the initial IntelliJ Java stub (`src/Main.java`, `.iml`, `.idea/`) in favor of the Next.js app.

### Notes
- Requires a Neon project (Postgres + Neon Auth) and Doppler-provided secrets to run. See `README.md`.
- Not yet done: connect a live Neon database + Doppler config, first deploy to `moneytracker.playxoft.com`, optional Postgres RLS, and unit tests.

[Unreleased]: https://moneytracker.playxoft.com
