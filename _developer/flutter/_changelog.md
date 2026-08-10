# Mobile API changelog (`/api/v1`)

Version history for the SpendChat mobile REST API. The version here matches
`info.version` in **[openapi.yaml](./openapi.yaml)** (the canonical spec) and the
"API spec version" line in **[01-api-reference.md](./01-api-reference.md)**.

**Every API change — even a one-line tweak — must:**
1. bump the version in `openapi.yaml` **and** `01-api-reference.md`,
2. add an entry here (newest first), and
3. update `openapi.yaml` + `01-api-reference.md` to match the new behaviour.

Versioning is semver-ish for a REST contract:
- **major** — a breaking change (removed/renamed field or endpoint, changed
  status code or type) that requires Flutter code changes to keep working.
- **minor** — a backward-compatible addition (new endpoint, new optional field).
- **patch** — docs/clarification only, no behaviour change.

The **Flutter impact** line tells the app team what, if anything, to change.

---

## 5.3.0 — 2026-08-05

The web app's **Files vault** (the `/files` Drive-like document store: nested
folders, tags, share links, transaction files surfaced alongside) is now on the
mobile API. All additive; nothing was removed, renamed, or retyped.

### Added
- **`GET /api/v1/files`** — the vault working set in one call:
  `data: { folders, files, transactionFiles, tags }` +
  `meta: { filesCapped, filesLimit }`. `?profile=<uuid>` scopes to one profile
  (default: all accessible). Files newest first, capped at 500. Lazily creates
  each profile's predefined **"Transaction attachments"** folder
  (`system: true` — recolor/tag only; every structural change is a 400).
- **`POST /api/v1/files`** — multipart vault upload (`profileId` required,
  `folderId?`, files under `files`, optional `thumb_<index>` webp previews).
  **No type allowlist** (unlike attachments); ≤ 10 files/request, ≤ 5 MB each
  (413). **`PATCH /files/{id}`** (rename / category / tags / move),
  **`DELETE /files/{id}`**, and **`GET /files/{id}/url`** — presigned bytes
  URL with the same contract as `GET /attachments/{id}/url`
  (`?variant=thumb`, `?download=1`, ~5 min TTL).
- **`POST /api/v1/folders`**, **`PATCH /folders/{id}`**,
  **`DELETE /folders/{id}`** — nested per-profile folders with a hex `color`
  accent and `tagIds`; sibling names unique case-insensitively (409); delete
  removes the whole subtree; moves into a folder's own subtree are 400s.
- **`GET`/`POST /api/v1/file-tags`**, **`PATCH`/`DELETE /file-tags/{id}`** —
  per-profile tag entities (`name` ≤ 20 + `#rrggbb` color). Files/folders
  reference tags by id (`tagIds`); only a created tag can be applied; delete
  detaches everywhere.
- **`GET`/`POST /api/v1/file-shares`**, **`DELETE /file-shares/{id}`** —
  public share links for a file or a folder subtree (`allowDownload`,
  `expiresInDays` ≤ 365 or never). Editor-only, including reads (tokens grant
  public access). Response includes `sharePath` — the public web page is
  `<web-origin><sharePath>`.
- New schemas: `Folder`, `VaultFile`, `TransactionFile`, `FileTag`,
  `FileShare`, `FolderInput`, `FolderPatch`, `VaultFilePatch`, `FileTagInput`,
  `FileTagPatch`, `FileShareInput`, `FileCategory`, `VaultColor`.

**Flutter impact:** none required — purely additive. To build the Files
screen: load `GET /files` per profile switch (resolve `tagIds` against the
returned `tags`), render `transactionFiles` inside the `system: true` folder
(their bytes come from the existing `GET /attachments/{id}/url`), upload with
the same multipart + `thumb_<index>` pattern as attachments, and treat
`system: true` folders as read-only except color/tags.

---

## 5.2.0 — 2026-07-29

Feature-parity release: the web app's newest features — **AI transaction entry**,
**voice entry**, and **transaction attachments** — are now on the mobile API,
plus the `voiceLanguages` user setting. All additive; nothing was removed,
renamed, or retyped.

