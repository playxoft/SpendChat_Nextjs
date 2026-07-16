# Backend task: `GET /api/v1/workspaces` (list accessible workspaces)

**Repo:** the SpendChat Next.js backend (`MoneyTracker_Nextjs`), not the Flutter
app. Hand this file to the backend agent.

## Goal

Expose a read-only endpoint that returns **every workspace the authenticated
user can open**, so the mobile app can render a workspace switcher (a dropdown
in the profiles panel). Today the mobile API only reveals the *current*
workspace via `GET /api/v1/me` (`data.workspace`), which is not enough to build
a picker.

The data already exists internally — `listUserWorkspaces(userId)` in
`src/lib/workspaces.ts` is the single source of truth and is already used by
`getApiContext()` to resolve the current workspace. This task only **exposes**
it over HTTP. **No new business logic, no schema changes, no mutations.**

## Contract (source of truth)

- **Method / path:** `GET /api/v1/workspaces`
- **Auth:** `Authorization: Bearer <firebase-id-token>` — identical to every
  other `/api/v1/*` route. Unverified-email accounts are rejected the same way
  the other routes reject them (403), via the shared auth helper.
- **Headers:** Ignore `X-Workspace-Id`. This endpoint is **not** scoped to one
  workspace — it lists all of them. Do not 404 on an unknown/absent workspace
  header.
- **Query/body:** none.
- **Success `200`:** the standard envelope, `data` is an array:

  ```json
  {
    "data": [
      { "id": "uuid", "name": "Personal", "role": "admin" },
      { "id": "uuid", "name": "Acme Co", "role": "editor" },
      { "id": "uuid", "name": "Shared board", "role": null }
    ]
  }
  ```

  - `role` is `"viewer" | "editor" | "admin" | null`. `null` means the user
    reaches the workspace only through a per-profile grant (no workspace-wide
    membership) — mirror the semantics already in `WorkspaceSummary`.
  - **Ordering:** exactly what `listUserWorkspaces` already returns —
    memberships first (workspace `createdAt` ascending), then grant-only
    workspaces. Do not re-sort.
  - Always returns ≥ 1 entry for a bootstrapped user (call `ensureBootstrap`
    first, like `/me` does).
  - Do **not** include `ownerId` in the response (the mobile model only needs
    `id`, `name`, `role`; keep the surface minimal).
- **Errors:** reuse the shared error envelope (`{ "error": { code, message } }`):
  - `401 unauthorized` — missing/invalid token.
  - `403` — email not verified (whatever `requireApiUser` already throws).
  - `500 internal_error` — unexpected, via `handle`.

## Recommended implementation

Create `src/app/api/v1/workspaces/route.ts`, mirroring `src/app/api/v1/me/route.ts`.
All imports below are verified to exist and be exported in the repo:

```ts
import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { ensureBootstrap } from "@/lib/auth";
import { apiOk, handle } from "@/lib/api-response";
import { listUserWorkspaces } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

/** GET /api/v1/workspaces — every workspace the caller can open. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireApiUser(request);
    // Guarantee the user has a default workspace on first ever call, exactly
    // like getApiContext() does before listing.
    await ensureBootstrap(user.id);
    const list = await listUserWorkspaces(user.id);
    return apiOk(list.map((w) => ({ id: w.id, name: w.name, role: w.role })));
  });
}
```

Notes for the implementer:

- `requireApiUser(request): Promise<SessionUser>` and `ensureBootstrap(userId)`
  are already exported from `@/lib/api-auth` and `@/lib/auth` respectively
  (`getApiContext` uses both). If lint prefers a single entry point, reusing
  `getApiContext(request)` is acceptable **only** if it does not 404 on the
  `X-Workspace-Id` header — prefer `requireApiUser` + `ensureBootstrap` to keep
  the header irrelevant here.
- `listUserWorkspaces` returns `{ id, name, ownerId, role }[]`; map away
  `ownerId`.

## OpenAPI

Add the path to `_developer/prompt/openapi.yaml` (and any served spec) next to
`/api/v1/me`, reusing the existing `WorkspaceSummary` schema for the array
items (or an inline `{ id, name, role }` object). Update the "Workspaces"
description that currently says the only mobile surface is `/me`.

## Tests

There is an existing integration test pattern at
`tests/integration/api/me.test.ts` and `tests/integration/workspaces.test.ts`.
Add `tests/integration/api/workspaces.test.ts` covering:

1. **200 + list** — an authenticated member of ≥2 workspaces gets all of them,
   memberships-first ordering, correct `role` per workspace.
2. **grant-only role is null** — a workspace reachable only via a per-profile
   grant appears with `"role": null`.
3. **401** — no/invalid bearer token.
4. **header ignored** — passing a bogus `X-Workspace-Id` still returns 200 with
   the full list (must NOT 404).

## Acceptance criteria

- `GET /api/v1/workspaces` returns the envelope above for a signed-in user.
- Lint, typecheck, and the test suite pass (`pnpm lint && pnpm typecheck &&
  pnpm test`, or the repo's equivalent).
- No changes to auth, RBAC, schema, or any existing route's behaviour.

## Out of scope (do NOT build)

- Creating, renaming, deleting, or joining workspaces; invites; member
  management. Those stay as admin-only web flows.
- A "switch workspace" mutation. **Switching already works** with the existing
  mechanism: the client sends `X-Workspace-Id: <id>` on requests and calls
  `/me`, which resolves + persists `lastWorkspaceId` server-side. This task adds
  only the *listing* the client needs to know which ids exist.

## What the mobile app will do with this (for context)

Once the endpoint ships, the Flutter app will add a `WorkspacesRepository.list()`
+ `workspacesProvider`, and turn the workspace header in the right-hand profiles
panel into a dropdown. Selecting a workspace sets the persisted `X-Workspace-Id`
and refetches `/me` + data. So the response contract above (`id`, `name`,
`role`) must stay stable — it maps 1:1 onto the existing Flutter
`WorkspaceSummary` model (`id`, `name`, `role?`).
