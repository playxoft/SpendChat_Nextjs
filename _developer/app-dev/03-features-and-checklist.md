# SpendChat Flutter — Features & Build Checklist

Feature inventory mapped to the API, then a phased checklist to build the app.
Read alongside [01-overview](./01-overview-and-architecture.md),
[02-design-system](./02-design-system-and-screens.md), and
[`../api/openapi.yaml`](../api/openapi.yaml).

Status legend: `- [ ]` todo · `- [~]` in progress · `- [x]` done

---

## 1. Feature → API map

| Feature | Endpoint(s) |
|---|---|
| Sign in (email) | `POST /api/auth/sign-in/email` → `GET /api/auth/token` |
| Sign up + verify | `POST /api/auth/sign-up/email`; verify via email link |
| Google sign in | `POST /api/auth/sign-in/social` (webview/deep link) → `GET /api/auth/token` |
| Token refresh | `GET /api/auth/token` |
| Current user + settings | `GET /api/v1/me` |
| Tracker feed | `GET /api/v1/transactions?profile=&limit=&offset=` |
| Add transaction | `POST /api/v1/transactions` |
| Edit transaction | `PATCH /api/v1/transactions/{id}` (full body) |
| Delete transaction | `DELETE /api/v1/transactions/{id}` |
| Bulk add | `POST /api/v1/transactions/bulk` (`{ items: [...] }`) |
| CSV export | `GET /api/v1/transactions/export` |
| Delete all (danger) | `POST /api/v1/transactions/delete-all` (`{ confirm: "DELETE" }`) |
| List / manage categories | `GET/POST /api/v1/categories`, `PATCH/DELETE /api/v1/categories/{id}` |
| List / manage profiles | `GET/POST /api/v1/profiles`, `PATCH/DELETE /api/v1/profiles/{id}` |
| Reorder profiles | `POST /api/v1/profiles/reorder` (`{ ids: [...] }`) |
| Move a profile's txns | `POST /api/v1/profiles/{id}/move` (`{ toProfileId }`) |
| Get / update settings | `GET /api/v1/settings`, `PATCH /api/v1/settings` |
| Analytics summary | `GET /api/v1/analytics/summary` |
| Spend/earn by category | `GET /api/v1/analytics/categories?type=expense` |
| Monthly trend | `GET /api/v1/analytics/monthly?from=YYYY-MM-DD` |

Shared query params (list + analytics): `type`, `category`, `profile`, `from`,
`to`, `q`; list adds `limit` (≤500) / `offset`. `meta.total` on lists;
`meta.currency` on lists/analytics.

---

## 2. Build checklist

### Phase 0 — Project setup
- [ ] `flutter create`, set app id/name (SpendChat), min SDK (Android 24+, iOS 13+).
- [ ] Add deps: `flutter_riverpod`, `go_router`, `dio`, `dio_cookie_manager`,
      `cookie_jar`, `flutter_secure_storage`, `freezed`/`json_serializable`
      (dev: `build_runner`), `fl_chart`, `intl`, `lucide_icons` (or icons of choice),
      `flutter_web_auth_2` (Google, later).
- [ ] Add **Geist** + **Geist Mono** fonts (or `google_fonts`).
- [ ] `--dart-define=API_BASE_URL` wired into `core/config/env.dart`
      (emulator: `10.0.2.2:3010`, simulator: `localhost:3010`).
- [ ] `ProviderScope` + `MaterialApp.router` in `app.dart`.

### Phase 1 — Theme (match the web app)
- [ ] `app_colors.dart` with the exact light + dark tokens (design doc §1).
- [ ] `app_theme.dart` — Material 3 light & dark `ThemeData` from tokens; default **system**.
- [ ] `app_text.dart` — Geist text styles; **tabular** numerals for amounts.
- [ ] Rounded cards (~16–18px), 1px borders, subtle shadows, no gradients.
- [ ] Acceptance: a sample screen visually matches the web app in light + dark.

### Phase 2 — API + data layer
- [ ] `api_client.dart`: dio + bearer interceptor + **unwrap `data`** +
      map errors to `ApiException(status, code, message, details)`.
- [ ] `money.dart`: minor↔major + `formatMoney` (sign, decimals) per design §5.
- [ ] Models: `Transaction`, `Category`, `Profile`, `Settings`, `Summary`,
      `CategoryBreakdownItem`, `MonthlyPoint`, `ApiError` — fields exactly per
      `openapi.yaml` (or generate with `dart-dio`).
- [ ] Repositories for transactions / categories / profiles / settings / analytics.
- [ ] Acceptance: unit tests decode sample payloads; a debug call to `/me` works
      once auth exists.

