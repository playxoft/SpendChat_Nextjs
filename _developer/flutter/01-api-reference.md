# 01 · API Reference (`/api/v1`)

The mobile app talks to the **same Next.js app** as the web UI, over a versioned
REST API at **`/api/v1`**. This doc is the human-readable contract; the
machine-readable spec is **[openapi.yaml](./openapi.yaml)** (OpenAPI 3.1) — you
can generate Dart models from it. **Where they differ, this doc reflects the
actual server code.**

**API spec version: 6.10.0.** Every API change bumps this version and is logged
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
  `error.message` for display, and `error.details` — a flat `{ field → message }`
  map for form validation (only the **first** issue per field is included), or
  a `PlanLimitDetails` object on `plan_limit` / `storage_quota_exceeded` (§1 ·
  Plan limits).
- Unwrap `data` in **one place** (a dio interceptor / response layer). Analytics
  and list endpoints also return `meta` — surface both.

### Error codes → HTTP status

| `error.code` | HTTP | When |
|---|---|---|
| `bad_request` | 400 | Malformed JSON body; wrong confirm string |
| `unauthorized` | 401 | Missing/invalid/expired bearer token |
| `forbidden` | 403 | Email not verified; RBAC role too low; no writable profile |
| `plan_limit` | 403 | The workspace's **plan** doesn't allow this — a cap is reached or the feature is on a higher plan; also writes into a view-only workspace. `details` = `PlanLimitDetails` (see below). Since 6.5.0. |
| `not_found` | 404 | Resource / workspace / profile not accessible to the caller |
| `conflict` | 409 | Duplicate name; last profile; non-empty profile delete; email already registered with a different sign-in method (unverified email only — see § Authentication) |
| `validation_error` | 422 | Zod validation failed (`details` = field→message) |
| `rate_limited` | 429 | Over a **per-person rate limit** for the plan (since 6.6.0, any endpoint — see § Rate limits). `Retry-After` header = seconds to wait; `details` = `{ bucket, window, retryAfterSeconds }` |
| `payload_too_large` | 413 | An uploaded attachment file exceeds 5 MB, or the whole request body is larger than the endpoint's limits could ever allow (rejected from `Content-Length`, before the body is read) |
| `storage_quota_exceeded` | 413 | The upload would push the workspace past its plan's storage — 1 / 5 / 20 GB on Free / Plus / Pro (message says how much space remains — displayable as-is; since 6.5.0 `details` is a `PlanLimitDetails` with `limit: "storage"`; `used` includes the trash, and since 6.7.0 `details.trashBytes` says how much of it emptying the trash would free) |
| `ai_failed` | 502 | The upstream AI model provider errored — retry is reasonable |
| `ai_unavailable` | 503 | That AI feature's model isn't configured on the server (feature off) |
| `storage_unavailable` | 503 | File storage (R2) isn't configured on the server (attachments off) |
| `split_group_full` | 409 | A split group already holds 50 people (the creator included) — the same on every plan, so no upgrade helps. `details: { max, used }`. Since 6.9.0. |
| `settle_first` | 409 | Removing someone from (or leaving) a split group while they still owe or are owed. Since 6.9.0. |
| `invite_cooldown` | 409 | Adding someone to a split group they declined or left in the last 30 days. `details: { emails, until }`. Since 6.9.0. |
| `amount_required` | 422 | "Add my share to my workspace" when the group's currency differs from the workspace's and no `amount` (in the workspace's currency) was sent. Since 6.9.0. |
| `internal_error` | 500 | Unhandled server error (generic message; no internals leaked) |

> **`forbidden` (403)** and the `workspace` object on `/me` are **not** in the
> older `openapi.yaml`. The corrected [openapi.yaml](./openapi.yaml) in this
> folder includes them.

### Important RBAC distinction

- **404 `not_found`** = you have *no* access to that resource/workspace/profile.
- **403 `forbidden`** = you *can see it* but your role is too low for the action.

The client should treat these differently: 404 → "not found / no access", 403 →
"you don't have permission" (and hide the action for viewers). A 403 whose
`error.code` is **`plan_limit`** is different again: the role is fine, the
**plan** isn't — offer the upgrade (below), never "ask an admin".

### Plan limits (`403 plan_limit`, since 6.5.0)

Every workspace has a **plan** — `free`, `plus` or `pro` (`Workspace.plan`) —
and every limit belongs to the workspace, shared by everyone in it. When an
action would go past one, the server answers **403** with
`error.code = "plan_limit"`, a message that is safe to display as-is, and:

```jsonc
"details": {
  "limit": "spaces",        // PlanLimitKey — which limit (pick the upgrade copy from it)
  "plan": "free",           // the workspace's plan right now
  "max": 2,                 // the cap, when it's a number (bytes for storage) — absent for feature gates
  "used": 2,                // how much is in use, when it's a number — absent for feature gates
  "upgradeTo": "plus"       // the cheapest plan that lifts it; null → "contact us"
}
```

| `limit` | Free / Plus / Pro | Returned by |
|---|---|---|
| `members` | 3 / 5 / 10 people (invites count) | The web's invite flow; `POST /trash/restore` of a profile that brings back people who could only reach the workspace through it (6.7.0) |
| `spaces` | 2 / 6 / 15 (the default space counts) | `POST /spaces` |
| `profilesPerSpace` | 3 / 5 / 10 per space | `POST /profiles`, `POST /profiles/{id}/space`, `DELETE /spaces/{id}` with a move, `POST /trash/restore` of a profile (6.7.0) |
| `categories` | 20 / 30 / 50 (the 10 seeded defaults count) | `POST /categories` |
| `tags` | 5 / 10 / 20 (the 2 seeded defaults count) | `POST /tags` |
| `budgets` | 5 / 20 / "Unlimited" (Pro's safety cap is 200 → `upgradeTo: null`, show "Contact us") — since 6.8.0 | `POST /budgets` |
| `storage` | 1 / 5 / 20 GB | **413 `storage_quota_exceeded`** (not 403) on `POST /files` and `POST /transactions/{id}/attachments` — same `details` |
| `aiActions` | 50 / 300 / 1,000 per UTC calendar month | `POST /ai/parse`, `POST /ai/transcribe` |
| `voice` | Pro only | `POST /ai/transcribe` |
| `profileLevelAccess` | Plus / Pro | `PUT /profiles/{id}/overrides` |
| `freeWorkspaces` | one free workspace per person | `POST /workspaces`; writes into a view-only workspace — any endpoint that adds or edits data (below) |

Limits apply to every workspace from the day plans ship, and they gate
**adding**, never existing data: a workspace over a cap (after a downgrade)
keeps everything and just can't add another until it's back under.
`GET /usage` reports every limit and how much of it is used, so the app can
show the upgrade before the server has to refuse.

**View-only workspaces.** A person gets one free workspace. An extra free one
(a Free workspace whose owner has an older Free workspace, e.g. after a
downgrade) is **view-only**: `GET /usage` → `readOnly: true` (and
`GET /organization` → `workspaces[].readOnly`), every profile in it reports
`access: "read"`, and writes are refused with `403 plan_limit`,
`limit: "freeWorkspaces"` — anything inside a profile (transactions,
attachments, vault files, profile edits) and every add at workspace level
(profiles, spaces, categories, tags). Render such a workspace read-only up
front rather than waiting for the error.

### Rate limits (`429 rate_limited`, since 6.6.0)

Every authenticated request counts against a **per-person** limit, checked over
three windows at once — 1 minute, 5 minutes and 1 hour — in one of three
buckets picked from the request itself:

| Request | Bucket |
|---|---|
| `POST /ai/parse`, `POST /ai/transcribe` | **ai** |
| any other `GET` / `HEAD` | **read** |
| every other `POST` / `PUT` / `PATCH` / `DELETE` | **create** |

| Per person (1 min / 5 min / 1 hour) | Free | Plus | Pro |
|---|---|---|---|
| create | 20 / 60 / 300 | 30 / 100 / 500 | 40 / 150 / 800 |
| read | 120 / 400 / 2,000 | 180 / 600 / 3,000 | 240 / 900 / 5,000 |
| ai | 3 / 6 / 10 | 5 / 15 / 30 | 6 / 20 / 60 |

- The numbers are the plan of the workspace in context (`X-Workspace-Id`, else
  the current one). `GET`/`POST /workspaces` and `/organization` have no
  workspace in context: they use the best plan among the caller's workspaces.
- **A bulk call is one request** — `POST /transactions/bulk` with 500 rows, or
  a multi-file upload, counts once. A **CSV export** (`GET /transactions/export`,
  up to 5,000 rows) is the exception the other way: it counts as **20 reads**
  (6 a minute on Free).
- Over a limit → **`429 rate_limited`** with a **`Retry-After`** header (whole
  seconds) and
  `error.details = { bucket: "create" | "read" | "ai", window: "1m" | "5m" | "1h", retryAfterSeconds }`.
  `error.message` already says how long to wait ("That's a lot of changes in a
  short time. Try again in 40 seconds.") — show it as-is.
- **Wait `Retry-After` before retrying.** An earlier retry is refused again;
  refused requests don't count against you. Never retry a 429 in a loop.
- Minting a file URL (`GET /files/{id}/url`, `GET /attachments/{id}/url`) is a
  read — mint per view and reuse the URL for its lifetime (`expiresInSeconds`)
  instead of re-minting while scrolling a grid.
- On `/ai/*` two 429s come without `window`: a second AI call sent while your
  previous one is still being charged (`retryAfterSeconds: 1`), and AI paused
  because the server can't check the limit right now (`retryAfterSeconds: 5`
  — AI is refused rather than allowed unchecked; other endpoints carry on).
- `GET /version` is never limited.

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
  list/create/reorder, **all** `spaces` endpoints, and `/usage`.
  Single-transaction and single-space ops are scoped to the current workspace:
  an id from another of the user's workspaces is a **404**. (Profile
  item-level endpoints resolve access by profile role instead.)
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
  id as `X-Workspace-Id` and re-fetch `/me` + data. A new workspace is on the
  **Free** plan, and a person gets one free workspace — a second is
  `403 plan_limit` (`freeWorkspaces`).
- **Hierarchy (6.5.0):** organisation → workspace → space → profile. Every
  account has one personal **organisation** (`GET /organization`) holding the
  workspaces it owns; each workspace has a **plan** (`plan` on the workspace
  object) and its profiles live in **spaces** (`Profile.spaceId`,
  `GET /spaces`). The space is the unit of sharing: admins see every space,
  other members see the spaces they're in, at that space's role.

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
| `q` | free-text search over `title` **OR** `description` | `ILIKE %q%`, trimmed. Does **not** match tag names. |
| `tags` | comma-separated tag ids | Matches **any** of them (overlap), not all. Deduped; non-UUID segments dropped rather than rejected; capped at 10. Empty/absent → no filter. |
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
  "attachments": [ …Attachment ],  // oldest first; [] when none
  "tags": [ …Tag ]                 // workspace tags on this row, by name; [] when none
}
```
No `color` on the category/profile sub-objects; no `sortOrder` on the sub-object.
`user` is author attribution — show it in shared workspaces (more than one user),
hide it in solo ones. `attachments.length` drives the 📎 indicator.

### Tag
A workspace-scoped label. Any number of transactions can carry a tag, and a
transaction can carry up to 10 — `tags` above is the resolved list, and
`tagIds` on create/update is how you set it. Shared by every member of the
workspace, like categories, and managed through **`/tags`** (6.2.0). Distinct
from the vault's per-profile file tags (`/file-tags`), which are a different
entity in a different table.
```jsonc
{
  "id": "uuid",
  "name": "Travel",          // ≤ 20 chars, unique per workspace (case-insensitive)
  "color": "#ef4444",        // 6-digit hex from a fixed 20-swatch palette
  "createdAt": "2026-09-22T10:00:00.000Z",
  "updatedAt": "2026-09-22T10:00:00.000Z"
}
```

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
  "spaceId": "uuid",           // the space it lives in (6.5.0)
  "access": "read" | "write" | "admin",  // the caller's effective access (6.5.0)
  "createdAt": "…", "updatedAt": "…"
}
```
`access` is resolved from the workspace role, the space role, any per-profile
override and any per-profile grant: `read` = viewer (see it), `write` = editor
(add/edit its transactions and files), `admin` = manage the profile. In a
view-only workspace every profile is `read`. Drive per-profile actions from it
rather than from the workspace `role`.