### Added
- **`POST /api/v1/ai/parse`** — free text → reviewable transaction drafts
  (`data: { drafts: AiDraft[], today }`). Body `{ text (≤ 2000 chars),
  timezone? (IANA) }`. Nothing is written; the client shows the drafts for
  review and commits kept ones via `POST /transactions/bulk` (each `AiDraft`
  maps 1:1 onto a `TransactionInput`, with `categoryId` already resolved).
  Editor-only (403 for viewers), shared per-user quota of 30 AI calls/hour
  (**429 `rate_limited`**), **503 `ai_unavailable`** when the model isn't
  configured, **502 `ai_failed`** on provider failure.
- **`POST /api/v1/ai/transcribe`** — voice note (multipart, `audio` field,
  ≤ 4 MB, webm/ogg/mp4/mpeg/wav) → transcript text (`data: { text }`, ≤ 1200
  chars). The transcript goes in the composer for the user to fix, then through
  `/ai/parse` like a typed note. Audio is discarded, never stored. Same gates
  and error codes as `/ai/parse`. A recording rejected on format, size or
  emptiness **does not consume a quota slot** — those checks run before the
  role and quota gates, so a client retrying after a 400 hasn't lost budget.
- **Attachments** (receipts/bills/invoices; ≤ 2 per transaction, ≤ 5 MB each;
  images/PDF/Word/Excel/CSV/text):
  - **`Transaction.attachments: Attachment[]`** — metadata embedded on every
    transaction response (oldest first; `[]` when none).
  - **`POST /transactions/{id}/attachments`** (multipart `files`, optional
    `thumb_<i>` webp preview per image) → `201 data: Attachment[]`. Editor-only.
    **413 `payload_too_large`** for a file > 5 MB; **503 `storage_unavailable`**
    when the server has no file storage.
  - **`PATCH /attachments/{id}`** `{ label?, kind? }` and
    **`DELETE /attachments/{id}`**. Editor-only.
  - **`GET /attachments/{id}/url`** (`?variant=thumb`, `?download=1`) →
    `data: { url, expiresInSeconds, fileName, contentType }` — a ~5-minute
    presigned URL fetched **without** the Authorization header. Viewer-only.
- **`Transaction.user`** — author attribution `{ id, name, email }` (always
  present). Show it in shared workspaces (WhatsApp-group style), hide it solo.
- **`Settings.voiceLanguages: string[]`** on `GET /me`, `GET /settings`, and
  in `PATCH /settings` — ISO 639-1 codes voice entry expects (catalogue of 27;
  1–5 codes, never empty, default `["en"]`). PATCH input is normalized, not
  rejected: unknown codes dropped, deduped, capped at 5, empty → default.
- **New `error.code` values:** `rate_limited` (429), `payload_too_large` (413),
  `ai_failed` (502), `ai_unavailable` (503), `storage_unavailable` (503).

**Flutter impact:** additive — regenerate/extend models. Required model changes:
`Transaction` gains `user` and `attachments` (both always present), `Settings`
gains `voiceLanguages`. New features to build against: AI mode in the composer
(parse → review → bulk commit), hold-to-talk voice entry (record ≤ 60 s →
transcribe → editable text), attachments on the transaction detail (upload,
thumbnail via `/url?variant=thumb`, open/share via `/url`), and a Settings →
Voice languages picker. Gate the AI UI on `workspace.role` ≥ editor and handle
429/502/503 distinctly (quota / retry / feature-off).

---

## 5.1.0 — 2026-07-21

Workspaces now carry an optional emoji `icon` (like profiles), returned on every
workspace object and settable when creating one. The workspace-name limit also
grew from 20 to 30 characters. Backward-compatible additions.

### Added
- **`icon` on the `Workspace` object** (`GET /me` → `data.workspace`,
  `GET /workspaces`, `POST /workspaces`, `PATCH /workspaces/{id}`) — a string
  emoji, or `null` when unset. It's a **required** property of the response
  object (always present; value may be null). Existing workspaces were
  backfilled with the default 🏢.
- **`WorkspaceInput.icon` (optional)** on `POST /workspaces` — an emoji (≤16
  chars). Omitted or empty seeds the default 🏢.

### Changed
- **`WorkspaceInput.name` max length raised 20 → 30** on `POST /workspaces`.
  Names of 21–30 chars now succeed (previously **422**); the error message is
  now "Workspace name is too long (max 30 characters)".

