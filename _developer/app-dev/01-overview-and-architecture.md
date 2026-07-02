# SpendChat Flutter App — Overview & Architecture

Build a native **Android + iOS** app for SpendChat (a chat-style money tracker)
on top of the existing Next.js backend. This doc is the entry point; see also:

- **[02-design-system-and-screens.md](./02-design-system-and-screens.md)** — theme + pixel-level screen specs (match the web app).
- **[03-features-and-checklist.md](./03-features-and-checklist.md)** — feature list mapped to the API + a phased build checklist.
- **API contract:** [`../api/openapi.yaml`](../api/openapi.yaml) and [`../api/README.md`](../api/README.md).

The Flutter app is a **thin client**: all data, rules, and money math live on the
server. The app renders, captures input, and calls `/api/v1`.

---

## 1. What we're building

A minimal, fast, private money tracker where you add income/expenses like
sending chat messages. Feature parity with the web app:

- **Tracker** — chat feed of transactions; a composer at the bottom to add one.
- **Transactions** — a filterable, paginated list/table with edit & delete.
- **Analytics** — summary + category pie chart + monthly trend, with filters.
- **Profiles** — WhatsApp-style "threads" (Personal, Work, …) that scope the data.
- **Categories** — per-user income/expense categories with emoji icons.
- **Settings** — currency, locale, theme, input layout, danger zone.
- **Auth** — email/password + Google, via Neon Auth.

Single currency per user. Money is integer **minor units** end-to-end.

---

## 2. Recommended stack

| Concern | Choice | Notes |
|---|---|---|
| State management | **Riverpod** (`flutter_riverpod` + `riverpod_generator`) | Simple, testable. Bloc is a fine alternative if the team prefers it. |
| Networking | **dio** | Interceptors for bearer auth + token refresh + error mapping. |
| Cookies (auth only) | **dio_cookie_manager** + **cookie_jar** | The `/api/auth/*` sign-in flow uses cookies; the `/api/v1` API uses bearer JWT. |
| Routing | **go_router** | Declarative, deep-link friendly, auth redirects. |
| Secure storage | **flutter_secure_storage** | Persist the session (for refresh) + last JWT. |
| Models | **freezed** + **json_serializable** | Or generate from `openapi.yaml` (see below). |
| Charts | **fl_chart** | Pie chart (analytics) + optional bar/line for the monthly trend. |
| Dates/format | **intl** | Currency formatting from minor units; date formatting. |
| Icons | **lucide_icons** (or Material Icons) | Web app uses Lucide; match icon choices. |
| Emoji | system font | Categories/profiles use emoji strings from the API — render as text. |

> Generating models from OpenAPI: `openapi-generator-cli generate -i _developer/api/openapi.yaml -g dart-dio -o lib/api_gen`. Because responses are wrapped in `{ "data": ... }`, either unwrap in a dio interceptor or generate the inner schemas and decode `body["data"]` yourself. Hand-writing `freezed` models for ~8 types is also very reasonable and gives more control.

---

## 3. Project structure

```
lib/
  main.dart
  app.dart                     # MaterialApp.router + theme + ProviderScope
  core/
    theme/
      app_colors.dart          # the exact token palette (see design doc)
      app_theme.dart           # ThemeData light/dark from tokens
      app_text.dart            # Geist text styles
    config/
      env.dart                 # base URL from --dart-define
    money.dart                 # minor<->major helpers (mirror src/lib/money.ts)
    result.dart                # ApiResult / ApiException
  data/
    api_client.dart            # dio instance, envelope unwrap, error mapping
    auth_repository.dart       # sign-in, token exchange, refresh, sign-out
    token_store.dart           # secure storage of JWT + session
    models/                    # Transaction, Category, Profile, Settings, ...
    repositories/
      transactions_repository.dart
      categories_repository.dart
      profiles_repository.dart
      settings_repository.dart
      analytics_repository.dart
  features/
    auth/                      # sign-in / sign-up / verify screens
    tracker/                   # chat feed + composer
    transactions/              # list/table + filters + edit dialog
    analytics/                 # summary + pie + trend
    profiles/                  # list, create/edit, reorder, delete/move
    settings/                  # settings form + danger zone
    shell/                     # bottom nav (mobile) / rail (tablet), app bar
  routing/
    router.dart                # go_router + auth redirect
```

Keep the **design tokens in one file** (`app_colors.dart`) so the UI matches the
web app exactly and stays easy to tweak.

---

## 4. API integration

