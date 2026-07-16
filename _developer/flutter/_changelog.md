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