### Phase 3 — Auth
- [ ] Cookie-aware dio for `/api/auth/*`; `token_store.dart` (secure storage).
- [ ] Email/password sign-in → `GET /api/auth/token` → store JWT + session.
- [ ] Sign-up + **verify-email** screen (explain verification requirement).
- [ ] **Refresh on 401**: re-fetch token once, retry; on failure → sign out.
- [ ] `go_router` redirect: unauthenticated → `/sign-in`; authenticated → `/app`.
- [ ] Sign out clears storage + cookies.
- [ ] (Later) Google sign-in via `flutter_web_auth_2` deep link.
- [ ] Acceptance: cold start restores session; expired JWT refreshes transparently.

### Phase 4 — Navigation shell
- [ ] Bottom nav (mobile): Tracker / Transactions / Analytics / Settings (design §3).
- [ ] App bar with the **profile switcher** (tap-to-switch dropdown on mobile).
- [ ] Active-profile state shared across tabs (Riverpod provider; mirrors `?profile=`).
- [ ] Acceptance: switching profile refilters all three data tabs.

### Phase 5 — Tracker (chat)
- [ ] Chat feed: day dividers, income **left/emerald**, expense **right**,
      avatar with category emoji, heading/amount/description/meta rows,
      rise animation, scroll-to-bottom on load.
- [ ] Tap bubble → **detail dialog** (view + edit + delete).
- [ ] Composer: type toggle pill, date picker (max today), category chip row,
      amount + title fields honoring **input mode**, optional description,
      full-width Send on mobile; validation + toasts; optimistic append.
- [ ] Add uses `POST /transactions`; refresh feed / reconcile.
- [ ] Acceptance: add income → left bubble; expense → right; edit & delete work.

### Phase 6 — Transactions
- [ ] Paginated list (cards mobile), newest first, `limit`/`offset` + `meta.total`.
- [ ] Filter bar: type, category, profile, date range, search (`q`).
- [ ] Row tap → detail dialog; edit (`PATCH`) + delete (`DELETE`).
- [ ] CSV export (`/transactions/export`) → save/share file.
- [ ] Acceptance: filters + pagination match the counts from analytics/summary.

### Phase 7 — Analytics
- [ ] Summary cards (income emerald, expense rose, balance) from `/analytics/summary`.
- [ ] Category **pie chart** (`fl_chart`, grayscale palette) from
      `/analytics/categories?type=`, with legend (emoji + name + amount + %).
- [ ] Monthly trend (bars/lines) from `/analytics/monthly?from=`.
- [ ] Shared filters incl. **date range**; empty states.
- [ ] Acceptance: totals reconcile with the transactions list for the same filters.

### Phase 8 — Profiles
- [ ] Manage screen/sheet: create (name + emoji + color), rename, change icon.
- [ ] Reorder (drag) → `/profiles/reorder`.
- [ ] Delete with the 409 rules; **move transactions** flow (`/profiles/{id}/move`)
      then delete; surface server messages.
- [ ] Acceptance: can't delete the last/non-empty profile; move-then-delete works.

### Phase 9 — Settings
- [ ] Currency / locale / theme (✓ on active) / input layout; **Save** enabled only
      when dirty; **Cancel** reverts; `PATCH /settings`.
- [ ] Categories manager (add/edit with emoji picker / delete).
- [ ] Danger zone: delete-all with `DELETE` confirmation.
- [ ] Account: email + sign out.
- [ ] Acceptance: changing currency reformats amounts app-wide; theme switch is instant.

### Phase 10 — Polish & QA
- [ ] Loading skeletons (feed, list, charts), empty states, error + retry.
- [ ] Pull-to-refresh; optimistic add; haptics on add/delete.
- [ ] Dark/light QA vs. web app; large-text & small-screen checks.
- [ ] Offline/timeout handling; never log tokens; secure storage verified.
- [ ] `flutter analyze` clean; widget tests for money formatting, envelope
      decoding, and the auth refresh interceptor.

---

## 3. Definition of done
- [ ] Feature parity with the web app for the 4 tabs + profiles + auth.
- [ ] Every screen matches the design tokens (colors, radius, type) in both themes.
- [ ] All data via `/api/v1`; money handled as minor units; single currency respected.
- [ ] Auth: sign-in, refresh, sign-out; verified-email path handled.
- [ ] Android + iOS run against local (`10.0.2.2:3010` / `localhost:3010`) and prod.
- [ ] `scripts/api-smoke.sh <base> <jwt>` (server repo) passes for the same account.

---

## 4. Gotchas
- **Base URL:** Android emulator → `10.0.2.2`, not `localhost`. Dev server is **:3010**.
- **Envelope:** always read `data` / `error`; don't decode the raw body.
- **Money:** never use floats for storage; keep `amountMinor` (int) as truth,
  format with `meta.currency.decimals`. Expenses show negative in the UI.
- **Update = full body:** `PATCH /transactions/{id}` needs the complete
  transaction (type, amount, occurredOn, …), like the web editor.
- **Unknown category/profile ids** on create are coerced (category→null,
  profile→default) — send ids you fetched from the API.
- **Email verification** is enforced: a fresh sign-up can't sign in until verified.
- **Ownership:** the API scopes everything to the token's user; a wrong id → 404.
