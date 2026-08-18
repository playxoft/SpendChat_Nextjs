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

## 5.9.1 — 2026-08-19

`POST /ai/parse` sentence-cases the drafts it returns.

- **`AiDraft.title` and `AiDraft.description` come back with their first
  character uppercased** — a note reading "banana" now yields the title
  "Banana". Only the first character is touched, so "iPhone case" and "3M tape"
  are returned as the model produced them, and a draft starting with a digit or
  a currency symbol is untouched. Both fields are still capped at 40/150
  characters (the cap is applied after the casing, so neither can come back one
  character over).

**Flutter impact:** none required. Drafts shown in the review sheet will read
capitalized without the app doing anything; if the app applies its own
capitalization to draft titles, that can be dropped.

## 5.9.0 — 2026-08-15

`transactions=move` now moves the profile's vault as well.

### Changed
- **`DELETE /profiles/{id}?transactions=move` re-files the vault** — files,
  folders, file-tags and file-shares — under `?to=` instead of deleting it.
  Previously only the transactions and their attachments moved and the vault
  was destroyed with the profile. `transactions=delete` is unchanged: it still
  deletes the vault along with everything else. Two collisions are resolved on
  the way: a file-tag whose name already exists in the destination is **merged**
  into it (references rewritten, the duplicate row dropped, so a tag id can
  disappear), and the source's predefined "Transaction attachments" folder is
  dropped once its contents are re-parented into the destination's, since a
  profile only ever has one.
- **`GET /profiles/{id}/deletion-impact` counts unchanged in shape, changed in
  meaning.** `files` is no longer "deleted whichever option you pick" — like
  `transactions` and `attachments`, it now follows the disposal: destroyed on
  `delete`, moved on `move`.

**Flutter impact:** none required — no path, status, or JSON shape changed. Two
things to correct in the UI: a confirm dialog that says the vault is deleted
regardless (as the 5.7.0 note told you to) is now wrong for `move`, so drop that
sentence and say the files move; and offer the disposal choice whenever
`transactions > 0` **or** `files > 0`, not just for transactions, or a profile
holding only documents gets deleted without the user being asked. After a move,
re-fetch any cached file-tag ids for the destination profile — merged tags are
gone.

---

## 5.8.0 — 2026-08-15

Video and audio files stored in the vault are now actually playable.

### Fixed
- **Files no longer lose their media type.** A file whose part carried no
  `Content-Type` (or `application/octet-stream` — what browsers and many HTTP
  clients send for `.mkv`, `.avi`, `.m4v`, `.flac`) was stored as a generic
  binary. The type is now resolved from the **filename extension**, so
  `GET /files` reports `video/x-matroska` rather than
  `application/octet-stream`. Send the filename with its extension intact.
  This applies **on read as well as on upload**, so files that were already in
  a vault report their real type too — no backfill, nothing to re-upload.
- **`GET /files/{id}/url` now pins the served `Content-Type`.** The presigned
  URL restates the type from the response body, so an object stored back when
  its container couldn't be named arrives as `video/x-matroska` rather than the
  `application/octet-stream` it still carries in storage — which is what a
  player needs to see.
- **`.m4v` reports `video/mp4`** (the container it actually is) instead of
  `video/x-m4v`, which no platform has a renderer registered for — navigating
  to one saved the file instead of playing it. **`.ts` is no longer treated as
  video**: it's far more often TypeScript source, and a text file typed
  `video/mp2t` showed up as a video that no player could open. `.m2ts` still
  resolves to `video/mp2t`.

### Changed
- **`GET /files/{id}/url` serves every recognized audio/video type inline**, not
  just mp4/webm/quicktime. Matroska, avi, wmv, flv, mpeg, 3gpp, mp2t, ogg and
  the audio equivalents (mp3, wav, m4a, aac, opus, flac, amr, wma) now come back
  with an `inline` disposition and Range support instead of `attachment`. Media
  bytes go to a decoder rather than a document parser, so this doesn't reopen
  the 5.6.0 inline-rendering issue — the allowlist still excludes HTML/SVG.
- **View-only share links (`allowDownload: false`) serve only what a browser
  renders.** Since media became inline, a view-only link to a container no
  engine decodes (`.avi`, `.wmv`, `.flv`, `.3g2`, `.m2ts`, `.amr`, `.wma`)
  would have handed the recipient a file download — the exact thing the flag
  exists to prevent. The share page now offers no link for those and the share
  route answers 403; playable media and previewable documents are unaffected.

