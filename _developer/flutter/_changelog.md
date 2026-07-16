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