### Space (6.5.0)
```jsonc
{
  "id": "uuid",
  "name": "Main",              // ≤ 30 chars, unique per workspace
  "icon": "🗂️" | null,
  "position": 0,               // order within the workspace
  "profileCount": 1,           // every live profile in the space (what the per-space cap counts)
  "trashedProfileCount": 0,    // 6.7.0: its profiles in the trash — admins only (0 otherwise)
  "role": "admin" | "editor" | "viewer" | null
}
```
`role` is `admin` for workspace admins (who see every space), otherwise the
caller's space role — or `null` when the space is visible only because they
reach one of its profiles another way (an override or a per-profile grant).

### SpaceAccess (6.5.0, admin only)
```jsonc
{
  "space": { "id": "uuid", "name": "Main", "icon": "🗂️" | null, "workspaceId": "uuid" },
  "members": [                 // every workspace member, owner first
    { "userId": "uuid", "name": "Ada" | null, "email": "a@b.com" | null,
      "workspaceRole": "admin" | "editor" | "viewer",
      "spaceRole": "editor" | "viewer" | null,   // null = not in the space; always null for admins
      "isOwner": true }
  ],
  "profiles": [ { "id": "uuid", "name": "Personal", "icon": "👤" | null } ],
  "overrides": [ { "profileId": "uuid", "userId": "uuid", "access": "none" | "read" | "write" } ],
  "canEditOverrides": false    // the plan lets overrides be changed (Plus/Pro); existing ones always apply
}
```

### ProfileOverride (6.5.0)
```jsonc
{ "userId": "uuid", "access": "none" | "read" | "write" }
```
An override replaces a member's space role on one profile: `none` hides it
inside their space; `read` / `write` open it even in a space they're not in.

### Organization (6.5.0)
```jsonc
{
  "id": "uuid",
  "name": "Ada's organisation",          // ≤ 40 chars
  "kind": "personal",                    // "business" is reserved for later
  "owner": { "id": "uuid", "name": "Ada" | null, "email": "a@b.com" | null },
  "workspaces": [                        // the workspaces in it, oldest first
    { "id": "uuid", "name": "Ada's Workspace", "icon": "🏢" | null,
      "plan": "free" | "plus" | "pro",
      "readOnly": false,                 // an extra free workspace (owner has an older free one)
      "canOpen": true }                  // the caller can open it (send as X-Workspace-Id)
  ]
}
```

### Usage (6.5.0, from `GET /usage`)
```jsonc
{
  "plan": "free" | "plus" | "pro",
  "readOnly": false,           // view-only (extra free workspace) — render read-only
  "ai": { "used": 12, "limit": 50, "remaining": 38, "topUpRemaining": 0,
          "resetsAt": "2026-11-01T00:00:00.000Z" },   // first instant of next month, UTC
  "storage": { "usedBytes": 52428800, "limitBytes": 1073741824,
               "trashBytes": 1048576 },  // 6.7.0: the part of usedBytes in the trash
  "members":    { "used": 1, "limit": 3 },   // people incl. pending invites
  "spaces":     { "used": 1, "limit": 2 },
  "categories": { "used": 10, "limit": 20 }, // the 10 seeded defaults count
  "tags":       { "used": 2, "limit": 5 },   // the 2 seeded defaults count
  "budgets":    { "used": 1, "limit": 5, "unlimited": false }, // 6.8.0; Pro: unlimited → show "Unlimited"
  "profilesPerSpace": 3,       // compare with each Space.profileCount
  "voice": false,              // POST /ai/transcribe available
  "profileLevelAccess": false  // per-profile overrides can be changed
}
```
`used` can exceed `limit` (a downgraded workspace keeps what it has) — it just
can't add more until it's back under.

