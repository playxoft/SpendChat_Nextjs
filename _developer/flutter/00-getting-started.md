# 00 · Getting Started — Stack, Structure, Environment

The Flutter app is a **thin client** for the SpendChat Next.js backend. It talks
to the versioned REST API at `/api/v1` using a **Firebase ID token** as bearer
auth. No business logic or money math is reimplemented on the client beyond
display formatting.

---

## 1. Recommended stack

| Concern | Choice | Notes |
|---|---|---|
| State management | **Riverpod** (`flutter_riverpod` + `riverpod_annotation`/`riverpod_generator`) | Simple, testable. Bloc is fine if the team prefers it. |
| Networking | **dio** | Interceptors for bearer auth, `X-Workspace-Id`, envelope unwrap, error mapping, 401 refresh-and-retry. |
| Auth | **firebase_core**, **firebase_auth**, **google_sign_in** | Same Firebase project as the web app. Native Google flow (not web popup). |
| Routing | **go_router** | Declarative, auth redirects, deep links. |
| Models | **freezed** + **json_serializable** | ~8 core types; hand-writing is reasonable, or generate from `openapi.yaml`. |
| Charts | **fl_chart** | Pie chart for analytics. The monthly "trend" is a **custom dual-bar list**, not a chart (see 06). |
| Dates/format | **intl** | Currency formatting from minor units; date labels. |
| Drag reorder | Flutter's `ReorderableListView` or **flutter_reorderable_list** | Profile reorder. |
| Emoji input | a simple grid + text field (or **emoji_picker_flutter**) | Category/profile icons are emoji strings. |
| Secure storage | **flutter_secure_storage** *(optional)* | Not required for the token — Firebase persists the session itself. |
| CSV share | **share_plus** + **path_provider** | Save/share the exported CSV file. |
| Local prefs | **shared_preferences** | Remember last workspace id, composer entry mode (Manual/AI), theme override fallback. |
| Voice recording | **record** (or flutter_sound) | Hold-to-talk voice entry: record ≤ 60 s (AAC/M4A or Opus), multipart to `POST /ai/transcribe`. Optional grey live preview via **speech_to_text** (cosmetic only — the server transcript is what lands). |
| Attachments | **image_picker** + **file_picker**; **open_filex** (or a PDF/image viewer) | Pick camera/photo/file → multipart upload; open downloaded files. Thumbnails: fetch `/attachments/{id}/url?variant=thumb`. |

> **Theme override & Firebase both persist server-side.** The user's theme and
> input-mode live in `settings` on the server, so they follow the account across
> devices. Mirror them locally for instant startup, but the server is the source
> of truth.

---

## 2. Project structure

```
lib/
  main.dart                    # Firebase.initializeApp + runApp(ProviderScope(...))
  app.dart                     # MaterialApp.router + theme + go_router
  core/
    theme/
      app_colors.dart          # exact token palette (see 02) — light + dark
      app_theme.dart           # ThemeData light/dark from tokens
      app_text.dart            # Geist text styles, tabular-nums helper
      app_radius.dart          # radius scale (10 base; 14 xl; 18 2xl)
    config/
      env.dart                 # API base URL from --dart-define
    money.dart                 # minor<->major helpers (mirror src/lib/money.ts)
    dates.dart                 # day-divider labels, UTC date formatting (mirror src/lib/dates.ts)
    currencies.dart            # the 59-currency table (code, symbol, decimals)
    result.dart                # ApiResult / ApiException
  data/
    api_client.dart            # dio instance: envelope unwrap, error map, bearer + X-Workspace-Id
    auth/
      auth_repository.dart     # Firebase sign-in/up/verify/reset/sign-out
    models/                    # Transaction, Category, Profile, Settings, Summary, ...
    repositories/
      transactions_repository.dart
      categories_repository.dart
      profiles_repository.dart
      settings_repository.dart
      analytics_repository.dart
      workspaces_repository.dart   # list + current (from /me), X-Workspace-Id
      ai_repository.dart           # POST /ai/parse (text→drafts), POST /ai/transcribe (audio→text)
      attachments_repository.dart  # upload (multipart), patch/delete, presigned /url
  features/
    auth/                      # sign-in / sign-up / verify-email / forgot-password
    tracker/                   # chat feed + composer (the hero screen)
    transactions/             # list/table + filters + edit/detail dialog
    analytics/                 # summary + pie + monthly trend
    profiles/                  # switcher, create/edit, reorder, delete/move
    categories/                # manager (income + expense)
    settings/                  # account/currency/locale, theme, input, danger zone
    shell/                     # bottom nav, app bar, profile switcher
  routing/
    router.dart                # go_router + auth redirect
```

Keep **all design tokens in `core/theme/`** so the UI matches the web app exactly
and stays easy to tweak. Keep the **envelope unwrap in one place** (`api_client`).

