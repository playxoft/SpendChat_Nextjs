# 01 · API Reference (`/api/v1`)

The mobile app talks to the **same Next.js app** as the web UI, over a versioned
REST API at **`/api/v1`**. This doc is the human-readable contract; the
machine-readable spec is **[openapi.yaml](./openapi.yaml)** (OpenAPI 3.1) — you
can generate Dart models from it. **Where they differ, this doc reflects the
actual server code.**

**API spec version: 5.1.0.** Every API change bumps this version and is logged
in **[_changelog.md](./_changelog.md)** — check it to see what the Flutter app
needs to update.

- **Base URL (dev):** `http://localhost:3010` (Android emulator: `http://10.0.2.2:3010`)
- **Base URL (prod):** your Worker/route domain (HTTPS)
- **Auth:** `Authorization: Bearer <firebase-id-token>`
- **Workspace:** `X-Workspace-Id: <uuid>` (optional; see § Workspaces)
- **Platform:** `X-Client-Platform: android | ios` (optional telemetry; send it on
  every request so server logs attribute the platform. It never changes a
  response — omitting it just logs the platform as `api`.)
- **Content type:** `application/json` (CSV export is `text/csv`)
- Every JSON response sets `Cache-Control: no-store`.

---

## 1. Response envelope

Every JSON response uses one of two shapes:

```jsonc
// success
{ "data": <payload> }
{ "data": <payload>, "meta": { ... } }   // lists + analytics add meta

// failure
{ "error": { "code": "validation_error", "message": "…", "details"?: { "field": "…" } } }
```

- Branch on the **HTTP status**, then read `error.code` for the machine reason,
  `error.message` for display, and `error.details` (a flat `{ field → message }`
  map) for form validation. Only the **first** issue per field is included.
- Unwrap `data` in **one place** (a dio interceptor / response layer). Analytics
  and list endpoints also return `meta` — surface both.

### Error codes → HTTP status

| `error.code` | HTTP | When |
|---|---|---|
| `bad_request` | 400 | Malformed JSON body; wrong confirm string |
| `unauthorized` | 401 | Missing/invalid/expired bearer token |
| `forbidden` | 403 | Email not verified; RBAC role too low; no writable profile |
| `not_found` | 404 | Resource / workspace / profile not accessible to the caller |
| `conflict` | 409 | Duplicate name; last profile; non-empty profile delete; email already registered with a different sign-in method (unverified email only — see § Authentication) |
| `validation_error` | 422 | Zod validation failed (`details` = field→message) |
| `internal_error` | 500 | Unhandled server error (generic message; no internals leaked) |

> **`forbidden` (403)** and the `workspace` object on `/me` are **not** in the
> older `openapi.yaml`. The corrected [openapi.yaml](./openapi.yaml) in this
> folder includes them.

### Important RBAC distinction

- **404 `not_found`** = you have *no* access to that resource/workspace/profile.
- **403 `forbidden`** = you *can see it* but your role is too low for the action.

The client should treat these differently: 404 → "not found / no access", 403 →
"you don't have permission" (and hide the action for viewers).

---

## 2. Authentication

Auth is **Firebase Authentication**. The API verifies the **Firebase ID token**
(RS256) statelessly with `jose` against Google's public JWKS — it does not mint
tokens.

- Header: `Authorization: Bearer <idToken>` on **every** `/api/v1` request.
  Matched case-insensitively as `Bearer <token>`.