### Split models (6.9.0 — user-scoped, outside every workspace)
Every amount is in the **group's** currency (`currency`), as `…Minor` integers
plus a major-unit string. Balances are positive when someone **is owed**,
negative when they **owe**.
```jsonc
// SplitGroup — GET /split/groups
{ "id": "uuid", "name": "Goa trip", "icon": "🏖️" | null, "currency": "INR",
  "isCreator": true, "peopleCount": 4,          // invited + joined, you included (max 50)
  "myBalanceMinor": -3333, "myBalance": "-33.33", "createdAt": "…" }

// SplitGroupDetail — GET /split/groups/{id}
{ "id": "uuid", "name": "Goa trip", "icon": null, "currency": "INR",
  "createdAt": "…", "updatedAt": "…",
  "me": { "memberId": "uuid", "isCreator": false },
  "members": [                                  // active people, then former members who still have a balance
    { "id": "uuid", "name": "Ravi",
      "email": "ravi@x.com" | null,             // only for the creator, and on your own row
      "status": "invited" | "joined" | "left",
      "isCreator": true, "isYou": false,
      "balanceMinor": 6666, "balance": "66.66",
      "inviteLink": "https://…/invite/split/<token>" | null } // creator only, for everyone still invited
                                                // (account or not); works only for that email
  ],
  "suggestions": [                              // payments that square everyone, biggest first
    { "fromMemberId": "uuid", "toMemberId": "uuid", "amountMinor": 3333, "amount": "33.33" }
  ],
  "peopleCount": 3, "maxPeople": 50,
  "hasActivity": true }                         // any expense/payment yet — the currency is fixed from then on

// SplitExpense
{ "id": "uuid", "title": "Dinner", "amountMinor": 10000, "amount": "100.00",
  "splitType": "equal" | "exact" | "percent", "occurredOn": "2026-10-01",
  "createdAt": "…", "updatedAt": "…",
  "paidBy": { "memberId": "uuid", "name": "Ravi" },   // the main payer (paid the most)
  "payers": [ { "memberId": "uuid", "name": "Ravi", "amountMinor": 10000,
                "amount": "100.00" } ],         // everyone who paid, the most first
  "shares": [ { "memberId": "uuid", "name": "Ravi", "amountMinor": 3334, "amount": "33.34",
                "percent": null } ],            // percent splits: the percent entered
  "canEdit": true,                              // you added it, or you created the group
  "myShare": { "shareId": "uuid", "amountMinor": 3333, "amount": "33.33",
               "added": false, "addedAt": null,
               "changedSinceAdded": false } | null }  // added, then the expense changed → "Update my entry"
// myShare stays (amountMinor 0, added true) when you're taken off an expense you'd
// added → "Remove from my workspace". `shares` never lists 0 rows.

// SplitSettlement ("Mark as paid")
{ "id": "uuid", "from": { "memberId": "uuid", "name": "Asha" },
  "to": { "memberId": "uuid", "name": "Ravi" },
  "amountMinor": 3333, "amount": "33.33", "settledOn": "2026-10-02",
  "createdAt": "…", "canDelete": true }

// SplitInvitation — GET /split/invitations (nothing inside the group until you join)
{ "memberId": "uuid", "groupId": "uuid", "groupName": "Goa trip", "groupIcon": null,
  "currency": "INR", "inviterName": "Ravi" | null, "peopleCount": 4, "invitedAt": "…" }

// SplitAddedPerson — returned to the creator when people are added
{ "memberId": "uuid", "email": "zoe@x.com", "status": "invited" | "already" }
```
`status`: **`invited`** — they're in the group as invited. Deliberately the
same whether or not the address has an account (an account holder sees an
in-app invitation; anyone else gets **one** email, within daily caps): nothing
in the API tells the two apart, so adding people is no way to learn who uses
SpendChat. Every invited person has an `inviteLink` for the creator to share.
**`already`** — they were already in the group (the same inbox — `+tags` and
Gmail dots don't make a new person).

### Trash models (6.7.0)
```jsonc
// TrashedTransaction — a Transaction plus:
{ /* …Transaction fields… */
  "deletedAt": "2026-10-06T23:18:04.123Z",
  "deletedBy": { "id": "uuid" | null, "name": "Asha" | null },
  "purgeAt": "2026-11-05T23:18:04.123Z",   // deletedAt + 30 days
  "canRestore": true }                      // editor on its profile
// TrashedFolder
{ "id", "profileId", "profileName", "profileIcon", "name", "color",
  "folders": 1, "files": 3, "sizeBytes": 1048576,   // what went with it
  "deletedAt", "deletedBy": { "id", "name" }, "purgeAt", "canRestore" }
// TrashedFile
{ "id", "profileId", "profileName", "profileIcon", "folderId", "name",
  "contentType", "sizeBytes", "deletedAt", "deletedBy": { "id", "name" }, "purgeAt", "canRestore" }
// TrashedProfile (admins)
{ "id", "name", "icon", "color", "spaceId", "spaceName",
  "transactions": 120, "files": 3,   // live contents — what a restore brings back into view
  "sizeBytes": 1048576,              // every byte stored under it, trash included: what deleting it for good frees
  "deletedAt", "deletedBy": { "id", "name" }, "purgeAt" }
// deletedBy is the same shape on all four trash items; name is null when the account is gone.
```

### Budget (6.8.0, from `/budgets`)
```jsonc
{
  "id": "uuid",
  "scope": "workspace" | "space" | "profile" | "category",   // space: since 6.10.0
  "profileId": "uuid" | null,     // set when scope = profile
  "categoryId": "uuid" | null,    // set when scope = category (an expense category)
  "spaceId": "uuid" | null,       // set when scope = space (6.10.0)
  "title": "Groceries this month",  // what people call it, ≤ 60 (6.10.0)
  "description": "Cook at home more" | null,  // optional note, ≤ 140 (6.10.0)
  "label": "Groceries",           // what it covers: "Whole workspace", or the space's / profile's / category's name
  "icon": "🛒" | null,            // the space's / profile's / category's emoji
  "period": "monthly",
  "amountMinor": 500000,          // the monthly limit, minor units
  "emailAlerts": true,            // email admins + the creator at 80% / 100%
  "month": "2026-10",             // the month spentMinor is for
  "spentMinor": 412000,           // that month's expenses in scope (income never offsets)
  "percent": 82,                  // floor(spent × 100 / amount); can pass 100
  "status": "ok" | "warn" | "over",  // warn ≥ 80%, over ≥ 100% — draw your alert from this
  "canManage": true,              // the caller can PATCH it (false in a view-only workspace)
  "canDelete": true,              // the caller can DELETE it: same reach as canManage, not blocked by view-only
  "createdBy": "uuid",
  "createdAt": "2026-10-06T10:00:00.000Z",
  "updatedAt": "2026-10-06T10:00:00.000Z"
}
```
Spending counts **expenses only**, in the calendar month of each transaction's
`occurredOn`, across **every** profile the budget covers (a category budget
covers that category in all profiles; a space budget covers every live profile
in the space **as it is now** — a profile moved to another space takes its
month with it). A space budget is deleted with its space, like a category
budget with its category. A budget is listed only to admins and to
people who can **read every profile it covers** — the same number for everyone
who sees it. Alerts in the app are yours to draw from `status`; the server
emails admins and the budget's creator (while they can manage it) once per
budget, per threshold, per month — again only if the amount is raised past the
one it fired at — within a workspace pool of 30 alert emails a month. Nothing
in the trash counts, and a budget on a profile in the trash is hidden (and
doesn't count toward the plan) until the profile is restored.

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
  "currencyDetail": { "code": "USD", "symbol": "$", "decimals": 2 },
  "plan": "free" | "plus" | "pro",     // 6.5.0 — limits are per workspace (GET /usage)
  "organizationId": "uuid"             // 6.5.0 — the organisation holding it
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
`TransactionInput` for `POST /transactions/bulk` — drop `categoryName` and
`tagNames` (both display conveniences), add `profileId` if the user picked a
profile.
```jsonc
{
  "type": "income" | "expense",
  "amount": 250,                        // major units, > 0, within input limits
  "title": "Fruits",                    // ≤ 40 chars, never empty; first letter sentence-cased by the server
  "description": "June bill" | null,    // ≤ 150 chars; sentence-cased the same way
  "categoryId": "uuid" | null,          // an existing workspace category of this type, or null
  "categoryName": "Food" | null,        // its exact stored name (same match as categoryId)
  "tagIds": ["uuid"],                   // existing workspace tags: "#" markers plus any the model inferred (6.3.0; inference 6.4.0)
  "tagNames": ["Travel"],               // the same tags by name (same match as tagIds) (6.3.0)
  "occurredOn": "2026-07-29"            // defaults to "today" in your timezone; never future
}
```

### `meta`
- Currency block (analytics + lists): `{ "currency": { "code", "symbol", "decimals" } }`.
- List pagination adds `{ "total", "limit", "offset", "currency" }`.
- `GET /files` adds `{ "storage": { "usedBytes", "limitBytes" } }` — the
  workspace's stored bytes (vault files + transaction attachments) against its
  quota. `limitBytes` is the workspace **plan's** storage — 1 / 5 / 20 GB on
  Free / Plus / Pro (a flat 1 GB before 6.5.0), the same value as
  `GET /usage` → `storage.limitBytes`. Workspace-wide even when `?profile=`
  scopes the list.

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
| `GET /workspaces` | — | 200 `data: WorkspaceSummary[]` | Every workspace the user can open (for a switcher). **Ignores `X-Workspace-Id`; never 404s.** Memberships first (`createdAt asc`), then grant-only (`role: null`). Always ≥1. Item shape = the `Workspace` object (`{ id, name, icon, role, currency, locale, currencyDetail, plan, organizationId }`, same as `/me`'s `workspace`). |
| `POST /workspaces` | `WorkspaceInput` `{ name, icon? }` | 201 `data: WorkspaceSummary` | Caller becomes **admin** (`role` always `"admin"`); seeds a default "Personal" profile + the default category list (10) and tag list (2); inherits the creator's current currency/number format; becomes the current workspace (server persists `lastWorkspaceId`). `icon` is an optional emoji (omitted/empty → default 🏢). Ignores `X-Workspace-Id`. Starts on **Free**; a caller who already owns a free workspace gets **403 `plan_limit`** (`freeWorkspaces`, `max: 1`, `upgradeTo: "plus"`) and nothing is created. 400 bad JSON; 422 blank/long name. |
| `PATCH /workspaces/{id}` | `WorkspaceCurrencyPatch` `{ currency, locale }` | 200 `data: WorkspaceSummary` | Set the workspace's currency + number format (every member sees it). **Admin only** → 403 otherwise. Uses the path `id`, not `X-Workspace-Id`. 400; 404; 422 unsupported currency. |

### Organization (6.5.0 — ignores `X-Workspace-Id`)
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /organization` | — | 200 `data: Organization` | The caller's personal organisation (every account has exactly one, created at first sign-in): name, owner, and every workspace in it with its `plan`, `readOnly` and `canOpen`. |
| `PATCH /organization` | `{ name }` (1–40, trimmed) | 200 `data: Organization` | Rename it (the caller owns it by definition). 400 bad JSON; 422 blank/long name. |

### Usage (6.5.0 — current workspace via `X-Workspace-Id`)
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /usage` | — | 200 `data: Usage` | The workspace's plan, every limit and how much is used (AI actions this month, storage, members, spaces, categories, tags, budgets), the per-space profile cap, and the `voice` / `profileLevelAccess` feature flags. `readOnly: true` → render the workspace view-only. Readable by anyone who can open the workspace. |

### Budgets (6.8.0 — current workspace via `X-Workspace-Id`)
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /budgets?month=YYYY-MM` | — | 200 `data: Budget[]`, `meta: { month, currency }` | The budgets the caller can see, the whole workspace first, then profiles, then categories. `month` defaults to the current **UTC** month — send the device's own month. 422 bad `month`. |
| `POST /budgets` | `BudgetInput` | 201 `data: Budget` | One per scope (one per space, profile, category) → **409**. **403 `plan_limit`** (`limit: "budgets"`) past the plan's cap; **403** without write access to every profile it covers; **403 `plan_limit` `freeWorkspaces`** in a view-only workspace. 422 income category, a space/profile/category not in this workspace (or one you can't see), bad amount, bad title/description. No `title` → the suggested one. Accepts `?month=` for the returned progress. |
| `PATCH /budgets/{id}` | `{ amount?, emailAlerts?, title?, description? }` (≥1; `description: null` or `""` clears it) | 200 `data: Budget` | What it covers is fixed. 404 when the caller can't see it; 403 when they can see but not manage it. A threshold that already fired this month fires again only for an amount above the one it fired at. Accepts `?month=`. |
| `DELETE /budgets/{id}` | — | 200 `data: { id, deleted: true }` | 404 / 403 as above. Not blocked by a view-only workspace (`canDelete`). |

### Transactions
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /transactions` | — | 200 `data: Transaction[]`, `meta: { total, limit, offset, currency }` | Newest first (`occurredOn desc, createdAt desc, id desc`). The `id` tiebreaker makes the order **total**, so `limit`/`offset` paging can't repeat or skip rows that tie on time (a bulk batch is written in one statement, so it always shares `createdAt` and often `occurredOn` too). Filters + paging (§5). |
| `POST /transactions` | `TransactionInput` | 201 `data: Transaction` | 422 validation; **403** "You don't have permission to add transactions in this workspace" (no writable profile) |
| `GET /transactions/{id}` | — | 200 `data: Transaction` | 404 "Transaction not found" (also when the id lives in another workspace — workspace-scoped) |
| `PATCH /transactions/{id}` | `TransactionInput` (full body) | 200 `data: Transaction` | Full replacement of mutable fields. Workspace-scoped (cross-workspace id → 404). 422; 404; 403 (editor role required on its profile; also on target profile if `profileId` changes) |
| `DELETE /transactions/{id}` | — | 200 `data: { id, deleted: true, trashed: true }` | **Moves it to the trash** (6.7.0) — out of every read, restorable for 30 days with `POST /trash/restore`; its attachments stay with it. Workspace-scoped (cross-workspace id → 404). 422 "Invalid transaction" (non-UUID); 404 (also for a row already in the trash); 403 (editor) |
| `POST /transactions/bulk` | `{ items: TransactionInput[] }` (1–500) | 201 `data: { count }` | 422; 403. Unknown categoryId → null; non-writable profileId → default profile |
| `GET /transactions/export` | — | 200 `text/csv` | **Not the JSON envelope.** Filters only (no paging; max 5000 rows). Text cells that look like formulas are apostrophe-prefixed. See § CSV. |
| `POST /transactions/delete-all` | `{ confirm: "DELETE", profileIds?: string[] }` | 200 `data: { deleted, trashed: true }` | **Workspace admins only** (403 otherwise). 400 "Type DELETE to confirm" if `confirm !== "DELETE"`. Moves **every** live transaction (any author) in the selected profiles of the current workspace **to the trash** (6.7.0; restorable for 30 days); `profileIds` omitted/empty clears **all** profiles in the workspace (ids outside it are ignored). |

### Attachments (receipts / bills / invoices on a transaction)
Access is inherited from the transaction's profile: **viewer** to see/fetch,
**editor** to upload/edit/delete. Metadata is embedded on every `Transaction`
(`attachments`); these endpoints manage it and mint download URLs. Limits: **2
files per transaction**, **5 MB per file**, types JPEG/PNG/WebP/GIF/PDF/Word/
Excel/CSV/plain text — and uploads count toward the workspace's **storage
quota** (its plan's storage, 1 / 5 / 20 GB; shared with the files vault; 413
`storage_quota_exceeded` when the batch doesn't fit, with `PlanLimitDetails`). `503 storage_unavailable` on all of them when the server
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
workspace's **storage quota** — its plan's storage, 1 / 5 / 20 GB (vault files
+ transaction attachments together; 413 `storage_quota_exceeded` when the batch
doesn't fit — `GET /files` reports usage in `meta.storage`). The predefined
**"Transaction attachments"** folder (`system: true`, one per profile) accepts
only color + tags — rename/move/delete/share/upload-into are 400s.
`503 storage_unavailable` on upload/url when file storage isn't configured.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /files` | — | 200 `data: { folders, files, transactionFiles, tags }`, `meta: { filesCapped, filesLimit, storage }` | The whole working set in one call (mirrors the web page load). Files newest first, capped at `filesLimit` (500) — `filesCapped: true` → narrow by profile. `storage` = workspace usage vs the plan's storage (see § meta). Also lazily creates the predefined folder for each profile the caller can **write** to — a viewer's read never creates rows, so a view-only user may not see it until an editor opens the vault (their transaction files are still returned in `transactionFiles`). |
| `POST /files` | **multipart** — `profileId` (required), `folderId?`, files under `files` (repeatable; `file` works too), optional `thumb_<index>` webp preview per file | 201 `data: VaultFile[]` | Editor. `<index>` counts file parts in send order (`files` before `file`) and is **not** renumbered around non-file parts. 400 no files / > 10 / predefined-folder destination; **413** file **or preview** > 5 MB (`payload_too_large`) or workspace quota exceeded (`storage_quota_exceeded`); 404 profile/folder not reachable |
| `PATCH /files/{id}` | `{ name?, category?, tagIds?, folderId? }` (≥1; `category: null` clears, `folderId: null` → root) | 200 `data: VaultFile` | Editor. 400 "Nothing to update"; 422; 404 |
| `DELETE /files/{id}` | — | 200 `data: { id, deleted: true, trashed }` | Editor. **Plus/Pro** (6.7.0): `trashed: true` — the file goes to the trash for 30 days (bytes kept, still counted toward storage; its share links stop working until it's restored). **Free**: `trashed: false` — removed for good with its stored object, preview and share links. 422 non-UUID; 404 |
| `GET /files/{id}/url` | — | 200 `data: { url, expiresInSeconds, fileName, contentType }` | Viewer. Same contract as `GET /attachments/{id}/url` (`?variant=thumb`, `?download=1`; ~5 min TTL; GET without the Authorization header). **Inline only for previewable types** — images, PDF, text/CSV/Markdown, and **every `video/*` or `audio/*` type the server recognizes** (don't hard-code the list: it's whatever `contentType` comes back as for a media file, currently 23 types incl. `video/x-m4v`→`video/mp4`, `video/3gpp2` and `audio/webm`). Anything else is served `attachment` even without `?download=1`, since the vault takes any MIME type and a stored HTML/SVG must never render in a WebView. Media is inline across the board because media bytes go to the decoder, never to a document parser. Whether a given container actually plays is the **player's** call — expect a decode failure on some formats and fall back to a download. The URL also carries a `Content-Type` matching the `contentType` in the response, so a file stored before its container could be named still arrives typed. `?variant=thumb` is always inline. 404 |
| `POST /folders` | `{ profileId, name, parentId?, color?, tagIds? }` | 201 `data: Folder` | Editor. 409 duplicate sibling name (case-insensitive); 400 predefined-folder parent; 422; 404 |
| `PATCH /folders/{id}` | `{ name?, color?, tagIds?, parentId? }` (≥1; `parentId: null` → root, `color: null` clears) | 200 `data: Folder` | Editor. Predefined folder: color+tags only (400 otherwise). 400 move-into-own-subtree / "Nothing to update"; 409 duplicate name; 422; 404 |
| `DELETE /folders/{id}` | — | 200 `data: { id, deleted: true, trashed }` | Editor. The whole subtree goes: on **Plus/Pro** (6.7.0) to the trash as one item (`trashed: true`, restorable together); on **Free** for good (`trashed: false` — nested folders, files, stored objects, share links). 400 predefined folder; 422; 404 |
| `GET /file-tags` | — | 200 `data: FileTag[]` | Viewer. Name-ascending; `?profile=` scopes. (Also included in `GET /files` — this is for pickers.) |
| `POST /file-tags` | `{ profileId, name, color }` | 201 `data: FileTag` | Editor. 409 duplicate name per profile (case-insensitive); 422 |
| `PATCH /file-tags/{id}` | `{ name?, color? }` (≥1) | 200 `data: FileTag` | Editor. Every referencing item updates at once. 409; 422; 404 |
| `DELETE /file-tags/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Detaches from every file/folder first. 422; 404 |
| `GET /file-shares` | — (query `fileId` **or** `folderId`, exactly one) | 200 `data: FileShare[]` | **Editor** (tokens grant public access). Newest first, **active links only** — an expired one is omitted, since its token no longer opens the share page. 422 neither/both; 404 |
| `POST /file-shares` | `{ fileId? \| folderId?, allowDownload?, expiresInDays? }` | 201 `data: FileShare` | Editor. Exactly one target (422). Folder link shares the whole subtree; 400 predefined folder. Build the link as `<web-origin>` + `sharePath`. `allowDownload: false` is enforced as *no bytes leave except as a preview the browser renders* — the share page serves playable media and previewable documents inline, and 403s anything else (a `.avi`/`.wmv` "preview" would just be a download). |
| `DELETE /file-shares/{id}` | — | 200 `data: { id, deleted: true }` | Editor. Token stops working immediately. 422; 404 |

### AI (assisted entry — both endpoints cost money server-side, so they're extra-gated)
Both require the **editor** role (403 for viewers — hide the UI) and share the
per-person **`ai` rate limit** (429 `rate_limited` + `Retry-After`, checked
first — §1 · Rate limits; it replaced the 30 calls/hour quota in 6.6.0). Since
6.5.0 both also spend the workspace's **monthly AI allowance** — 50 / 300 /
1,000 AI actions per UTC calendar month on Free / Plus / Pro (`GET /usage` →
`ai`); once it's spent the call is **403 `plan_limit`**, `limit: "aiActions"`,
until `ai.resetsAt`. A typed parse costs one action; a transcription costs one
per started minute of the clip and also pays for parsing its transcript (send
that parse with `source: "voice"`). Voice entry is **Pro** only — elsewhere
transcribe is **403 `plan_limit`**, `limit: "voice"`. `503 ai_unavailable` = that feature's model
isn't configured (treat as feature-off, like the web); `502 ai_failed` =
provider hiccup, offer retry — a call that fails on our side gives its actions
back. Neither writes any user data.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `POST /ai/parse` | `{ text, timezone?, source? }` — text ≤ 3000 chars (2000 before 6.5.0); timezone = IANA device zone (omitted → UTC); `source` = `typed` (default) \| `voice` (6.5.0; anything else → 422) | 200 `data: { drafts: AiDraft[], today }` | Free text → ≤ 50 reviewable drafts. **Nothing is saved** — user reviews/edits, then commit kept drafts via `POST /transactions/bulk`. Note hints: `/Category` picks a category (slash + a letter; a slash between digits is a date), `#Tag` tags it (hash + a letter, repeatable, max 10), `(parens)` → description, relative dates resolve against `timezone`. Since 6.4.0 the model **also infers** tags, so a draft may carry one the note never named — always a real workspace tag, and the user drops it in review. **Cost:** one AI action; a `source: "voice"` parse is free when the caller has an unclaimed paid transcription in this workspace from the last 15 minutes (each paid clip covers one), else charged like a typed note. 400 empty/too-long text, bad timezone, or nothing parseable ("I couldn't find any transactions in that…"); 403 `plan_limit` `aiActions` |
| `POST /ai/transcribe` | **multipart** — recording under `audio` (+ optional `mimeType` text field fallback) + `durationMs` (6.5.0, integer ms) | 200 `data: { text }` | Voice note → transcript (≤ 2400 chars) for the composer; user fixes it, then it goes through `/ai/parse` (with `source: "voice"`) like a typed note. Audio is discarded, never stored. Accepted: webm/ogg/mp4(m4a)/mpeg/wav; ≤ 4 MB and up to **2 minutes** (cap recording at 120 s; 60 s before 6.5.0). **Cost:** one AI action per started minute of `durationMs` (clamped to 120000; 61 s → 2); omitted → charged as a full two minutes, so always send it; malformed/negative → 400. **403 `plan_limit`** `voice` off Pro, `aiActions` when the allowance is spent. Languages guided by `settings.voiceLanguages`; amounts come back as digits. **413** when the request's `Content-Length` alone exceeds 4 MB (refused before the body is read); 400 bad/empty/oversized audio or no speech — a 400 on format/size/emptiness costs **no AI action** (those checks precede the role + allowance gates), though like any request it counts once against the `ai` rate limit. 413 and 400 mean the same thing here (recording too long) and differ only in whether the client declared its size |

### Categories (scoped to the current workspace via `X-Workspace-Id`)
Shared by every member of the workspace. Reads need workspace access; writes
require the **editor** role (viewer → 403). Switching `X-Workspace-Id` changes
the list.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /categories` | — | 200 `data: Category[]` | The current workspace's list, `kind asc, name asc` (income first). |
| `POST /categories` | `CategoryInput` `{ name, kind, icon? }` | 201 `data: Category` | Editor+ with edit access to at least one profile (403 otherwise; 6.5.0). 422; 409 "A category with that name already exists" (unique per workspace+kind); **403 `plan_limit`** `categories` at the plan's cap (20 / 30 / 50 — the 10 seeded defaults count; deleting one frees a slot) |
| `PATCH /categories/{id}` | `{ name?, icon? }` | 200 `data: Category` | Workspace admin, or an editor with edit access to **every** profile (403 otherwise; 6.5.0 — the change reaches every transaction). 422; 404 "Category not found"; 409 duplicate name |
| `DELETE /categories/{id}` | — | 200 `data: { id, deleted: true }` | Workspace admin, or an editor with edit access to **every** profile (403 otherwise; 6.5.0 — the change reaches every transaction). Referencing transactions get `categoryId = null`. 422; 404 |

### Tags (scoped to the current workspace via `X-Workspace-Id`)
Transaction tags: shared by every member of the workspace. Reads need workspace
access; writes require the **editor** role (viewer → 403). A new workspace
is seeded with two tags, "Recurring" and "Reimbursable" (since 6.5.0; it
started with none before). The plan caps tags per workspace (5 / 10 / 20 on
Free / Plus / Pro; the seeded defaults count).

Transactions reference tags by id, so a rename or recolor here shows on every
transaction carrying it without touching a transaction.

| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /tags` | — | 200 `data: Tag[]` | The current workspace's list, ordered by `lower(name)`. |
| `POST /tags` | `TagInput` `{ name, color }` | 201 `data: Tag` | Editor+ with edit access to at least one profile (403 otherwise; 6.5.0). 422; 409 "A tag with that name already exists" (unique per workspace, case-insensitive); **403 `plan_limit`** `tags` at the plan's cap (5 / 10 / 20); 409 "This workspace already has 100 tags" (a hard ceiling only a workspace already over its plan can reach) |
| `PATCH /tags/{id}` | `{ name?, color? }` | 200 `data: Tag` | Workspace admin, or an editor with edit access to **every** profile (403 otherwise; 6.5.0 — the change reaches every transaction). 422 (including an empty body — "Nothing to update"); 404 "Tag not found"; 409 duplicate name |
| `DELETE /tags/{id}` | — | 200 `data: { id, deleted: true }` | Workspace admin, or an editor with edit access to **every** profile (403 otherwise; 6.5.0 — the change reaches every transaction). Deletes the tag **and** removes its id from every transaction in the workspace, in one database transaction. 422 (non-uuid id); 404 |

### Profiles (RBAC: 404 = no access, 403 = role too low)
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /profiles` | — | 200 `data: Profile[]` | Accessible profiles in workspace, `sortOrder asc, createdAt asc`. Each carries `spaceId` and the caller's `access` (6.5.0). |
| `POST /profiles` | `ProfileInput` `{ name, icon?, color?, spaceId? }` | 201 `data: Profile` | Requires **admin**. `spaceId` (6.5.0) = a space of the current workspace (404 otherwise); omitted → the first space. **403 `plan_limit`** `profilesPerSpace` when that space is full (3 / 5 / 10). 422; 409 duplicate name; 403/404 |
| `PATCH /profiles/{id}` | `{ name?, icon?, color? }` | 200 `data: Profile` | Requires **admin** on the profile. 422; 404; 409; 403 (`plan_limit` `freeWorkspaces` in a view-only workspace) |
| `DELETE /profiles/{id}?transactions=&to=` | — | 200 `data: { id, deleted: true, trashed: true }` | Requires admin. **The profile goes to the trash as one unit** (6.7.0) — restorable for 30 days by a workspace admin with `POST /trash/restore` (`profileIds`), everything in it coming back with it. `transactions` = `delete` (they go to the trash with the profile), `move` (re-file live **and** trashed ones, plus the vault, under `to` first; the empty profile then goes to the trash), or **`reject`, the default** — 409 "Move this profile's transactions to another profile first" while any **live** ones remain, and on **Free** 409 while any live vault files remain (they'd be deleted for good — send `delete` to confirm, or `move`). An **empty value is treated as absent** (`?transactions=` = the default; `&to=` = not given). 422 when `transactions=move` without `to`. Always **409 "You need at least one profile"** for the last live one. **The vault**: `move` re-files its files, folders, tags and share links under `to`; on `delete` it stays with the trashed profile on **Plus/Pro** and is **deleted for good on Free** (`deletion-impact` → `filesRecoverable`). A destination tag whose name matches one being moved is **merged** into it (the moved tag's id disappears). A trashed profile's name is free to reuse at once. 404 (also for a profile already in the trash); 403 |
| `GET /profiles/{id}/deletion-impact` | — | 200 `data: { transactions, files, attachments, filesRecoverable }` | Requires admin. Counts for the confirm step (live rows only — anything already in the trash goes along silently): `transactions` is what `?transactions=` decides the fate of; `attachments` are the receipts on those transactions and `files` the vault. `filesRecoverable` (6.7.0) is false on Free, where `delete` removes the vault for good — word the warning from it. Offer the choice whenever `transactions > 0` **or** `files > 0`. 422; 404; 403 |
| `POST /profiles/reorder` | `{ ids: uuid[] }` (1–200, full list — 6.5.0 raised it from 100: Pro allows 15 spaces × 10 profiles) | 200 `data: Profile[]` | Requires **admin** (like all profile management). 422; 403/404 |
| `POST /profiles/{id}/move` | `{ toProfileId: uuid }` | 200 `data: { moved }` | Requires **editor** on both; same workspace. 422 "Invalid profiles" (bad/equal/cross-workspace ids); 403/404 |
| `POST /profiles/{id}/space` | `{ spaceId: uuid }` | 200 `data: Profile` | 6.5.0. Move the profile into another space of **its** workspace (path id decides; header ignored). Workspace **admin**. Who sees it follows the new space's members, plus anyone with an override on the profile (overrides move with it). Same space → no-op. **403 `plan_limit`** `profilesPerSpace` when the destination is full; 422 malformed id/`spaceId`; 404 space not in that workspace |
| `GET /profiles/{id}/overrides` | — | 200 `data: ProfileOverride[]` | 6.5.0. Overrides on this profile, oldest first — non-admin members only (admins see everything). Workspace **admin**. 422 malformed id; 403; 404 |
| `PUT /profiles/{id}/overrides` | `{ userId, access: "none" \| "read" \| "write" \| null }` | 200 `data: ProfileOverride[]` (after the change) | 6.5.0. Set one member's override, or clear it with `null` (back to their space role). Workspace **admin**; target must be a non-admin member (400 otherwise). **Plus/Pro only** — on Free **403 `plan_limit`** `profileLevelAccess` (existing overrides keep applying after a downgrade; on Free one that exists can still be narrowed — set to `none`, or cleared when that opens nothing up — while creating or widening one is refused). 422; 404 |

### Spaces (6.5.0 — current workspace via `X-Workspace-Id`)
Profiles live in spaces; the space is the unit of sharing. Workspace admins see
and manage every space; other members only read the spaces they're in. Item
endpoints are **scoped to the current workspace**: an id from another
workspace is a 404, a malformed one a 422. Everything but `GET /spaces` needs
the workspace **admin** role (403 otherwise).
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /spaces` | — | 200 `data: Space[]` | Visible spaces in `position` order. Admins: every space (`role: "admin"`). Others: their spaces at their space role, plus any space holding a profile they reach via an override/grant (`role: null`). |
| `POST /spaces` | `{ name, icon? }` | 201 `data: Space` | Appended at the end. 409 duplicate name; **403 `plan_limit`** `spaces` at the plan's cap (2 / 6 / 15, the default space included); 422 |
| `PATCH /spaces/{id}` | `{ name?, icon? }` (≥ 1; `icon: ""`/`null` clears) | 200 `data: Space` | 409 duplicate name; 422 |
| `DELETE /spaces/{id}?moveProfilesTo=` | optional JSON `{ moveProfilesTo }` | 200 `data: { id, deleted: true }` | **Profiles are never deleted with a space.** Empty space → deleted. With profiles — **profiles in the trash included** (6.7.0, `trashedProfileCount`: restored, a profile shows to whoever is in its space, so the admin picks where they go) → needs `moveProfilesTo` (another space of this workspace; query param or body — the body wins; a blank `?moveProfilesTo=` = absent), else **409** "This space still has profiles — move them to another space first" (or, trashed ones only, "…choose a space for them first…"). The move and the delete commit together; the destination must have room for the **live** ones (**403 `plan_limit`** `profilesPerSpace`). The **last** space → 409. Membership rows go with it. 400 same space / bad JSON; 404 destination not in this workspace |
| `POST /spaces/reorder` | `{ ids: uuid[] }` (full ordered list, no duplicates) | 200 `data: Space[]` | 400 an id that isn't a space of this workspace; 422 duplicates |
| `GET /spaces/{id}/access` | — | 200 `data: SpaceAccess` | Members (with their space role), the space's profiles, overrides on them, and `canEditOverrides` (Plus/Pro). |
| `PUT /spaces/{id}/members` | `{ userId, role: "viewer" \| "editor" \| null }` | 200 `data: SpaceAccess` (after the change) | Add a workspace member to the space, change their role, or take them out (`null` — also clears their overrides on this space's profiles). Target must be a non-admin member (400 "Add them to the workspace first" / "Admins already see every space"). 422 |

### Split (6.9.0 — user-scoped; ignores `X-Workspace-Id`)
Groups for sharing costs between people, outside every workspace. **Only a
joined member can see a group** — strangers, people who left and invitees who
haven't joined all get **404**, so a group's existence never leaks. The creator
manages the group (403 for anyone else); every joined member adds expenses and
records payments. Ids in paths are uuids; a malformed one is a 404.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /split/groups` | — | 200 `data: SplitGroup[]` | Groups you've joined, newest first |
| `POST /split/groups` | `{ name, icon?, currency, members?: [{ email, name }] }` | 201 `data: { group: SplitGroupDetail, added: SplitAddedPerson[] }` | You become the creator. ≤ 49 people (50 with you). Same refusals as adding people (below); **429 `rate_limited`** past 20 new groups in 24 h (deleted ones count) |
| `GET /split/groups/{id}` | — | 200 `data: SplitGroupDetail` | 404 unless you've joined |
| `PATCH /split/groups/{id}` | `{ name?, icon?, currency? }` (≥ 1; `icon: null`/`""` clears) | 200 `data: SplitGroupDetail` | Creator only. Currency only while there are no expenses or payments (409 `conflict`) |
| `DELETE /split/groups/{id}` | — | 200 `data: { deleted: true }` | Creator only. Everything in the group goes; shares already added to workspaces stay there |
| `POST /split/groups/{id}/members` | `{ members: [{ email, name }] }` (1–49) | 200 `data: { group, added }` | Creator only. Account holders get an in-app invitation, anyone else one email — the response is `invited` either way. Someone you removed is re-invited on the same member id. Refused as a whole, before anything is written: 400 your own address (any spelling); 422 two spellings of one inbox; **409 `invite_cooldown`** someone who declined or left in the last 30 days (`details: { emails, until }`); **409 `conflict`** an inbox you already have 3 open invitations out to (`details: { emails }`); **429 `rate_limited`** past 100 people added in 24 h across your groups; **409 `split_group_full`** past 50 people (the creator included, every plan) |
| `DELETE /split/groups/{id}/members/{memberId}` | — | 200 `data: { removed: true }` | Creator only. **409 `settle_first`** while they have a balance; 400 yourself |
| `POST /split/groups/{id}/leave` | — | 200 `data: { left: true }` | **409 `settle_first`** while you have a balance; 400 for the creator (delete instead) |
| `GET /split/groups/{id}/expenses?limit=&offset=` | — | 200 `data: SplitExpense[]`, `meta: { total, limit, offset, currency: CurrencyMeta }` | Newest first (`occurredOn`, then created) |
| `POST /split/groups/{id}/expenses` | `{ title, amount, payers \| paidBy, occurredOn, splitType, memberIds \| shares }` | 201 `data: SplitExpense` | Any joined member. Who paid: `payers: [{ memberId, amount? }]` (several people; amounts for all — summing to `amount` — or for none, which divides it evenly by join order) or the older single `paidBy` — one of the two. Each payer is credited what they paid in balances. `equal` → `memberIds`; `exact` → `shares: [{ memberId, amount }]` summing to `amount`; `percent` → `shares: [{ memberId, percent }]` (≤ 2 dp) summing to 100. **The server computes every share.** Rounding: `equal` → leftover minor units go to the (main) payer first — whoever paid the most — then by join order; `percent` → shares rounded down, leftovers to the largest remainders first (ties: payer, then join order); `exact` → as entered. 422 for bad sums (neutral `message`; `details: { sumMinor, totalMinor }`, `{ bpSum }` or `{ paidSumMinor, totalMinor }`), both or neither of `payers`/`paidBy`, someone not in the group, or an amount that rounds to 0 minor units (¥0.4) |
| `GET /split/groups/{id}/expenses/{expenseId}` | — | 200 `data: SplitExpense` | |
| `PUT /split/groups/{id}/expenses/{expenseId}` | same as POST | 200 `data: SplitExpense` | Its author or the creator (403). People who left may stay on an expense they were already on |
| `DELETE /split/groups/{id}/expenses/{expenseId}` | — | 200 `data: { deleted: true }` | Its author or the creator |
| `GET /split/groups/{id}/settlements?limit=&offset=` | — | 200 `data: SplitSettlement[]`, `meta` as above | Newest first |
| `POST /split/groups/{id}/settlements` | `{ fromMemberId, toMemberId, amount, settledOn }` | 201 `data: SplitSettlement` | "Mark as paid" (no money moves). The creator records any payment; a member only one they made or received (403). Partial payments fine; 422 for an amount that rounds to 0 minor units |
| `DELETE /split/groups/{id}/settlements/{settlementId}` | — | 200 `data: { deleted: true }` | Whoever recorded it, or the creator |
| `GET /split/invitations?limit=&offset=` | — | 200 `data: SplitInvitation[]`, `meta: { total, limit, offset }` | Newest first; `limit` defaults to 20 here (max 100). Includes invitations sent to your email before you had an account |
| `POST /split/invitations/{memberId}/accept` | — | 200 `data: SplitGroupDetail` | 404 not yours / no longer open |
| `POST /split/invitations/{memberId}/decline` | — | 200 `data: { declined: true }` | Always allowed. The group's creator can't invite you back for 30 days |
| `POST /split/groups/{id}/expenses/{expenseId}/add-to-workspace` | `{ profileId, categoryId?, title?, occurredOn?, amount? }` | 201 `data: Transaction` | **Reads `X-Workspace-Id`** (the current workspace). Your share as one expense in a profile you can write to (403; `plan_limit` in a view-only workspace). Same currency → the share is the amount; different → `amount` in the workspace's currency is required (**422 `amount_required`**). **409** when this share is already in a workspace — it can be added again only after that transaction is permanently deleted. 404 no share in it, or the expense was deleted mid-add; 422 an amount that rounds to 0 |
| `DELETE /split/groups/{id}/expenses/{expenseId}/workspace-entry` | — | 200 `data: { removed: true }` | "Remove from my workspace" when you were taken off the expense after adding it (`myShare.amountMinor: 0`, `added: true`). Moves the linked transaction to the trash (restorable for 30 days) through the normal rules (403 without edit access there); one already in the trash is just let go. **409** while you still have a share, or when there's no entry |
| `PUT /split/groups/{id}/expenses/{expenseId}/workspace-entry` | `{ amount? }` | 200 `data: Transaction` | "Update my entry" when `myShare.changedSinceAdded`. Works in whichever workspace the entry lives (header ignored), through the normal transaction rules; only the amount changes. Same currency → the new share; different → `amount` in that workspace's currency (**422 `amount_required`**). **409** when the share isn't in a workspace any more — add it again instead — or when the entry (or its profile) is in the trash: restore it first. A trashed entry still counts as added (so add-to-workspace is a 409 too) |

### Trash (6.7.0 — current workspace via `X-Workspace-Id`)
Deleting a transaction (every plan), a file or folder (**Plus/Pro**) or a whole
profile moves it to the **trash** for **30 days**; a daily purge then deletes it
for good, so an item can outlive its 30 days by up to a day (`purgeAt` is the
earliest it can go; until it's actually gone it can be restored). **Every read
excludes the trash** — lists, totals, analytics, exports, search, `GET /files`,
single-item GETs (404) — and so does every write: editing, tagging, attaching
to or moving into something in the trash is a 404. A **trashed profile hides
everything in it** and is listed on its own (admins only). Trashed bytes still
count toward the workspace's storage until they're purged (`GET /usage` →
`storage.trashBytes`), and share links to anything in the trash stop working
until it's restored.

**Access**: viewers see trashed items on profiles they can view; **restore and
delete for good need editor** on the item's profile (`canRestore` says so per
item); profiles need the workspace **admin** role. Ids the caller can't act on
are **skipped and counted** (`skipped`), never an error.
| Method & path | Body | Success | Notes / errors |
|---|---|---|---|
| `GET /trash/transactions?limit=&cursor=` | — | 200 `data: TrashedTransaction[]`, `meta: { nextCursor, currency }` | Most recently deleted first. **Keyset-paged**: `limit` 1–200 (default 50); pass `meta.nextCursor` back as `cursor` (opaque string; `null` on the last page). 422 malformed cursor. Rows of a trashed profile aren't listed (the profile is). |
| `GET /trash/files` | — | 200 `data: { folders: TrashedFolder[], files: TrashedFile[], filesCapped }` | A folder carries everything that went to the trash with it (`folders`, `files`, `sizeBytes`) — those aren't listed on their own. `files` are files deleted by themselves (≤ 500, newest first); `filesCapped: true` → there are more. Empty on Free unless the workspace was downgraded with files still in it. |
| `GET /trash/profiles` | — | 200 `data: TrashedProfile[]` | Workspace **admins**; anyone else gets `[]`. |
| `POST /trash/restore` | `{ transactionIds?, fileIds?, folderIds?, profileIds? }` (each ≤ 500, ≥ 1 id overall) | 200 `data: { restored: { transactions, files, folders, profiles }, skipped }` | A transaction comes back as it was — a category or tag deleted meanwhile stays gone. A file goes back into its folder if that folder is live, else to the top level; a folder brings back what went to the trash *with* it (a parent still in the trash → top level; a taken name → "Name (restored)"). A profile brings back everything in it; it must fit its space's `profilesPerSpace` and the people it brings back must fit `members` — else **403 `plan_limit`**, checked before anything else in the request is restored (a taken name → "Name (restored)"). 422 empty/malformed selection. |
| `POST /trash/delete` | same as restore | 200 `data: { deleted: { … }, skipped }` | **Deletes for good** — rows and stored files; can't be undone. A folder takes everything under it. |
| `POST /trash/empty` | — | 200 `data: { deleted: { … }, remaining }` | Everything the caller can edit (and, for admins, trashed profiles). Bounded per request — **call again while `remaining > 0`**. 403 when the caller can edit nothing here. |

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

`BudgetInput` (6.8.0; `space`, `title`, `description` since 6.10.0):
- `scope` — `workspace | space | profile | category`, **required**.
- `spaceId` — uuid of a space you can see, **required** when `scope = space`
  (managing it needs write access to every live profile in it);
  `profileId` — uuid, **required** when `scope = profile`; `categoryId` — uuid
  of an **expense** category, **required** when `scope = category`.
- `title` — trimmed, 1–60, optional: without one the server uses the suggested
  title ("All spending this month", "Home space", "Groceries this month").
- `description` — trimmed, ≤ 140, optional; blank is stored as `null`.
- `amount` — the monthly limit, same rules as a transaction's `amount` (major
  units, `> 0`, `≤ 999,999,999.99`), **required**.
- `emailAlerts` — boolean, optional (default `true`).

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

`TagInput` / `TagUpdate`:
- `name` — string, trimmed, 1–20, **required** on create. Unique per workspace,
  case-insensitively.
- `color` — `^#[0-9a-fA-F]{6}$`, **required** on create; stored lowercased. The
  20-swatch palette the apps offer is a UI convention — the server takes any
  6-digit hex.
- On `PATCH`, both are optional but **at least one must be present** (an empty
  body is a 422, not a no-op).

`WorkspaceInput` — `name` (1–30, trimmed; "Workspace name is required" /
"…too long (max 30 characters)"), `icon?` (≤16 emoji; omitted/empty → default 🏢).
`CategoryInput` — `name` (1–20), `kind` (income|expense), `icon?` (≤16). **No `color`.**
`CategoryUpdate` — `name?` (1–20), `icon?` (≤16, nullable). **No `color`.**
`ProfileInput` — `name` (1–20), `icon?` (≤16), `color?` (≤32), `spaceId?` (uuid, 6.5.0).
`ProfileUpdate` — `name?` (1–20), `icon?` (≤16, nullable), `color?` (≤32, nullable).
`ProfileSpaceMove` — `{ spaceId (uuid, required) }`.
`ProfileOverrideInput` — `{ userId (uuid), access (none|read|write|null) }`, both required.
`SpaceInput` — `name` (1–30, trimmed; "Space name is required" / "…too long (max 30
characters)"), `icon?` (≤16).
`SpaceUpdate` — `name?` (1–30), `icon?` (≤16, nullable; `""` clears); at least one
("Nothing to update").
`SpaceReorder` — `{ ids (uuid[], 1–200, no duplicates — "Duplicate space in order") }`.
`SpaceMemberInput` — `{ userId (uuid), role (viewer|editor|null) }`, both required.
`OrganizationPatch` — `{ name (1–40, trimmed; "Organisation name is required" /
"…too long (max 40 characters)") }`.
`SettingsPatch` — subset of `{ theme (light|dark|system),
inputMode (amount_title|title_amount|combined), voiceLanguages (string[], each
2–8 chars, ≤ 20 entries; normalized server-side — see § Settings) }`; at least
one key.
`WorkspaceCurrencyPatch` — `{ currency (one of 59 codes), locale (2–20 chars) }`;
both required. Admin only (`PATCH /workspaces/{id}`).
`AiParseInput` — `{ text (1–3000 chars after trim, required — 2000 before 6.5.0),
timezone? (IANA name, e.g. "Asia/Kolkata"), source? (typed|voice, 6.5.0) }`.
`AttachmentMetaPatch` — `{ label? (≤ 80, nullable), kind?
(receipt|bill|invoice|other, nullable) }`; at least one key.
Attachment upload (multipart) — ≤ 2 files/transaction total, ≤ 5 MB each; types
JPEG, PNG, WebP, GIF, PDF, doc/docx, xls/xlsx, CSV, plain text. A generic
`application/octet-stream` part is resolved by filename extension.
Voice upload (multipart) — one `audio` part, ≤ 4 MB, container webm/ogg/mp4/
mpeg/wav; keep recordings ≤ 120 s (60 s before 6.5.0); `durationMs` (integer ms,
≥ 0; clamped to 120000) — send it, or the clip is charged as two minutes.

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

Split (6.9.0):
`SplitGroupInput` — `{ name (1–40, trimmed), icon? (≤ 16, nullable), currency
(a supported ISO code), members? (≤ 49 × SplitPersonInput, no email twice) }`.
`SplitPersonInput` — `{ email (≤ 100, lowercased), name (1–40, required — it's
what the group sees) }`.
`SplitExpenseInput` — `{ title (1–40), amount (> 0, ≤ 999,999,999.99), payers
(1–50 × { memberId, amount? (≥ 0) } — amounts for all or none) | paidBy (member
uuid, the older one-payer shape), occurredOn (YYYY-MM-DD), splitType }` plus `memberIds` (1–50) for
`equal`, or `shares` (1–50) of `{ memberId, amount (≥ 0) }` for `exact` / `{
memberId, percent (0–100, ≤ 2 decimals) }` for `percent`. Nobody twice.
`SplitSettlementInput` — `{ fromMemberId, toMemberId (different), amount (> 0),
settledOn }`.
`SplitShareToWorkspaceInput` — `{ profileId (uuid), categoryId? (uuid, nullable),
title? (≤ 40), occurredOn? (YYYY-MM-DD), amount? (> 0, workspace currency) }`.

---

## 9. CSV export format

`GET /api/v1/transactions/export` returns `text/csv; charset=utf-8` with
`Content-Disposition: attachment; filename="spendchat-YYYY-MM-DD.csv"` (today's
date) and `Cache-Control: no-store`. Up to 5000 rows, honouring the same filters
(no paging).

- Header row: `Date,Type,Category,Note,Amount,Currency,Tags`
- Each row: `occurredOn` (raw `YYYY-MM-DD`), `type` (`income`/`expense`),
  `categoryName ?? "Uncategorized"`, `note` (= title) `?? ""`, **signed** major
  amount (`.toFixed(decimals)`, expenses negative), currency code, and the
  row's tag names joined by `"; "` (empty when it has none).
- **`Tags` was appended in 6.2.0**, after `Currency` rather than beside
  `Category`, so every earlier column kept its index.
- The `Tags` cell is **for display, not for parsing**: a tag name is only
  trimmed and length-capped, so it may itself contain `;` or `,`. Splitting on
  `"; "` is a guess. (The file is still well-formed — a cell with a comma is
  quoted, and the formula guard applies to it like any text cell.)
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
