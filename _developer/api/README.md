# SpendChat Mobile API

REST API for the Flutter client. Versioned under **`/api/v1`**, served by the
same Next.js app as the web UI. The machine-readable contract is
[`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1) — generate your Dart models from
it (see [Generating a Dart client](#generating-a-dart-client)).

- **Base URL (dev):** `http://localhost:3010`
- **Base URL (prod):** your Worker/route domain
- **Auth:** Firebase ID token as bearer (`Authorization: Bearer <idToken>`)
- **Content type:** `application/json` (CSV export is `text/csv`)

## Response envelope

Every JSON response uses one shape, so the client can decode it uniformly:

```jsonc
// success
{ "data": <payload>, "meta"?: { ... } }
// failure
{ "error": { "code": "validation_error", "message": "…", "details"?: { "field": "…" } } }
```

Error `code`s: `unauthorized` (401), `bad_request` (400), `not_found` (404),
`conflict` (409), `validation_error` (422), `internal_error` (500). Branch on
the HTTP status; use `error.message` for display and `error.details` (field →
message) for form validation.

## Authentication

Auth is **Firebase Authentication**. The API does not issue tokens — it verifies
the **Firebase ID token** (RS256) against Google's public keys, pinning the
issuer + audience to your Firebase project. The Flutter flow:

1. **Set up Firebase** in the app (`firebase_core` + `firebase_auth`, plus
   `google_sign_in` for Google). Use the same Firebase project as the web app.
2. **Sign in**: `signInWithEmailAndPassword(...)` or the Google flow.
   Email/password accounts must have verified their email (Google always has) —
   the API returns `403` for an unverified token.
3. **Get the token**: `final idToken = await FirebaseAuth.instance.currentUser!
   .getIdToken();` and send `Authorization: Bearer <idToken>` on every `/api/v1`
   request. The SDK caches + auto-refreshes it; call `getIdToken()` again (or
   `getIdToken(true)` to force) when a request returns `401`.

ID tokens last ~1 hour and the SDK refreshes them automatically — you don't need
`flutter_secure_storage` for the token (Firebase persists the session itself).

> Server config: the whole Firebase web config is one env var,
> `NEXT_PUBLIC_FIREBASE_CONFIG` (JSON). The API verifies against its `projectId`
> (`iss = https://securetoken.google.com/<projectId>`, `aud = <projectId>`),
> using Google's Secure Token JWKS.

## Money

Amounts are stored and returned as **integer minor units** (`amountMinor`, e.g.
cents) — the source of truth. Each transaction also includes `amount`, a
major-unit **string** already formatted to the currency's decimals. A user has a
single currency; list/analytics responses include `meta.currency`
(`{ code, symbol, decimals }`) and `GET /settings` includes `currencyDetail`, so
you can format any minor-unit value:

```
major = amountMinor / 10^decimals
```

Analytics values (`income`, `expense`, `balance`, category `total`) are minor
units — format them with `meta.currency.decimals`.

## Lists, filters, pagination

`GET /transactions` (and the analytics endpoints) accept:

| Param      | Meaning                                             |
|------------|-----------------------------------------------------|
| `type`     | `income` \| `expense`                               |
| `category` | category id (or `all`)                              |
| `profile`  | profile id (or `all` for every profile)             |
| `from`,`to`| inclusive date range, `YYYY-MM-DD`                  |
| `q`        | free-text search over title + description           |
| `limit`    | page size, default 100, max 500 (list only)         |
| `offset`   | pagination offset (list only)                       |

`GET /transactions` returns `meta.total` (count ignoring paging) for building
pagers. `GET /analytics/categories` **requires** `type`; `GET /analytics/monthly`
**requires** `from`.

## Endpoint reference

| Method & path | Purpose |
|---|---|
| `GET /api/v1/me` | Current user + settings |
| `GET /api/v1/transactions` | List (filters + pagination) |
| `POST /api/v1/transactions` | Create |
| `GET /api/v1/transactions/{id}` | Fetch one |
| `PATCH /api/v1/transactions/{id}` | Update (send full body) |
| `DELETE /api/v1/transactions/{id}` | Delete |
| `POST /api/v1/transactions/bulk` | Create up to 500 (`{ items: [...] }`) |
| `GET /api/v1/transactions/export` | CSV export (filters) |
| `POST /api/v1/transactions/delete-all` | Wipe all (`{ confirm: "DELETE" }`) |
| `GET /api/v1/categories` | List |
| `POST /api/v1/categories` | Create |
| `PATCH /api/v1/categories/{id}` | Update (partial) |
| `DELETE /api/v1/categories/{id}` | Delete |
| `GET /api/v1/profiles` | List |
| `POST /api/v1/profiles` | Create |
| `PATCH /api/v1/profiles/{id}` | Update (partial) |
| `DELETE /api/v1/profiles/{id}` | Delete (409 if last / non-empty) |
| `POST /api/v1/profiles/reorder` | Reorder (`{ ids: [...] }`) |
| `POST /api/v1/profiles/{id}/move` | Move its txns (`{ toProfileId }`) |
| `GET /api/v1/settings` | Get settings |
| `PATCH /api/v1/settings` | Update settings (partial) |
| `GET /api/v1/analytics/summary` | Income / expense / balance |
| `GET /api/v1/analytics/categories?type=` | Totals by category |
| `GET /api/v1/analytics/monthly?from=` | Monthly income vs expense |

## Example

```bash
TOKEN="<jwt from /api/auth/token>"
BASE="http://localhost:3010"

curl "$BASE/api/v1/me" -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE/api/v1/transactions" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
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

## Generating a Dart client

From `openapi.yaml` you can generate models + a client. Two common options:

```bash
# OpenAPI Generator (dart-dio) — needs Java + openapi-generator-cli
openapi-generator-cli generate \
  -i _developer/api/openapi.yaml -g dart-dio -o mobile/lib/api

# or the Dart-native package (adds to build_runner)
dart pub add openapi_generator_annotations dev:openapi_generator
```

Because the envelope wraps payloads in `data`, either unwrap in a small
interceptor/response layer, or generate models for the inner schemas
(`Transaction`, `Category`, …) and decode `body["data"]` yourself.

## Testing

`scripts/api-smoke.sh` is a curl smoke test. Unauthenticated (checks 401s):

```bash
scripts/api-smoke.sh http://localhost:3010
```

Full authenticated happy-path (pass a real JWT):

```bash
scripts/api-smoke.sh http://localhost:3010 "<jwt>"
```

Server-side behaviour is covered by Vitest: `tests/unit/jwt.test.ts` (token
verification) and `tests/integration/api/*` (every endpoint against an
in-process Postgres). Run with `pnpm test`.