- Verification pins: `issuer = https://securetoken.google.com/<projectId>`,
  `audience = <projectId>`, algorithm `RS256`, and requires a `sub` (Firebase
  UID) claim. JWKS:
  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`.
- **401** `unauthorized` — missing token ("Missing bearer token") or any
  verification failure ("Invalid or expired token: …").
- **403** `forbidden` "Email not verified" — when the token carries an email
  without `email_verified: true` (fail-closed: a missing claim is rejected too;
  Google accounts are always verified). **Gate the app on `user.emailVerified`
  before calling the API.**
- The server maps the Firebase UID → an internal `uuidv7` user id on first sight
  (bootstrap). The client never sees the internal id except as `user.id` in
  `/me`.
- **Account linking:** a new Firebase account whose **verified** email already
  belongs to an existing SpendChat account is linked to that account (same
  data — e.g. Google sign-in after an email/password sign-up). If the email is
  **unverified**, every request returns **409** `conflict` "This email is
  already registered with a different sign-in method".

**Token lifecycle (Flutter):** ID tokens last ~1 hour; the SDK refreshes
automatically. Attach `await user.getIdToken()` per request. On a **401**, call
`user.getIdToken(true)` (force refresh) and retry **once**; if it still fails,
sign out. Listen to `idTokenChanges()` to react to sign-out. No manual token
storage is needed — Firebase persists the session.

---

## 3. Workspaces & the `X-Workspace-Id` header

Profiles live in **workspaces**. Reads are scoped to the profiles you can access
**in the current workspace** (not to `transactions.user_id`, which is only
attribution).

- Send **`X-Workspace-Id: <uuid>`** to pick the workspace. Endpoints that honour
  it: `/me`, **all** `transactions` endpoints (list/create/bulk/export,
  single-item get/patch/delete, delete-all), `analytics/*`, `profiles`
  list/create/reorder. Single-transaction ops are scoped to the current
  workspace: an id from another of the user's workspaces is a **404**.
  (Profile item-level mutations resolve access by profile role instead.)
- **If absent:** the server uses the user's `lastWorkspaceId`, else their first
  accessible workspace. Bootstrap guarantees ≥1.
- **Unknown / inaccessible id → 404** `not_found` "Workspace not found".
- The **current workspace** (id, name, role) is returned by `GET /me` under
  `data.workspace`.
- **List every workspace** the user can open with **`GET /workspaces`** (for a
  switcher). It ignores `X-Workspace-Id` and never 404s. To switch: send the
  chosen id as `X-Workspace-Id` on subsequent requests and re-fetch `/me` — the
  server persists it as `lastWorkspaceId`.
- **Create a workspace** with **`POST /workspaces`** `{ name }` — the caller
  becomes its **admin** and a default "Personal" profile is seeded. The server
  makes it the current workspace (persists `lastWorkspaceId`); pin the returned
  id as `X-Workspace-Id` and re-fetch `/me` + data.

`role` is `viewer | editor | admin | null` (null = access via a per-profile grant
only). See [08-settings.md](./08-settings.md) § Workspaces for RBAC and what's in
scope for a v1 mobile app.

---

## 4. Money

Amounts are **integer minor units** (`amountMinor`, e.g. cents) — the source of
truth. Each transaction also returns `amount`, a major-unit **string** formatted
to the currency's decimals (e.g. `"12.50"`).

- A **workspace** has a **single currency** (shared by every member). List/
  analytics responses include `meta.currency` = `{ code, symbol, decimals }`;
  the `workspace` object (in `/me`, `GET /workspaces`) includes `currencyDetail`
  (same shape). Use `decimals` to format any minor-unit value:
  `major = amountMinor / 10^decimals`.
- Analytics values (`income`, `expense`, `balance`, category `total`,
  monthly `income`/`expense`) are **minor units** — format with the currency's
  decimals.
- **Amounts sent in request bodies are major units** (`amount: 12.50`); the
  server converts with `Math.round(amount * 10^decimals)`. Numeric strings are
  accepted (coerced). Constraints: `> 0`, finite, `≤ 999,999,999.99` (whole-number
  part capped at 9 digits).
- Sign convention: the API returns **positive** `amountMinor` + a `type`. Apply
  the sign in the UI (`expense → negative`). The negative glyph used across the
  app is **U+2212 MINUS SIGN "−"**, not an ASCII hyphen. See
  [11-additional-details.md](./11-additional-details.md) § Money.

Currency `decimals`: **0** for JPY, ISK, UGX, VND, KRW, CLP; **3** for KWD, BHD,
OMR, JOD; **2** for the rest. Full 59-currency table in
[08-settings.md](./08-settings.md).

---

## 5. Lists, filters, pagination

`GET /transactions`, `GET /transactions/export`, and the analytics endpoints
accept these query params:

| Param | Meaning | Notes |
|---|---|---|
| `type` | `income` \| `expense` | Anything else → ignored |
| `category` | category id, or `all` | `all` (or empty) → no filter. Not UUID-validated. |
| `profile` | profile id, or `all` | **A UUID scopes to that profile; anything else (incl. `all` or omitted) → all accessible profiles.** |
| `from`, `to` | inclusive date range, `YYYY-MM-DD` | Must match `^\d{4}-\d{2}-\d{2}$`, else ignored |
| `q` | free-text search over `title` **OR** `description` | `ILIKE %q%`, trimmed |
| `limit` | page size (list only) | default **100**, clamped `[1, 500]` |
| `offset` | pagination offset (list only) | default 0, `≥ 0` |

- **Default profile scope on the API is ALL profiles** when `profile` is absent.
  (The *web* defaults to the first profile; the mobile client should decide its
  own default — see [03-navigation-shell.md](./03-navigation-shell.md).)
- `GET /transactions` returns `meta.total` (count ignoring paging) for pagers,
  plus `limit`, `offset`, `currency`.
- `GET /analytics/categories` **requires** `type`. `GET /analytics/monthly`
  **requires** `from` (and only honours `from` + `profile`).
- Invalid `limit`/`offset` **silently fall back** (never error).

---

## 6. Data models (serialized shapes)

### Transaction
```jsonc
{
  "id": "uuid",
  "type": "income" | "expense",
  "amountMinor": 1250,          // int, positive, minor units (source of truth)
  "amount": "12.50",            // major units, string, currency decimals
  "title": "Lunch" | null,
  "description": "…" | null,
  "occurredOn": "2026-06-01",   // YYYY-MM-DD
  "createdAt": "2026-06-01T12:34:56.000Z",  // ISO 8601
  "category": { "id": "uuid", "name": "Food" | null, "icon": "🍽️" | null } | null,
  "profile":  { "id": "uuid", "name": "Personal" | null, "icon": "👤" | null }  // never null
}
```
No `color` on the category/profile sub-objects; no `sortOrder` on the sub-object.

### Category
```jsonc
{
  "id": "uuid",
  "name": "Groceries",
  "kind": "income" | "expense",
  "icon": "🛒" | null,
  "createdAt": "…", "updatedAt": "…"
}
```
**No `color` field** — it doesn't exist in the DB, serializer, or input schemas.

### Profile
```jsonc
{
  "id": "uuid",
  "name": "Personal",
  "icon": "👤" | null,
  "color": "#…" | null,        // exists but no UI sets it
  "sortOrder": 0,
  "createdAt": "…", "updatedAt": "…"
}
```

### Settings
User-level settings that follow the user across every workspace. **Currency and
number format are NOT here — they're per-workspace** (see the `workspace` object).
```jsonc
{
  "theme": "light" | "dark" | "system",
  "inputMode": "amount_title" | "title_amount" | "combined"
}
```

### Workspace
```jsonc
{
  "id": "uuid",
  "name": "Ada's Workspace",
  "icon": "🏢" | null,                 // emoji beside the name; null when unset
  "role": "admin" | "editor" | "viewer" | null,
  "currency": "USD",
  "locale": "en-US",
  "currencyDetail": { "code": "USD", "symbol": "$", "decimals": 2 }
}
```

### `/me` payload
```jsonc
{
  "user": { "id": "uuid", "email": "a@b.com" | null, "name": "Ada" | null },
  "settings": { …Settings },
  "workspace": { …Workspace }
}
```

### Analytics
```jsonc
// summary → data
{ "income": 250000, "expense": 84000, "balance": 166000 }   // minor units; balance = income - expense
// categories → data[] (largest total first; uncategorized has null category fields)
{ "categoryId": "uuid"|null, "categoryName": "Food"|null, "categoryIcon": "🍽️"|null, "total": 84000 }
// monthly → data[] (ascending by month)
{ "month": "2026-06", "income": 250000, "expense": 84000 }
```
All analytics responses add `meta.currency = { code, symbol, decimals }`.

### `meta`
- Currency block (analytics + lists): `{ "currency": { "code", "symbol", "decimals" } }`.
- List pagination adds `{ "total", "limit", "offset", "currency" }`.

---

## 7. Endpoint reference

All endpoints require the bearer token → **401** on missing/bad token, **403**
if email unverified, **404** on a bad `X-Workspace-Id`. Only additional/notable
codes are listed per row.

### Account
| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /me` | — | 200 `{ user, settings, workspace }` | Current user + settings + current workspace |

### Workspaces
| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /workspaces` | — | 200 `data: WorkspaceSummary[]` | Every workspace the user can open (for a switcher). **Ignores `X-Workspace-Id`; never 404s.** Memberships first (`createdAt asc`), then grant-only (`role: null`). Always ≥1. Item shape = the `Workspace` object (`{ id, name, icon, role, currency, locale, currencyDetail }`, same as `/me`'s `workspace`). |
| `POST /workspaces` | `WorkspaceInput` `{ name, icon? }` | 201 `data: WorkspaceSummary` | Caller becomes **admin** (`role` always `"admin"`); seeds a default "Personal" profile + the default category list; inherits the creator's current currency/number format; becomes the current workspace (server persists `lastWorkspaceId`). `icon` is an optional emoji (omitted/empty → default 🏢). Ignores `X-Workspace-Id`. 400 bad JSON; 422 blank/long name. |
| `PATCH /workspaces/{id}` | `WorkspaceCurrencyPatch` `{ currency, locale }` | 200 `data: WorkspaceSummary` | Set the workspace's currency + number format (every member sees it). **Admin only** → 403 otherwise. Uses the path `id`, not `X-Workspace-Id`. 400; 404; 422 unsupported currency. |

### Transactions
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /transactions` | — | 200 `data: Transaction[]`, `meta: { total, limit, offset, currency }` | Newest first (`occurredOn desc, createdAt desc`). Filters + paging (§5). |
| `POST /transactions` | `TransactionInput` | 201 `data: Transaction` | 422 validation; **403** "You don't have permission to add transactions in this workspace" (no writable profile) |
| `GET /transactions/{id}` | — | 200 `data: Transaction` | 404 "Transaction not found" (also when the id lives in another workspace — workspace-scoped) |
| `PATCH /transactions/{id}` | `TransactionInput` (full body) | 200 `data: Transaction` | Full replacement of mutable fields. Workspace-scoped (cross-workspace id → 404). 422; 404; 403 (editor role required on its profile; also on target profile if `profileId` changes) |
| `DELETE /transactions/{id}` | — | 200 `data: { id, deleted: true }` | Workspace-scoped (cross-workspace id → 404). 422 "Invalid transaction" (non-UUID); 404; 403 (editor) |
| `POST /transactions/bulk` | `{ items: TransactionInput[] }` (1–500) | 201 `data: { count }` | 422; 403. Unknown categoryId → null; non-writable profileId → default profile |
| `GET /transactions/export` | — | 200 `text/csv` | **Not the JSON envelope.** Filters only (no paging; max 5000 rows). Text cells that look like formulas are apostrophe-prefixed. See § CSV. |
| `POST /transactions/delete-all` | `{ confirm: "DELETE", profileIds?: string[] }` | 200 `data: { deleted }` | **Workspace admins only** (403 otherwise). 400 "Type DELETE to confirm" if `confirm !== "DELETE"`. Deletes **every** transaction (any author) in the selected profiles of the current workspace; `profileIds` omitted/empty clears **all** profiles in the workspace (ids outside it are ignored). |

### Categories (scoped to the current workspace via `X-Workspace-Id`)
Shared by every member of the workspace. Reads need workspace access; writes
require the **editor** role (viewer → 403). Switching `X-Workspace-Id` changes
the list.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /categories` | — | 200 `data: Category[]` | The current workspace's list, `kind asc, name asc` (income first). |
| `POST /categories` | `CategoryInput` `{ name, kind, icon? }` | 201 `data: Category` | Editor+ (403 for viewer). 422; 409 "A category with that name already exists" (unique per workspace+kind) |
| `PATCH /categories/{id}` | `{ name?, icon? }` | 200 `data: Category` | Editor+ (403). 422; 404 "Category not found"; 409 duplicate name |
| `DELETE /categories/{id}` | — | 200 `data: { id, deleted: true }` | Editor+ (403). Referencing transactions get `categoryId = null`. 422; 404 |

### Profiles (RBAC: 404 = no access, 403 = role too low)
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /profiles` | — | 200 `data: Profile[]` | Accessible profiles in workspace, `sortOrder asc, createdAt asc` |
| `POST /profiles` | `ProfileInput` `{ name, icon?, color? }` | 201 `data: Profile` | Requires **admin**. 422; 409 duplicate name; 403/404 |
| `PATCH /profiles/{id}` | `{ name?, icon?, color? }` | 200 `data: Profile` | Requires **admin** on the profile. 422; 404; 409; 403 |
| `DELETE /profiles/{id}` | — | 200 `data: { id, deleted: true }` | Requires admin. 422; 404; **409 "You need at least one profile"** (last one); **409 "Move this profile's transactions to another profile first"** (non-empty); 403 |
| `POST /profiles/reorder` | `{ ids: uuid[] }` (1–100, full list) | 200 `data: Profile[]` | Requires **admin** (like all profile management). 422; 403/404 |
| `POST /profiles/{id}/move` | `{ toProfileId: uuid }` | 200 `data: { moved }` | Requires **editor** on both; same workspace. 422 "Invalid profiles" (bad/equal/cross-workspace ids); 403/404 |

### Settings
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /settings` | — | 200 `data: Settings` | User-level (theme, input mode). |
| `PATCH /settings` | `SettingsPatch` (any subset of `theme, inputMode`; ≥1 required) | 200 `data: Settings` | 422 "Provide at least one setting to update". **Currency/number format moved to `PATCH /workspaces/{id}`.** |

### Analytics (all add `meta: { currency }`)
| Method & path | Required | Success | Notes / errors |
|---|---|---|---|
| `GET /analytics/summary` | — | 200 `data: { income, expense, balance }` | Filters §5 |
| `GET /analytics/categories` | **`type`** | 200 `data: CategoryBreakdownItem[]` | 422 "Query param `type` must be 'income' or 'expense'" if missing |
| `GET /analytics/monthly` | **`from`** | 200 `data: MonthlyPoint[]` | Only honours `from` + `profile`. 422 "Query param `from` must be a YYYY-MM-DD date" |

---

## 8. Request body validation (mirror these client-side)

`TransactionInput`:
- `type` — `income | expense`, **required**.
- `amount` — number (numeric strings coerced), `> 0`, finite, `≤ 999,999,999.99`
  (whole-number part capped at 9 digits), **required**. Major units.
- `categoryId` — uuid, optional/nullable. Unknown id → stored `null`.
- `profileId` — uuid, optional/nullable. Absent/not-writable → default (first
  writable) profile.
- `title` — string, trimmed, `≤ 40`, optional (default `""`; empty → `null`).
- `description` — string, trimmed, `≤ 150`, optional (default `""`; empty → `null`).
- `occurredOn` — `^\d{4}-\d{2}-\d{2}$`, **required** ("Date must be YYYY-MM-DD").
- *(deprecated)* `note` — alias for `title`, `≤ 40`; use `title` instead.

`WorkspaceInput` — `name` (1–30, trimmed; "Workspace name is required" /
"…too long (max 30 characters)"), `icon?` (≤16 emoji; omitted/empty → default 🏢).
`CategoryInput` — `name` (1–20), `kind` (income|expense), `icon?` (≤16). **No `color`.**
`CategoryUpdate` — `name?` (1–20), `icon?` (≤16, nullable). **No `color`.**
`ProfileInput` — `name` (1–20), `icon?` (≤16), `color?` (≤32).
`ProfileUpdate` — `name?` (1–20), `icon?` (≤16, nullable), `color?` (≤32, nullable).
`SettingsPatch` — subset of `{ theme (light|dark|system),
inputMode (amount_title|title_amount|combined) }`; at least one key.
`WorkspaceCurrencyPatch` — `{ currency (one of 59 codes), locale (2–20 chars) }`;
both required. Admin only (`PATCH /workspaces/{id}`).

---

## 9. CSV export format

`GET /api/v1/transactions/export` returns `text/csv; charset=utf-8` with
`Content-Disposition: attachment; filename="spendchat-YYYY-MM-DD.csv"` (today's
date) and `Cache-Control: no-store`. Up to 5000 rows, honouring the same filters
(no paging).

- Header row: `Date,Type,Category,Note,Amount,Currency`
- Each row: `occurredOn` (raw `YYYY-MM-DD`), `type` (`income`/`expense`),
  `categoryName ?? "Uncategorized"`, `note` (= title) `?? ""`, **signed** major
  amount (`.toFixed(decimals)`, expenses negative), currency code.
- Cells are quoted when they contain `"`, `,`, `\n`, or `\r`; lines joined
  with **CRLF**.
- **Formula-injection guard (2.1.0):** a *text* cell starting with `=`, `+`,
  `-`, `@`, tab or CR is prefixed with a single quote and quoted, so
  Excel/Sheets treat it as text — a title `=SUM(A1)` exports as `"'=SUM(A1)"`.
  Numeric cells are exempt, so the signed Amount column (`-40.00`) is
  unchanged. If the app parses the CSV back, strip a leading `'` from text
  columns.

On mobile: fetch the response bytes, write to a temp file via `path_provider`,
then `share_plus` it. (The web app also has a *branded report* CSV at
`/api/transactions/export`, but that route is web-cookie-authed — use the `/v1`
one from the app.)

---

## 10. Example

```bash
TOKEN="<firebase id token>"
BASE="http://localhost:3010"
WS="<workspace uuid>"

curl "$BASE/api/v1/me" -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE/api/v1/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WS" \
  -H "content-type: application/json" \
  -d '{"type":"expense","amount":12.50,"occurredOn":"2026-06-01","title":"Lunch"}'
```

Response:
```jsonc
{ "data": {
  "id": "…", "type": "expense", "amountMinor": 1250, "amount": "12.50",
  "title": "Lunch", "description": null, "occurredOn": "2026-06-01",
  "createdAt": "2026-06-01T…Z",
  "category": null,
  "profile": { "id": "…", "name": "Personal", "icon": "👤" }
} }
```

---

## 11. Generating a Dart client

From [openapi.yaml](./openapi.yaml):

```bash
# OpenAPI Generator (dart-dio) — needs Java + openapi-generator-cli
openapi-generator-cli generate -i _developer/flutter/openapi.yaml -g dart-dio -o lib/api_gen
```

Because responses wrap the payload in `data`, either unwrap in a dio
interceptor, or generate models for the inner schemas (`Transaction`,
`Category`, …) and decode `body["data"]` yourself. Hand-writing ~8 `freezed`
models is also very reasonable and gives more control over the envelope + `meta`.