**Flutter impact:** none required (both additive/loosening). To match the web
UI, render `workspace.icon` beside the workspace name (fall back to a neutral
glyph when null), optionally let users pick an emoji in the create-workspace
form, and widen any client-side name validation to 30 chars.

---

## 5.0.0 — 2026-07-19

`POST /transactions/delete-all` is now **admin-only** and **profile-scoped**, and
it deletes **every** transaction in the targeted profiles (not just the caller's
own). This is a **breaking** change to who can call it and what it removes.

### Changed
- **`POST /transactions/delete-all` requires the workspace `admin` role** — a
  viewer/editor caller now gets **403** (previously any member could clear their
  own rows).
- **It now deletes every transaction in the selected profiles, regardless of
  author** — a profile is fully wiped, not just the caller's contributions.
- **Request body gained optional `profileIds: string[]`.** Omit or send `[]` to
  clear **all** profiles in the current workspace (the previous "wipe
  everything" behaviour); otherwise only the listed profiles are cleared (ids
  outside the current workspace are ignored). Response is unchanged:
  `data: { deleted }`.

**Flutter impact:** if the app exposes "delete all transactions", gate it to
workspace admins (hide/disable for viewers/editors) and optionally add a profile
picker sending `profileIds`. Sending only `{ confirm: "DELETE" }` still clears
the whole workspace, but the call now 403s for non-admins.

---

## 4.0.0 — 2026-07-18

Currency, number format (locale), and the category list moved from **per-user**
to **per-workspace**. Each workspace now has its own currency and its own shared
category list; theme and input mode stay per-user (they follow the user across
workspaces). This removes fields from `Settings` and re-scopes categories, so
it's a **breaking** change.

### Changed
- **`Settings` no longer has `currency`, `locale`, or `currencyDetail`.** It is
  now just `{ theme, inputMode }`. `GET /me` and `GET /settings` reflect this.
- **`PATCH /settings` no longer accepts `currency` or `locale`** — only
  `{ theme, inputMode }` (any subset, ≥1).
- **The `workspace` object (in `GET /me` and `GET /workspaces`) gained
  `currency`, `locale`, and `currencyDetail`** (`{ code, symbol, decimals }`).
  Format minor-unit amounts using `workspace.currencyDetail.decimals` (or
  `meta.currency` on list/analytics responses, unchanged).
- **`GET`/`POST`/`PATCH`/`DELETE /categories` are now scoped to the current
  workspace** (`X-Workspace-Id`), not the user. Switching workspace changes the
  list. Writes require the **editor** role (viewer → 403); the unique-name
  constraint is now per **workspace**+kind. `POST /workspaces` also seeds the new
  workspace's default category list.

### Added
- **`PATCH /api/v1/workspaces/{id}`** — set a workspace's `currency` + `locale`.
  Body `WorkspaceCurrencyPatch` `{ currency, locale }`. **Admin only** (403
  otherwise). Returns the updated workspace. This replaces the old
  currency/locale path through `PATCH /settings`.

**Flutter impact:** required.
- Read `currency` / `locale` / `currencyDetail` from the **workspace** object
  (`/me`, `/workspaces`), not from `settings`. Anything binding
  `settings.currency` / `settings.locale` / `settings.currencyDetail` must move
  to `workspace.*` or it will break.
- Change the currency/number-format editor to call
  `PATCH /workspaces/{id}` (admin only) instead of `PATCH /settings`. Keep
  theme/input-mode edits on `PATCH /settings`.
- Categories now change when the active workspace changes — re-fetch
  `/categories` on workspace switch, and gate add/edit/delete on the editor role.

---

## 3.1.0 — 2026-07-17

Added an optional telemetry request header. Purely additive — no endpoint, field,
status, or response shape changed — so this is a **minor** bump.

### Added
- **`X-Client-Platform` request header** (optional, accepted on every endpoint).
  Identifies the client platform for server-side logging only; it never affects
  a response. Recognised values: `android`, `ios`, `web`. Unknown or absent →
  the request is logged with platform `api`.