---

## 3. Environment & configuration

Pass the API base URL at build/run time via `--dart-define`:

```bash
# Android emulator → host machine
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3010

# iOS simulator → host machine
flutter run --dart-define=API_BASE_URL=http://localhost:3010

# Physical device on the same LAN
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:3010

# Production
flutter run --dart-define=API_BASE_URL=https://<your-worker-domain>
```

- The Next.js **dev server runs on port `3010`** (`doppler run -- pnpm dev`).
- **Android emulator** reaches the host at **`10.0.2.2`**, not `localhost`.
- **iOS simulator** can use `localhost`.
- **Physical device:** use the machine's LAN IP and make sure the dev server is
  reachable on the network.
- **Cleartext HTTP** is only for local dev. Allow it in dev builds
  (Android `usesCleartextTraffic`, iOS ATS exception) but require **HTTPS in
  production**.

`core/config/env.dart` reads `String.fromEnvironment('API_BASE_URL')` with a
sensible default (e.g. the emulator host).

---

## 4. Firebase setup (native)

Auth is **Firebase Authentication** using the **same Firebase project** as the
web app. The API does not mint tokens — it verifies the Firebase ID token.

1. `flutterfire configure` (or add `google-services.json` for Android and
   `GoogleService-Info.plist` for iOS) for the SpendChat Firebase project.
2. Add packages: `firebase_core`, `firebase_auth`, `google_sign_in`.
3. `await Firebase.initializeApp(...)` in `main()` before `runApp`.
4. Enable **Email/Password** and **Google** sign-in providers in the Firebase
   console (they should already be on for the web app).
5. For Google on Android, add the app's SHA-1/SHA-256 fingerprints to the
   Firebase project; for iOS, add the reversed-client-id URL scheme.

The full auth flow (verify-email gating, token refresh, session) is in
[09-auth.md](./09-auth.md).

> The web app's Firebase config is a single JSON env var
> `NEXT_PUBLIC_FIREBASE_CONFIG` on the server; the API verifies tokens against
> that project's `projectId`. You do **not** need that env var in Flutter — you
> ship the native config files instead, but they must point at the **same
> project** so the `aud`/`iss` match.

---

## 5. How the app reaches the backend

Every `/api/v1` request carries two headers:

- `Authorization: Bearer <firebase-id-token>` — from
  `FirebaseAuth.instance.currentUser!.getIdToken()`.
- `X-Workspace-Id: <uuid>` — the current workspace (see
  [01-api-reference.md](./01-api-reference.md) § Workspaces). Omit it and the
  server falls back to the user's `lastWorkspaceId`.

Responses are a uniform envelope (`{ data, meta? }` / `{ error }`). The dio
client unwraps `data` on success and throws a typed `ApiException` on failure.
See [01-api-reference.md](./01-api-reference.md).

---

## 6. Suggested build phases (for driving Claude Code)

Drive the build one phase at a time; give Claude these docs + `openapi.yaml` as
context. After each phase run `flutter analyze` and a device smoke test.

1. **Scaffold + theme** — project structure (§2), `app_colors`/`app_theme`/
   `app_text` from [02](./02-design-system.md) exactly (light + dark, Geist,
   emerald income accent).
2. **Data layer** — `api_client` (envelope + errors + bearer + `X-Workspace-Id`
   + 401 refresh), `money.dart`, `currencies.dart`, models + repositories for
   every endpoint in `openapi.yaml`.
3. **Auth** — Firebase sign-in/up/verify/reset per [09](./09-auth.md); go_router
   redirects; gate on `emailVerified`.
4. **Shell + navigation** — bottom nav, app bar, profile switcher, routing
   ([03](./03-navigation-shell.md)).
5. **Tracker** — chat feed + composer ([04](./04-tracker-chat.md)); the hero.
6. **Transactions, Analytics** — one screen per prompt ([05](./05-transactions.md),
   [06](./06-analytics.md)).
7. **Profiles, Categories, Settings** — ([07](./07-profiles-and-categories.md),
   [08](./08-settings.md)).
8. **AI entry + voice** — the composer's Manual/AI toggle, parse → review →
   save, hold-to-talk mic, Settings → Voice languages
   ([04](./04-tracker-chat.md) §4.11, [08](./08-settings.md) §4a). Needs the
   server to have the AI models configured — handle 503 as feature-off.
9. **Attachments** — upload/view/delete on the transaction detail
   ([05](./05-transactions.md) §5a). Handle 503 as feature-off.
10. **Polish** — empty/loading/error states, pull-to-refresh, pagination,
    optimistic add, haptics, dark-mode QA ([11](./11-additional-details.md)).

Full checklist: [10-checklist.md](./10-checklist.md).
