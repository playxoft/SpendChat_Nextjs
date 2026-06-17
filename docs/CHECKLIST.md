# MoneyTracker — Build Checklist

> Minimal, fast, secure personal money tracker with a **chat-app feel**.
> **Live domain:** `https://moneytracker.playxoft.com`
> **Hosting:** Cloudflare Workers (free tier — 3 MB bundle, 10 ms CPU/req) via `@opennextjs/cloudflare`.

Legend: `[x]` done · `[~]` partial · `[ ]` todo.

Status: **implementation complete** — pending live Neon/Doppler credentials and first deploy.

---

## 0. Decisions (locked in)

| Area | Decision |
|------|----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui — minimal neutral palette, **no gradients** |
| Theme | Light / dark / system toggle (`next-themes`) on marketing + app |
| App UX | **Chat-application style** — transaction bubbles + chat composer |
| Rendering | Full SSR via `@opennextjs/cloudflare` |
| Worker config | `wrangler.toml` |
| Database | Neon Postgres via Neon HTTP driver |
| ORM / migrations | Drizzle ORM + Drizzle Kit |
| Auth | Neon Auth (Stack Auth) — email + password |
| Currency | Single currency per user, app-wide, integer minor units |
| Secrets | Doppler |

---

## 1. Project scaffold & tooling
- [x] Next.js (App Router, TS, Tailwind, ESLint, `src/`, alias `@/*`) with pnpm
- [x] ESLint passing
- [x] shadcn/ui + base components
- [x] Neutral design tokens (light/dark), grayscale chart colors
- [x] `next-themes` provider + theme toggle

## 2. Cloudflare Workers + OpenNext
- [x] `@opennextjs/cloudflare` + `wrangler`
- [x] `wrangler.toml` (nodejs_compat, assets binding, custom-domain route)
- [x] `open-next.config.ts`
- [x] `initOpenNextCloudflareForDev()` in `next.config.ts`
- [x] Scripts: dev, build, preview, deploy, cf-typegen
- [x] Worker bundle builds and fits free tier (~2.64 MB gzip < 3 MB)
- [ ] Bind custom domain `moneytracker.playxoft.com` (at deploy time)

## 3. Secrets — Doppler
- [x] `doppler.yaml`
- [x] `.env.example` + `.dev.vars.example`
- [x] Dev + deploy flow documented (README)
- [ ] Live Doppler project populated with real secrets

## 4. Database — Neon Postgres + Drizzle
- [x] Neon serverless HTTP driver client (lazy)
- [x] Schema: `user_settings`, `categories`, `transactions`
- [x] Indexes: `(user_id, occurred_on DESC)`, `(user_id, category_id)`, `(user_id, type)`, `(user_id, created_at DESC)`, `categories (user_id, kind)`
- [x] FKs + `ON DELETE SET NULL`; default-category + settings bootstrap
- [x] Initial migration generated (`drizzle-kit generate`)
- [ ] Run migration against a live Neon database
- [ ] (Optional) Postgres RLS

## 5. Authentication — Neon Auth (Stack Auth)
- [x] `@stackframe/stack` provider scoped to auth/app/handler routes
- [x] Email + password sign-up / sign-in / reset (Stack components + handler)
- [x] Branded `/sign-in` + `/sign-up`
- [x] Route protection via app layout (`requireUser` redirect) + `getAppContext`
- [x] Sign-out (user menu)

## 6. Marketing site (SEO-first) — 6 pages
- [x] `/` landing (hero, features, steps, FAQ teaser, CTAs)
- [x] `/features`, `/about`, `/faq`, `/privacy`, `/terms`
- [x] Header (theme toggle, mobile menu) + footer
- [x] All copy written

## 7. App — chat-style tracker
- [x] `/app` chat feed (bubbles, day dividers, running balance, composer)
- [x] Bulk add (parse + preview + batch insert)
- [x] Add (with date) / edit / delete
- [x] `/transactions` table (filter, search, pagination)
- [x] `/analytics` (summary, category bars, 6-month trend)
- [x] `/settings` (currency, format, theme, categories, danger zone)
- [x] App shell: sidebar (desktop) / bottom nav (mobile) / topbar

## 8. View / Download / Print / Filter / Bulk
- [x] Shared filter bar (date range, type, category, search)
- [x] CSV download of the filtered set
- [x] Print layout (`print:hidden` chrome, print header)
- [x] Bulk add
- [x] Empty states + auto-scroll to newest

## 9. SEO & performance
- [x] `metadataBase`, per-page metadata + canonical
- [x] Open Graph + Twitter tags
- [x] `sitemap.ts` + `robots.ts` + `manifest.ts`
- [x] JSON-LD (WebApplication + FAQPage)
- [x] Semantic HTML, `lang`, marketing pages static
- [ ] Branded OG image asset (placeholder removed to keep bundle lean)
- [ ] Lighthouse pass on production

## 10. Security & hardening
- [x] Parameterized queries (Drizzle) + Zod validation
- [x] Every query scoped to the authenticated user
- [x] Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- [x] Mutations via server actions; secrets only via Doppler/Workers
- [~] CSP allows inline scripts/styles — tighten to nonce-based later
- [ ] Rate limiting on auth + writes (Cloudflare WAF/rules)

## 11. Accessibility & responsive
- [x] Keyboard-friendly, focus states, ARIA labels
- [x] Light/dark, mobile/tablet/desktop layouts
- [x] `prefers-reduced-motion` honored
- [ ] Manual a11y/device QA on production

## 12. Quality & DX
- [x] `tsc --noEmit` clean
- [x] ESLint clean
- [x] `next build` + OpenNext build succeed
- [x] README / CHANGELOG / CHECKLIST current
- [ ] Unit tests (money math, CSV, bulk parser, filters)

## 13. Deploy
- [ ] First deploy to Cloudflare Workers → `moneytracker.playxoft.com`
- [ ] Production Neon branch + Doppler `prd`
- [ ] Smoke test on a real device

---

### Out of scope (MVP) — future
Multi-currency per txn · multiple accounts · budgets · recurring · receipt uploads · bank import · OAuth/social · shared ledgers.
