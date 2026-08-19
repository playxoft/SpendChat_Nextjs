# 01 · API Reference (`/api/v1`)

The mobile app talks to the **same Next.js app** as the web UI, over a versioned
REST API at **`/api/v1`**. This doc is the human-readable contract; the
machine-readable spec is **[openapi.yaml](./openapi.yaml)** (OpenAPI 3.1) — you
can generate Dart models from it. **Where they differ, this doc reflects the
actual server code.**

**API spec version: 5.9.2.** Every API change bumps this version and is logged
in **[_changelog.md](./_changelog.md)** — check it to see what the Flutter app
needs to update.

- **Base URL (dev):** `http://localhost:3010` (Android emulator: `http://10.0.2.2:3010`)
- **Base URL (beta):** `https://beta.spendchat.app`
- **Base URL (prod):** `https://spendchat.app`
- **Auth:** `Authorization: Bearer <firebase-id-token>` (every endpoint except
  `GET /version` — see § 7 · Meta)
- **Workspace:** `X-Workspace-Id: <uuid>` (optional; see § Workspaces)
- **Platform:** `X-Client-Platform: android | ios` (optional telemetry; send it on
  every request so server logs attribute the platform. It never changes a
  response — omitting it just logs the platform as `api`.)
- **Content type:** `application/json` (CSV export is `text/csv`; attachment
  upload, vault file upload, and voice transcription send `multipart/form-data`)
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
| `rate_limited` | 429 | Shared per-user AI quota spent (30 calls/hour across `/ai/*`) |
| `payload_too_large` | 413 | An uploaded attachment file exceeds 5 MB |
| `storage_quota_exceeded` | 413 | The upload would push the workspace past its 1 GB storage quota (message says how much space remains — displayable as-is) |
| `ai_failed` | 502 | The upstream AI model provider errored — retry is reasonable |
| `ai_unavailable` | 503 | That AI feature's model isn't configured on the server (feature off) |
| `storage_unavailable` | 503 | File storage (R2) isn't configured on the server (attachments off) |
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

- Header: `Authorization: Bearer <idToken>` on **every** `/api/v1` request
  except `GET /api/v1/version` (public — the version has to be readable before
  sign-in and while an "update required" screen is up). Matched
  case-insensitively as `Bearer <token>`.
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
  "profile":  { "id": "uuid", "name": "Personal" | null, "icon": "👤" | null },  // never null
  "user":     { "id": "uuid", "name": "Ada" | null, "email": "a@b.com" | null }, // author; never null
  "attachments": [ …Attachment ]   // oldest first; [] when none
}
```
No `color` on the category/profile sub-objects; no `sortOrder` on the sub-object.
`user` is author attribution — show it in shared workspaces (more than one user),
hide it in solo ones. `attachments.length` drives the 📎 indicator.

### Attachment
Metadata only — the bytes live in object storage; fetch them via
`GET /attachments/{id}/url` (§7 Attachments).
```jsonc
{
  "id": "uuid",
  "transactionId": "uuid",
  "fileName": "receipt.jpg",          // sanitized original name, ≤ 200 chars
  "contentType": "image/jpeg",        // one of the upload allowlist types
  "sizeBytes": 83211,                 // ≤ 5 MB
  "kind": "receipt" | "bill" | "invoice" | "other" | null,
  "label": "June groceries" | null,   // display name; fall back to fileName
  "hasThumbnail": true,               // a small webp preview exists (?variant=thumb)
  "createdAt": "2026-06-01T12:34:56.000Z"
}
```

### Files vault models
The vault (a Drive-like document store, per profile) has five shapes —
`GET /files` returns the first four in one call; share links are managed
separately. Resolve `tagIds` against the `tags` list client-side.

```jsonc
// Folder — system: true = the predefined "Transaction attachments" folder
// (recolor/tag only; never rename/move/delete/share/upload-into/nest-under)
{
  "id": "uuid", "profileId": "uuid",
  "parentId": "uuid" | null,          // null = a root folder
  "name": "Land documents",           // ≤ 40 chars
  "color": "#3b82f6" | null,          // accent hex; null = neutral default
  "tagIds": ["uuid"],
  "system": false,
  "createdAt": "…", "updatedAt": "…",
  "createdByName": "Ada" | null       // display attribution
}