**Flutter impact:** optional but recommended. Send `X-Client-Platform: android`
or `ios` (alongside the existing `Authorization` / `X-Workspace-Id` headers) on
every request so server logs and dashboards can attribute traffic to the mobile
platform. No change is required for the app to keep working.

---

## 3.0.0 — 2026-07-17

Tightened input length/size limits across write endpoints to match the product's
new field limits. No field, path, or status was removed or retyped — but values
that were accepted before are now rejected with `400` (`ValidationError`), so
this is a **major** bump.

### Changed (stricter validation — previously-valid bodies now 400)
- **`TransactionInput` / `TransactionUpdate` (`POST`/`PATCH /transactions`,
  `POST /transactions/bulk`):**
  - `amount` maximum lowered from `1,000,000,000` to `999,999,999.99` (whole-number
    part capped at 9 digits). Message: "Amount is too large (max 9 digits)".
  - `title` max length `100 → 40`. Message: "Title is too long (max 40 characters)".
  - `description` max length `250 → 150`. Message: "Description is too long (max 150 characters)".
  - deprecated `note` alias max length `100 → 40`.
- **`CategoryInput` / `CategoryUpdate` (`POST`/`PATCH /categories`):** `name` max
  length `40 → 20`. Message: "Name is too long (max 20 characters)".
- **`ProfileInput` / `ProfileUpdate` (`POST`/`PATCH /profiles`):** `name` max
  length `40 → 20`.
- **`WorkspaceInput` (`POST /workspaces`):** `name` max length `60 → 20`. Message:
  "Workspace name is too long (max 20 characters)". The auto-generated default
  workspace name is now also trimmed to fit 20 characters.

**Flutter impact:** enforce the new limits client-side (input `maxLength`) so the
app never sends a body the server will reject: title 40, description 150, amount
≤ 999,999,999.99 (≤ 9 whole digits), category/profile/workspace name 20. Surface
the `400` validation `message` if a longer value slips through. No decoding or
model-shape changes are required (all fields keep their types).

---

## 2.1.0 — 2026-07-16

Correctness-review pass. Additive: no field, path or status was removed or
retyped. One response *body* changes (CSV escaping) and several statuses that
the server already returned are now documented.

### Changed
- **`GET /transactions/export` escapes formula-looking cells.** A text cell
  starting with `=`, `+`, `-`, `@`, tab or CR is now prefixed with a single
  quote and quoted: a transaction titled `=SUM(A1)` exports as `"'=SUM(A1)"`.
  This closes a CSV/formula-injection hole — in a shared workspace the person
  who typed the title and the person opening the file are different people.
  **Numeric cells are exempt**, so the signed `Amount` column (`-40.00`) is
  byte-for-byte unchanged.

### Fixed (documentation — no server change)
- Added the `403`/`404` responses that every workspace-scoped endpoint could
  already return (`getApiContext` throws `403` for an unverified email and
  `404` for an unknown `X-Workspace-Id`). They were missing from `GET
  /settings`, `GET`/`POST /categories`, `PATCH`/`DELETE /categories/{id}`,
  `GET /profiles`, `GET /transactions/{id}`, `POST /transactions`,
  `POST /transactions/bulk`, `GET /transactions/export`,
  `POST /transactions/delete-all`, `PATCH /settings`, and all three analytics
  endpoints — so a generated client modelled them as unknown/parse failures.
- Added `400` (malformed JSON) to every endpoint that reads a request body.
- Documented under Conventions that `403`/`404` apply to every
  workspace-scoped endpoint and that the account-linking `409` can surface
  anywhere.

### Not changed (verified, previously reported as a defect)
- The `422` on `DELETE /transactions/{id}`, `DELETE /categories/{id}` and
  `DELETE /profiles/{id}` is **correct and stays**: those handlers validate the
  **path id** with `z.string().uuid()` and return `422` ("Invalid transaction")
  for a non-UUID segment, even though they take no body.

**Flutter impact:** *Low, but check one thing.* If the app re-parses the
exported CSV (rather than just sharing the file), strip a leading `'` from text
columns; the `Amount` column is unaffected. Otherwise this is additive — but
regenerating the client is worth it, since `403`/`404`/`400` on the endpoints
above are now modelled instead of surfacing as parse errors. No request shape,
field or existing status changed.

---

## 2.0.0 — 2026-07-16