Base path is **`/api/v1`**. One JSON envelope everywhere:

```
success → { "data": <payload>, "meta"?: { ... } }
failure → { "error": { "code", "message", "details"? } }
```

**`api_client.dart` responsibilities**

1. Attach `Authorization: Bearer <jwt>` to every `/api/v1` request.
2. On a `2xx`, return `response.data["data"]` (and `["meta"]` where needed).
3. On a non-2xx, throw an `ApiException(status, code, message, details)` built
   from `error`.
4. On `401` with an expired/invalid token, run the refresh flow once (§5) and
   retry the request; if refresh fails, emit a sign-out event.

Map endpoints → repositories exactly as in `openapi.yaml`. Money: keep
`amountMinor` (int) as the source of truth; use `amount` (string) for display or
format `amountMinor` yourself with `meta.currency.decimals` (see `money.dart`).

---

## 5. Auth flow (important)

The API verifies a **bearer JWT** minted by Neon Auth; it does not issue tokens
itself. The mobile flow:

1. **Sign in** against the auth endpoints (same origin, `/api/auth/*`) using a
   **cookie-aware** dio instance:
   - Email/password: `POST /api/auth/sign-in/email` `{ email, password }`.
     A brand-new account must verify its email first (see the verify screen).
   - Google: Neon Auth social sign-in via a browser/deep-link (`flutter_web_auth_2`),
     `POST /api/auth/sign-in/social` with `provider: "google"`. See the Neon Auth
     docs for the mobile redirect; treat as a later phase.
   Sign-in returns a session (as cookies) which the cookie jar stores.
2. **Exchange for a JWT:** `GET /api/auth/token` → `{ "token": "<jwt>" }`.
3. **Use the JWT** as `Authorization: Bearer <jwt>` for all `/api/v1` calls.

**Refresh:** JWTs are short-lived (~15 min). When a `/api/v1` call returns `401`
with `error.code == "unauthorized"`, call `GET /api/auth/token` again (the
session cookie outlives the JWT), store the new JWT, and retry once. If that
also fails, the session is gone → clear storage and route to sign-in.

**Storage:** keep the session cookie persisted (cookie_jar + secure storage) and
the current JWT in memory (optionally cached in secure storage). Never log tokens.

> Testing tip: `scripts/api-smoke.sh <base> <jwt>` on the server repo exercises
> every endpoint with a real token — handy to confirm the backend before wiring
> the app.

---

## 6. Configuration & environments

Pass the base URL at build/run time:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3010   # Android emulator → host
flutter run --dart-define=API_BASE_URL=http://localhost:3010  # iOS simulator
```

- Android emulator reaches the host machine at **`10.0.2.2`**, not `localhost`.
- Physical device: use the machine's LAN IP (e.g. `http://192.168.x.x:3010`) and
  ensure the dev server is reachable; the Next.js dev server runs on **port 3010**.
- Production: your deployed Worker/route domain (HTTPS).
- iOS ATS / Android cleartext: allow HTTP only for local dev builds; production is HTTPS.

---

## 7. Building this with Claude Code

Drive the build in the Flutter repo with Claude Code, one phase at a time. Give
it these three docs plus the OpenAPI spec as context. Suggested phase prompts:

1. **Scaffold + theme** — "Create the Flutter project structure from
   `01-overview` §3. Implement `app_colors.dart`, `app_theme.dart`, `app_text.dart`
   from `02-design-system` exactly (light + dark, Geist, emerald income accent)."
2. **API layer** — "Implement `api_client.dart` (envelope unwrap + error mapping
   + bearer auth + refresh per `01-overview` §4–5), `money.dart`, and the models +
   repositories for every endpoint in `../api/openapi.yaml`."
3. **Auth** — "Build sign-in / sign-up / verify-email using the flow in §5; wire
   `go_router` redirects; persist the session + JWT."
4. **Tracker** — "Build the chat feed + composer to match `02-design-system`
   (income bubbles left/emerald, expense right; sticky composer; type toggle;
   category chips; date + profile pickers)."
5. **Transactions, Analytics, Profiles, Settings** — one screen per prompt,
   following `02-design-system` and the `03` checklist.
6. **Polish** — empty/loading/error states, pull-to-refresh, pagination,
   optimistic add, haptics, dark mode QA.

Guidance for each prompt: keep tokens centralised, unwrap the `data` envelope in
one place, and verify against `openapi.yaml` (don't invent fields). After each
phase run `flutter analyze` and a quick device smoke test.