// VaultFile — bytes via GET /files/{id}/url (presigned, like attachments)
{
  "id": "uuid", "profileId": "uuid",
  "folderId": "uuid" | null,          // null = the profile's root
  "name": "deed.pdf",                 // ≤ 200 chars
  "contentType": "application/pdf",   // NO allowlist; unknown → application/octet-stream
  "sizeBytes": 83211,                 // ≤ 5 MB
  "category": "land" | null,          // board-resolution|company|personal|land|house|certificate|other
  "tagIds": ["uuid"],
  "hasThumbnail": true,               // small webp preview exists (?variant=thumb)
  "createdAt": "…",
  "uploaderName": "Ada" | null,
  "profileName": "Personal" | null, "profileIcon": "👤" | null
}

// TransactionFile — a transaction attachment as the vault surfaces it.
// `id` is the ATTACHMENT id → bytes via GET /attachments/{id}/url.
{
  "id": "uuid", "transactionId": "uuid",
  "name": "receipt.jpg", "contentType": "image/jpeg", "sizeBytes": 83211,
  "hasThumbnail": true, "createdAt": "…",
  "txnTitle": "Groceries" | null, "txnType": "expense",
  "txnAmountMinor": 45000, "txnOccurredOn": "2026-07-12",
  "profileId": "uuid", "profileName": "…" | null, "profileIcon": "…" | null
}

// FileTag — per-profile entity; only a created tag can be applied
{
  "id": "uuid", "profileId": "uuid",
  "name": "legal",                    // ≤ 20 chars, unique per profile (case-insensitive)
  "color": "#ef4444",                 // #rrggbb
  "createdAt": "…", "updatedAt": "…"
}