Security-review hardening pass. Breaking because observable statuses/semantics
changed on existing endpoints; request/response *shapes* are unchanged.

### Changed
- **Single-transaction ops are now workspace-scoped.** `GET`/`PATCH`/`DELETE
  /transactions/{id}` honour `X-Workspace-Id`: an id that lives in another of
  the caller's workspaces now returns **404** `not_found` (previously it
  resolved by profile role across all workspaces). This matches the list
  endpoints' scoping.
- **`POST /transactions/delete-all` is scoped to the current workspace.** It
  now deletes only the rows the caller **authored in the current workspace**,
  and only in profiles they can still write to (editor+). Previously it deleted
  every row the caller had ever authored, in *any* workspace, regardless of
  their current role. Honours `X-Workspace-Id` (unknown id → 404).
- **`POST /profiles/reorder` now requires admin** (was editor), matching every
  other profile-management operation. Editors now get **403**.
- **Verified-email gate is fail-closed.** A token that carries an email without
  `email_verified: true` is rejected with 403 (previously only an explicit
  `false` was rejected). No effect on real Firebase tokens, which always set
  the claim.

### Added
- **Cross-provider account linking.** Signing in with a new Firebase account
  whose **verified** email already belongs to an existing SpendChat account
  links the new provider to that account instead of failing. With an
  **unverified** email this returns **409** `conflict` ("This email is already
  registered with a different sign-in method") — previously this scenario was
  an unhandled **500** on every request.

**Flutter impact:** no model or request changes. Ensure single-transaction
reads/edits/deletes are made with the same `X-Workspace-Id` under which the
transaction was listed (an id from another workspace now 404s). Treat 404 from
those endpoints as "not in this workspace". Hide the profile-reorder UI for
non-admins (editors now get 403). Optionally surface the new 409 sign-in
conflict message.

---

## 1.3.0 — 2026-07-16

### Added
- **`POST /api/v1/workspaces`** — create a workspace with `{ name }` (1–60
  chars, trimmed). Returns `201` with `data: WorkspaceSummary`; `role` is
  always `"admin"`. Mirrors the web's create flow: seeds the admin membership
  plus a default "Personal" profile and **makes the new workspace current**
  (persists `lastWorkspaceId`). Ignores the `X-Workspace-Id` header. Errors:
  `400` (malformed JSON), `401`, `403` (email unverified), `422`
  (blank / >60-char name).

**Flutter impact:** additive, non-breaking. Enables "create workspace" in the
app: `WorkspacesRepository.create(name)`, then pin the returned id as
`X-Workspace-Id`, reset the profile scope, and refresh `/me` + workspace list
+ data.

---

## 1.2.0 — 2026-07-16

### Added
- **`GET /api/v1/workspaces`** — lists every workspace the authenticated user
  can open, for a workspace switcher. Returns `data: WorkspaceSummary[]`
  (`{ id, name, role }`, same shape as `/me`'s `workspace`). Memberships first
  (workspace `createdAt` ascending), then grant-only workspaces (`role: null`).
  Ignores the `X-Workspace-Id` header and never returns 404; always ≥1 entry for
  a bootstrapped user. Errors: `401` (no/invalid token), `403` (email unverified).

**Flutter impact:** additive, non-breaking. Enables a real workspace switcher —
add a `WorkspacesRepository.list()` + provider and turn the workspace header in
the profiles panel into a dropdown. Selecting one sets the persisted
`X-Workspace-Id` and re-fetches `/me` + data. Existing calls are unaffected.

---

## 1.1.0 — baseline (corrected contract for the Flutter port)

Corrections over the original `_developer/api/openapi.yaml` (now deprecated):
- added the `X-Workspace-Id` request header (workspace scoping);
- `GET /me` returns a `workspace` object (`{ id, name, role }`);
- `Error.code` includes `forbidden` (403);
- `Category` has **no** `color` field;
- `CurrencyCode` is the full 59-code list;
- `TransactionInput` documents the deprecated `note` alias;
- documented `403` on mutating endpoints.

**Flutter impact:** this is the contract the Flutter app was built against.

---

## 1.0.0 — original draft

First cut of the mobile API, superseded by 1.1.0. See the deprecated
`_developer/api/openapi.yaml` for that historical version.