**Flutter impact:** none required. Worth adopting: previously-undecodable files
now stream to a player instead of downloading, so point your video widget at the
URL. Whether a container plays is the **player's** call and differs by platform
(Android's ExoPlayer handles Matroska; iOS's AVPlayer largely doesn't) — treat a
decode error as expected and fall back to a download/share action rather than
showing a failure. If you built an inline-type check from an earlier draft of
this entry, derive it from the returned `contentType` (`video/`, `audio/`
prefix) instead of a hard-coded list — the list had 21 of the 23 types.

---

## 5.7.0 — 2026-08-15

Deleting a profile no longer requires emptying it first — the caller says what
happens to the transactions.

### Added
- **`DELETE /profiles/{id}` takes `?transactions=`.** `delete` removes the
  profile's transactions (and their attachments) with it; `move` re-files them
  under `?to=<profileId>` first — one call instead of `POST /profiles/{id}/move`
  followed by a delete. Omitting it means `reject`, the old behaviour: **409
  while the profile still has transactions**. `transactions=move` without `to`
  is a **422**. `POST /profiles/{id}/move` is unchanged and still available on
  its own. An **empty query value counts as absent** (`?transactions=` is the
  default, `&to=` is "not given"), so a client that builds the URL from empty
  state doesn't get a 422 for a request this spec calls valid.
- **`GET /profiles/{id}/deletion-impact`** → `{ transactions, files,
  attachments }` (admin only). The counts a confirmation dialog needs before
  anything is destroyed. `attachments` is separate from `files` because the two
  behave differently: receipts follow their transactions (destroyed by
  `delete`, re-filed by `move`) while the vault always goes with the profile.

### Changed
- **`DELETE /profiles/{id}` is atomic.** Emptying the profile and deleting it
  now share one database transaction, so a write that lands mid-delete can no
  longer leave the transactions destroyed *and* the profile standing. That race
  answers **409 "Something was added to this profile while it was being deleted
  — try again"** instead of a 500; nothing has changed when it does, so the
  call can simply be repeated.

### Fixed
- **Re-filing a transaction now carries its receipts, whichever way you do it.**
  Attachment rows keep a denormalized profile id. `POST /profiles/{id}/move`
  (and `transactions=move`) re-point it, and so does a single-transaction
  profile change through `PATCH /transactions/{id}` — that one was still
  leaving receipts behind on the old profile, where they were invisible against
  the moved transaction and destroyed, file and all, the moment that profile
  was deleted. A profile delete also repairs any row left stale by an older
  build instead of destroying it, so no data waits on a migration to be safe.
- **A deleted profile's stored objects are actually removed.** Its vault files
  and the attachments of the transactions it takes with it cascade in the
  database, but the objects behind them were left in storage forever — they are
  now swept, in batches rather than one request per object, so a profile with
  hundreds of documents completes instead of timing out. The sweep matches
  attachments through their parent transaction, so a receipt whose transaction
  survives elsewhere is never touched. Visible as freed space in the workspace
  storage quota.

**Flutter impact:** none required — a client that sends no query param behaves
exactly as before. To adopt: show a confirm dialog seeded by
`GET /profiles/{id}/deletion-impact` offering "delete the transactions"
(recommended default) or "move them to another profile", then call `DELETE`
with the matching `?transactions=` (+ `&to=`). Two things to get right in that
dialog: only send `transactions=delete` when the impact call **succeeded** and
reported a non-zero count — fall back to omitting the param (`reject`) whenever
the counts are unknown, so the 409 still guards you — and say that **the
profile's vault files are deleted either way** when `files > 0`, since `move`
moves transactions, not the vault.

---

## 5.6.0 — 2026-08-15

Correctness and hardening pass over the files vault from a review of the 5.3.0
endpoints. No field was removed, renamed, or retyped, and a client that follows
the documented contract needs no change — but several endpoints now *behave* the
way the docs already described, so the differences are listed in full.

### Fixed
- **`GET /files/{id}/url` no longer serves arbitrary types inline.** The minted
  URL previously carried `Content-Disposition: inline` for **any** stored
  content type unless `?download=1`. The vault has no upload type allowlist, so
  an uploaded `text/html` (or SVG) would render — and run its script — off the
  storage origin when opened in a WebView. Inline is now limited to previewable
  types (images, PDF, plain text/CSV/Markdown, audio/video); everything else
  gets `attachment`. `?variant=thumb` stays inline. This matches what the web
  app has always done.
- **The 5 MB per-file cap now covers `thumb_<index>` previews.** They were
  accepted and stored at any size, so a 1-byte file plus a 90 MB "preview"
  bypassed the documented cap entirely. An oversized preview is now 413
  `payload_too_large`, like an oversized file.
- **`thumb_<index>` can no longer bind to the wrong file.** The index counts
  file parts in send order (`files` entries before `file` entries) and is no
  longer renumbered when a part isn't a file — previously a mixed or malformed
  request silently attached a preview to a different file.
- **`DELETE /files/{id}` and `DELETE /folders/{id}` delete the preview object
  too.** Only the original was removed, so every thumbnailed file leaked its
  `_thumb` object into storage permanently. No API shape change; the stored
  bytes now actually go away, as the endpoint's description claimed.
- **`GET /file-shares` returns only active links.** Expired rows were listed
  indistinguishably from live ones, so a share sheet could offer a link that
  404s on the share page.
- **`GET /file-shares` with both `fileId` and `folderId` is now 422**, as
  documented. It previously answered 200 with the *file's* links, so a client
  querying a folder could render the wrong list.
- **`GET /files` no longer creates rows on a viewer's read.** The predefined
  "Transaction attachments" folder is materialized only for profiles the caller
  can write to — a read-only grant was creating folders inside another member's
  profile and being recorded as their author.

**Flutter impact:** mostly none — all of the above move the API toward the
documented contract. Two worth checking: (1) if the app *navigates* a WebView to
the `/files/{id}/url` result expecting a document to display, non-previewable
types will now download instead — fetch the bytes rather than navigating if you
need them in-app; (2) a view-only user may not see the "Transaction attachments"
folder until an editor opens that profile's vault — their transaction files are
still returned in `transactionFiles`, so surface those directly if the folder is
absent. Upload error messages lost their trailing full stops (still safe to
display as-is).

---

## 5.5.0 — 2026-08-14

A **workspace storage quota**: 1 GB per workspace, covering vault files and
transaction attachments together. Additive; nothing was removed, renamed, or
retyped.

### Added
- **`GET /files` meta gains `storage`** — `{ usedBytes, limitBytes }`, the
  workspace's total stored bytes (vault files + transaction attachments)
  against the flat 1 GB quota. **Workspace-wide even when `?profile=` scopes
  the list**, so it can back a storage indicator directly.
- **New 413 code `storage_quota_exceeded`** on both upload endpoints
  (`POST /files`, `POST /transactions/{id}/attachments`): the batch's combined
  size would push the workspace past the quota. Distinct from
  `payload_too_large` (a single file over 5 MB). The message says how much
  space remains and is safe to display as-is.

**Flutter impact:** optional — read `meta.storage` to render a storage
usage indicator (the web app shows a ring on the files page). Uploads should
handle 413 by branching on `error.code`: `payload_too_large` (file too big)
vs `storage_quota_exceeded` (workspace full — showing `error.message` as-is
is enough). Existing flows keep working unchanged.

## 5.4.0 — 2026-08-14

A **version endpoint**, so a client can find out what it's talking to. Additive;
nothing was removed, renamed, or retyped.

### Added
- **`GET /api/v1/version`** — `data: VersionInfo`
  `{ name, version, apiVersion, environment, build, changelog }`. `version` is
  the deployed **server** release (`package.json` + `CHANGELOG.md`);
  `apiVersion` is the version of this spec; `environment` is
  `production | beta | development`; `build` is the deployed Cloudflare Worker
  version `{ id, deployedAt }` (**nullable** — null on a local run and on any
  deploy older than the version-metadata binding); `changelog` links the app and
  API changelogs. `Cache-Control: no-store`, like every other JSON response.
- **This is the first and only `/api/v1` endpoint that takes no bearer token.**
  It never returns 401/403/404, ignores `X-Workspace-Id`, reads nothing
  per-user, and touches no database — a client has to be able to read the
  contract version before it has a token, and while an "update required" screen
  is up. The payload is limited to public facts (no dependency versions,
  hostnames, regions, env var names, or storage/database state).
- The same body is also served at **`/version`** (outside `/api/v1`) for `curl`
  and uptime checks. Mobile clients should use the `/api/v1` path.

**Flutter impact:** none required — purely additive. Recommended: call
`GET /version` once at startup (before auth), compare `apiVersion`'s **major**
with the version the app was built against and prompt an update when the server
is ahead (a higher **minor** is additive — ignore it). Show `version` and
`build.id` on the debug/about screen so bug reports name the exact deploy, and
link `changelog.app` for "what's new". Model `build` and `build.deployedAt` as
nullable.

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