// FileShare — the token IS the capability; web page = <web-origin> + sharePath
{
  "id": "uuid",
  "fileId": "uuid" | null, "folderId": "uuid" | null,   // exactly one set
  "token": "aBcD…", "sharePath": "/share/aBcD…",
  "allowDownload": true,              // false = view-only link
  "expiresAt": "…" | null,            // null = never expires
  "createdAt": "…"
}
```

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
  "inputMode": "amount_title" | "title_amount" | "combined",
  "voiceLanguages": ["en", "ta"]   // ISO 639-1; what voice entry expects. 1–5 codes, never empty
}
```
`voiceLanguages` supported codes (the settings picker's catalogue): `en, bn, gu,
hi, kn, ml, mr, or, pa, ta, te, ur, ar, de, es, fr, id, it, ja, ko, nl, pt, ru,
th, tr, vi, zh`. It's a *list* because the transcription model accepts several at
once — that's what makes code-mixed speech ("groceries-க்கு 500 rupees") work.

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

### AiDraft (from `POST /ai/parse`)
One reviewable transaction the AI extracted from the note. Maps 1:1 onto a
`TransactionInput` for `POST /transactions/bulk` — drop `categoryName`, add
`profileId` if the user picked a profile.
```jsonc
{
  "type": "income" | "expense",
  "amount": 250,                        // major units, > 0, within input limits
  "title": "Fruits",                    // ≤ 40 chars, never empty; first letter sentence-cased by the server
  "description": "June bill" | null,    // ≤ 150 chars; sentence-cased the same way
  "categoryId": "uuid" | null,          // an existing workspace category of this type, or null
  "categoryName": "Food" | null,        // its exact stored name (same match as categoryId)
  "occurredOn": "2026-07-29"            // defaults to "today" in your timezone; never future
}
```

### `meta`
- Currency block (analytics + lists): `{ "currency": { "code", "symbol", "decimals" } }`.
- List pagination adds `{ "total", "limit", "offset", "currency" }`.
- `GET /files` adds `{ "storage": { "usedBytes", "limitBytes" } }` — the
  workspace's stored bytes (vault files + transaction attachments) against its
  1 GB quota. Workspace-wide even when `?profile=` scopes the list.

### VersionInfo (from `GET /version`)
```jsonc
{
  "name": "SpendChat",
  "version": "0.2.0",          // the deployed SERVER release — not the Flutter app's version
  "apiVersion": "5.5.0",       // the contract this doc describes
  "environment": "production" | "beta" | "development",
  "build": {                   // nullable — null locally and on pre-binding deploys
    "id": "c9a1f0d2-…",        // Cloudflare Worker version id; quote it in bug reports
    "deployedAt": "2026-08-14T09:30:00.000Z" | null
  } | null,
  "changelog": { "app": "https://github.com/…/CHANGELOG.md", "api": "https://github.com/…/_changelog.md" }
}
```
Everything here is public, non-sensitive information — no dependency versions,
hostnames, regions, env var names, or database/storage state. Model `build` as
nullable, and both `build` and `deployedAt` as optional-ish, so an older deploy
doesn't crash the parser.

---

## 7. Endpoint reference

All endpoints **except `GET /version`** require the bearer token → **401** on
missing/bad token, **403** if email unverified, **404** on a bad
`X-Workspace-Id`. Only additional/notable codes are listed per row.

### Meta (no auth)
| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /version` | — | 200 `data: VersionInfo` | **No bearer token, no workspace header, never 401/403/404.** What's deployed: server release, this contract's `apiVersion`, environment, and build. Also served at `/version` (outside `/api/v1`, identical body) for `curl`/uptime checks. `Cache-Control: no-store` — poll it to notice a new deploy. |

**Using it in Flutter:** call it once at startup (before auth). Compare
`apiVersion`'s **major** with the version this app was built against — a higher
major means the server contract moved on and the app should prompt an update; a
higher minor is additive and safe to ignore. Show `version` and `build.id` on
the debug/about screen so a bug report names the exact deploy, and link
`changelog.app`.

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
| `GET /transactions` | — | 200 `data: Transaction[]`, `meta: { total, limit, offset, currency }` | Newest first (`occurredOn desc, createdAt desc, id desc`). The `id` tiebreaker makes the order **total**, so `limit`/`offset` paging can't repeat or skip rows that tie on time (a bulk batch is written in one statement, so it always shares `createdAt` and often `occurredOn` too). Filters + paging (§5). |
| `POST /transactions` | `TransactionInput` | 201 `data: Transaction` | 422 validation; **403** "You don't have permission to add transactions in this workspace" (no writable profile) |
| `GET /transactions/{id}` | — | 200 `data: Transaction` | 404 "Transaction not found" (also when the id lives in another workspace — workspace-scoped) |
| `PATCH /transactions/{id}` | `TransactionInput` (full body) | 200 `data: Transaction` | Full replacement of mutable fields. Workspace-scoped (cross-workspace id → 404). 422; 404; 403 (editor role required on its profile; also on target profile if `profileId` changes) |
| `DELETE /transactions/{id}` | — | 200 `data: { id, deleted: true }` | Workspace-scoped (cross-workspace id → 404). 422 "Invalid transaction" (non-UUID); 404; 403 (editor) |
| `POST /transactions/bulk` | `{ items: TransactionInput[] }` (1–500) | 201 `data: { count }` | 422; 403. Unknown categoryId → null; non-writable profileId → default profile |
| `GET /transactions/export` | — | 200 `text/csv` | **Not the JSON envelope.** Filters only (no paging; max 5000 rows). Text cells that look like formulas are apostrophe-prefixed. See § CSV. |
| `POST /transactions/delete-all` | `{ confirm: "DELETE", profileIds?: string[] }` | 200 `data: { deleted }` | **Workspace admins only** (403 otherwise). 400 "Type DELETE to confirm" if `confirm !== "DELETE"`. Deletes **every** transaction (any author) in the selected profiles of the current workspace; `profileIds` omitted/empty clears **all** profiles in the workspace (ids outside it are ignored). |

### Attachments (receipts / bills / invoices on a transaction)
Access is inherited from the transaction's profile: **viewer** to see/fetch,
**editor** to upload/edit/delete. Metadata is embedded on every `Transaction`
(`attachments`); these endpoints manage it and mint download URLs. Limits: **2
files per transaction**, **5 MB per file**, types JPEG/PNG/WebP/GIF/PDF/Word/
Excel/CSV/plain text — and uploads count toward the workspace's **1 GB storage
quota** (shared with the files vault; 413 `storage_quota_exceeded` when the
batch doesn't fit). `503 storage_unavailable` on all of them when the server
has no file storage configured.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `POST /transactions/{id}/attachments` | **multipart** — files under `files` (repeatable; `file` works too); optional `thumb_<index>` webp preview per image file | 201 `data: Attachment[]` | Editor. 400 no files / too many (counting already-attached: "This transaction already has the maximum of 2 files"); **413** file > 5 MB (`payload_too_large`) or workspace quota exceeded (`storage_quota_exceeded`); 422 unsupported type; 404 transaction not in this workspace |
| `PATCH /attachments/{id}` | `{ label?, kind? }` (≥1; `null` clears) | 200 `data: Attachment` | Editor. `label` ≤ 80; `kind` ∈ receipt\|bill\|invoice\|other\|null. 400 "Nothing to update"; 422; 404 |
| `DELETE /attachments/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Removes the stored object too. 422 non-UUID; 404 |
| `GET /attachments/{id}/url` | — | 200 `data: { url, expiresInSeconds, fileName, contentType }` | Viewer. Mints a **presigned URL** (~5 min) — GET it **without** the Authorization header. `?variant=thumb` → the small webp preview (falls back to the original if none); `?download=1` → attachment disposition. Mint per view; don't cache past expiry. 404 |

### Files vault (Drive-like document store, per profile)
Viewing needs **viewer** on the item's profile; every write needs **editor**.
`?profile=<uuid>` scopes the list endpoints to one profile (anything else, incl.
`all` or omitted → all accessible profiles — same rule as §5). Unlike
attachments there's **no upload type allowlist** (videos, archives, anything).
A file whose `Content-Type` is missing or `application/octet-stream` has its
type **resolved from the filename extension**, so a `.mkv`/`.avi`/`.m4v`/`.flac`
is reported as its real `video/*` / `audio/*` type rather than a generic binary
— send the filename with the extension intact and the `contentType` will be
right. The same resolution runs when a file is **read**, so files uploaded
before this existed report their real type too; `.ts` is deliberately *not*
treated as video (it's usually TypeScript source), and `.m4v` reports
`video/mp4`, the container it actually is. Size is capped at **5 MB per file — client-generated previews
included**,
**10 files per upload**, and the
workspace's **1 GB storage quota** (vault files + transaction attachments
together; 413 `storage_quota_exceeded` when the batch doesn't fit —
`GET /files` reports usage in `meta.storage`). The predefined
**"Transaction attachments"** folder (`system: true`, one per profile) accepts
only color + tags — rename/move/delete/share/upload-into are 400s.
`503 storage_unavailable` on upload/url when file storage isn't configured.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /files` | — | 200 `data: { folders, files, transactionFiles, tags }`, `meta: { filesCapped, filesLimit, storage }` | The whole working set in one call (mirrors the web page load). Files newest first, capped at `filesLimit` (500) — `filesCapped: true` → narrow by profile. `storage` = workspace usage vs the 1 GB quota (see § meta). Also lazily creates the predefined folder for each profile the caller can **write** to — a viewer's read never creates rows, so a view-only user may not see it until an editor opens the vault (their transaction files are still returned in `transactionFiles`). |
| `POST /files` | **multipart** — `profileId` (required), `folderId?`, files under `files` (repeatable; `file` works too), optional `thumb_<index>` webp preview per file | 201 `data: VaultFile[]` | Editor. `<index>` counts file parts in send order (`files` before `file`) and is **not** renumbered around non-file parts. 400 no files / > 10 / predefined-folder destination; **413** file **or preview** > 5 MB (`payload_too_large`) or workspace quota exceeded (`storage_quota_exceeded`); 404 profile/folder not reachable |
| `PATCH /files/{id}` | `{ name?, category?, tagIds?, folderId? }` (≥1; `category: null` clears, `folderId: null` → root) | 200 `data: VaultFile` | Editor. 400 "Nothing to update"; 422; 404 |
| `DELETE /files/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Removes the stored object, its preview object, and share links to it. 422 non-UUID; 404 |
| `GET /files/{id}/url` | — | 200 `data: { url, expiresInSeconds, fileName, contentType }` | Viewer. Same contract as `GET /attachments/{id}/url` (`?variant=thumb`, `?download=1`; ~5 min TTL; GET without the Authorization header). **Inline only for previewable types** — images, PDF, text/CSV/Markdown, and **every `video/*` or `audio/*` type the server recognizes** (don't hard-code the list: it's whatever `contentType` comes back as for a media file, currently 23 types incl. `video/x-m4v`→`video/mp4`, `video/3gpp2` and `audio/webm`). Anything else is served `attachment` even without `?download=1`, since the vault takes any MIME type and a stored HTML/SVG must never render in a WebView. Media is inline across the board because media bytes go to the decoder, never to a document parser. Whether a given container actually plays is the **player's** call — expect a decode failure on some formats and fall back to a download. The URL also carries a `Content-Type` matching the `contentType` in the response, so a file stored before its container could be named still arrives typed. `?variant=thumb` is always inline. 404 |
| `POST /folders` | `{ profileId, name, parentId?, color?, tagIds? }` | 201 `data: Folder` | Editor. 409 duplicate sibling name (case-insensitive); 400 predefined-folder parent; 422; 404 |
| `PATCH /folders/{id}` | `{ name?, color?, tagIds?, parentId? }` (≥1; `parentId: null` → root, `color: null` clears) | 200 `data: Folder` | Editor. Predefined folder: color+tags only (400 otherwise). 400 move-into-own-subtree / "Nothing to update"; 409 duplicate name; 422; 404 |
| `DELETE /folders/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Deletes the whole subtree (nested folders, files, stored objects, share links). 400 predefined folder; 422; 404 |
| `GET /file-tags` | — | 200 `data: FileTag[]` | Viewer. Name-ascending; `?profile=` scopes. (Also included in `GET /files` — this is for pickers.) |
| `POST /file-tags` | `{ profileId, name, color }` | 201 `data: FileTag` | Editor. 409 duplicate name per profile (case-insensitive); 422 |
| `PATCH /file-tags/{id}` | `{ name?, color? }` (≥1) | 200 `data: FileTag` | Editor. Every referencing item updates at once. 409; 422; 404 |
| `DELETE /file-tags/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Detaches from every file/folder first. 422; 404 |
| `GET /file-shares` | — (query `fileId` **or** `folderId`, exactly one) | 200 `data: FileShare[]` | **Editor** (tokens grant public access). Newest first, **active links only** — an expired one is omitted, since its token no longer opens the share page. 422 neither/both; 404 |
| `POST /file-shares` | `{ fileId? \| folderId?, allowDownload?, expiresInDays? }` | 201 `data: FileShare` | Editor. Exactly one target (422). Folder link shares the whole subtree; 400 predefined folder. Build the link as `<web-origin>` + `sharePath`. `allowDownload: false` is enforced as *no bytes leave except as a preview the browser renders* — the share page serves playable media and previewable documents inline, and 403s anything else (a `.avi`/`.wmv` "preview" would just be a download). |
| `DELETE /file-shares/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Token stops working immediately. 422; 404 |

### AI (assisted entry — both endpoints cost money server-side, so they're extra-gated)
Both require the **editor** role (403 for viewers — hide the UI) and share a
per-user quota of **30 calls/hour** (429 `rate_limited`). `503 ai_unavailable` =
that feature's model isn't configured (treat as feature-off, like the web);
`502 ai_failed` = provider hiccup, offer retry. Neither writes anything.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `POST /ai/parse` | `{ text, timezone? }` — text ≤ 2000 chars; timezone = IANA device zone (omitted → UTC) | 200 `data: { drafts: AiDraft[], today }` | Free text → ≤ 50 reviewable drafts. **Nothing is saved** — user reviews/edits, then commit kept drafts via `POST /transactions/bulk`. Note hints: `#Category` tags a category, `(parens)` → description, relative dates resolve against `timezone`. 400 empty/too-long text, bad timezone, or nothing parseable ("I couldn't find any transactions in that…") |
| `POST /ai/transcribe` | **multipart** — recording under `audio` (+ optional `mimeType` text field fallback) | 200 `data: { text }` | Voice note → transcript (≤ 1200 chars) for the composer; user fixes it, then it goes through `/ai/parse` like a typed note. Audio is discarded, never stored. Accepted: webm/ogg/mp4(m4a)/mpeg/wav; ≤ 4 MB (~1 min — cap recording at 60 s). Languages guided by `settings.voiceLanguages`; amounts come back as digits. 400 bad/empty/oversized audio or no speech — a 400 on format/size/emptiness costs **no quota slot** (those checks precede the role + quota gates), so retrying is free |

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
| `DELETE /profiles/{id}?transactions=&to=` | — | 200 `data: { id, deleted: true }` | Requires admin. `transactions` = `delete` (remove them + their attachments), `move` (re-file under `to` first), or **`reject`, the default** — 409 "Move this profile's transactions to another profile first" while any remain. An **empty value is treated as absent** (`?transactions=` = the default; `&to=` = not given). 422 when `transactions=move` without `to`. Always **409 "You need at least one profile"** for the last one. 409 "Something was added to this profile while it was being deleted — try again" when a concurrent write lands mid-delete (nothing is changed; retry). **The profile's vault follows the same choice**: `move` re-files its files, folders, tags and share links under `to`; `delete` destroys them. A destination tag whose name matches one being moved is **merged** into it (the moved tag's id disappears). 404; 403 |
| `GET /profiles/{id}/deletion-impact` | — | 200 `data: { transactions, files, attachments }` | Requires admin. Counts for the confirm step: `transactions` is what `?transactions=` decides the fate of; `attachments` are the receipts on those transactions and `files` the vault — all three follow the disposal, destroyed on `delete` and moved on `move`. Offer the choice whenever `transactions > 0` **or** `files > 0`. 422; 404; 403 |
| `POST /profiles/reorder` | `{ ids: uuid[] }` (1–100, full list) | 200 `data: Profile[]` | Requires **admin** (like all profile management). 422; 403/404 |
| `POST /profiles/{id}/move` | `{ toProfileId: uuid }` | 200 `data: { moved }` | Requires **editor** on both; same workspace. 422 "Invalid profiles" (bad/equal/cross-workspace ids); 403/404 |

### Settings
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /settings` | — | 200 `data: Settings` | User-level (theme, input mode, voice languages). |
| `PATCH /settings` | `SettingsPatch` (any subset of `theme, inputMode, voiceLanguages`; ≥1 required) | 200 `data: Settings` | 422 "Provide at least one setting to update". `voiceLanguages` is **normalized, not rejected**: unknown codes dropped, deduped, capped at 5, empty → default `["en"]` — read the normalized list back from the response. **Currency/number format moved to `PATCH /workspaces/{id}`.** |

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
inputMode (amount_title|title_amount|combined), voiceLanguages (string[], each
2–8 chars, ≤ 20 entries; normalized server-side — see § Settings) }`; at least
one key.
`WorkspaceCurrencyPatch` — `{ currency (one of 59 codes), locale (2–20 chars) }`;
both required. Admin only (`PATCH /workspaces/{id}`).
`AiParseInput` — `{ text (1–2000 chars after trim, required),
timezone? (IANA name, e.g. "Asia/Kolkata") }`.
`AttachmentMetaPatch` — `{ label? (≤ 80, nullable), kind?
(receipt|bill|invoice|other, nullable) }`; at least one key.
Attachment upload (multipart) — ≤ 2 files/transaction total, ≤ 5 MB each; types
JPEG, PNG, WebP, GIF, PDF, doc/docx, xls/xlsx, CSV, plain text. A generic
`application/octet-stream` part is resolved by filename extension.
Voice upload (multipart) — one `audio` part, ≤ 4 MB, container webm/ogg/mp4/
mpeg/wav; keep recordings ≤ 60 s.

Files vault:
`FolderInput` — `{ profileId (uuid, required), name (1–40, trimmed, required),
parentId? (uuid, nullable), color? (#rrggbb hex, nullable), tagIds? (uuid[],
≤ 10, deduped) }`.
`FolderPatch` — any subset of `{ name, color, tagIds, parentId }` (≥1 change;
`parentId: null` → root, `color: null` clears).
`VaultFilePatch` — any subset of `{ name (1–200), category
(board-resolution|company|personal|land|house|certificate|other, nullable),
tagIds (≤ 10), folderId (nullable) }` (≥1 change).
`FileTagInput` — `{ profileId, name (1–20), color (#rrggbb, required) }`.
`FileTagPatch` — `{ name?, color? }` (≥1 change).
`FileShareInput` — `{ fileId? | folderId? (exactly one), allowDownload?
(default true), expiresInDays? (1–365, nullable; omitted/null = never) }`.
Vault upload (multipart) — `profileId` required, `folderId?`; ≤ 10 files,
≤ 5 MB each, **no type allowlist** (unknown → `application/octet-stream` by
filename extension).

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
  "profile": { "id": "…", "name": "Personal", "icon": "👤" },
  "user": { "id": "…", "name": "Ada", "email": "a@b.com" },
  "attachments": []
} }
```

AI entry end-to-end:
```bash
# 1. (optional) voice → text
curl -X POST "$BASE/api/v1/ai/transcribe" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -F "audio=@note.m4a;type=audio/mp4"
# → { "data": { "text": "200 fruits, 100 veg, 1000 electricity" } }

# 2. text → drafts (review in the UI)
curl -X POST "$BASE/api/v1/ai/parse" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "content-type: application/json" \
  -d '{"text":"200 fruits, 100 veg, 1000 electricity","timezone":"Asia/Kolkata"}'
# → { "data": { "drafts": [ {…AiDraft} ], "today": "2026-07-29" } }

# 3. commit the drafts the user kept
curl -X POST "$BASE/api/v1/transactions/bulk" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "content-type: application/json" \
  -d '{"items":[{"type":"expense","amount":200,"title":"Fruits","categoryId":null,"occurredOn":"2026-07-29"}]}'
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
