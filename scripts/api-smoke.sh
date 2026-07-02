#!/usr/bin/env bash
#
# Smoke-test the SpendChat mobile REST API (/api/v1) with curl.
#
# Usage:
#   scripts/api-smoke.sh [BASE_URL] [JWT]
#
#   BASE_URL   defaults to http://localhost:3010 (the `pnpm dev` port)
#   JWT        optional. A real Neon Auth access token. Without it, only the
#              unauthenticated checks (expecting 401) run. With it, the full
#              authenticated happy-path runs.
#
# Getting a JWT (once signed in on the web app in a browser):
#   - Visit  <BASE_URL>/api/auth/token  while authenticated, copy the `token`.
#   - Or, in the app, DevTools → Network → any /api/auth/token response.
#
# Exit code is non-zero if any check fails.

set -uo pipefail
BASE="${1:-http://localhost:3010}"
TOKEN="${2:-}"
PASS=0 FAIL=0

# check <description> <expected-status> <curl-args...>
check() {
  local desc="$1" want="$2"; shift 2
  local got
  got="$(curl -s -m 60 -o /dev/null -w "%{http_code}" "$@")"
  if [[ "$got" == "$want" ]]; then
    printf "  ok   %-52s [%s]\n" "$desc" "$got"; PASS=$((PASS+1))
  else
    printf "  FAIL %-52s [got %s, want %s]\n" "$desc" "$got" "$want"; FAIL=$((FAIL+1))
  fi
}

auth=(-H "Authorization: Bearer ${TOKEN}")
json=(-H "content-type: application/json")

echo "== Unauthenticated (expect 401) =="
check "GET  /me"                        401 "$BASE/api/v1/me"
check "GET  /transactions"              401 "$BASE/api/v1/transactions"
check "POST /transactions"              401 -X POST "${json[@]}" -d '{}' "$BASE/api/v1/transactions"
check "GET  /categories"                401 "$BASE/api/v1/categories"
check "GET  /profiles"                  401 "$BASE/api/v1/profiles"
check "GET  /settings"                  401 "$BASE/api/v1/settings"
check "GET  /analytics/summary"         401 "$BASE/api/v1/analytics/summary"
check "GET  /me (malformed token)"      401 -H "Authorization: Bearer not.a.jwt" "$BASE/api/v1/me"

if [[ -z "$TOKEN" ]]; then
  echo; echo "No JWT passed — skipping authenticated checks."
  echo "Pass a token as the 2nd arg to run them."
  echo; echo "Passed: $PASS  Failed: $FAIL"
  [[ "$FAIL" == 0 ]] && exit 0 || exit 1
fi

echo; echo "== Authenticated (expect 2xx) =="
check "GET  /me"                        200 "${auth[@]}" "$BASE/api/v1/me"
check "GET  /profiles"                  200 "${auth[@]}" "$BASE/api/v1/profiles"
check "GET  /categories"                200 "${auth[@]}" "$BASE/api/v1/categories"
check "GET  /settings"                  200 "${auth[@]}" "$BASE/api/v1/settings"
check "GET  /transactions"              200 "${auth[@]}" "$BASE/api/v1/transactions"
check "GET  /analytics/summary"         200 "${auth[@]}" "$BASE/api/v1/analytics/summary"
check "GET  /analytics/categories"      200 "${auth[@]}" "$BASE/api/v1/analytics/categories?type=expense"
check "GET  /analytics/monthly"         200 "${auth[@]}" "$BASE/api/v1/analytics/monthly?from=2026-01-01"

# Create → read → update → delete a transaction.
echo "  .. create/read/update/delete a transaction"
CREATED="$(curl -s -m 60 "${auth[@]}" "${json[@]}" -X POST \
  -d '{"type":"expense","amount":3.5,"occurredOn":"2026-06-01","title":"smoke-test"}' \
  "$BASE/api/v1/transactions")"
TXN_ID="$(printf '%s' "$CREATED" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)"
if [[ -n "$TXN_ID" ]]; then
  check "GET    /transactions/:id"      200 "${auth[@]}" "$BASE/api/v1/transactions/$TXN_ID"
  check "PATCH  /transactions/:id"      200 "${auth[@]}" "${json[@]}" -X PATCH \
        -d '{"type":"income","amount":4,"occurredOn":"2026-06-02","title":"smoke-test-2"}' \
        "$BASE/api/v1/transactions/$TXN_ID"
  check "DELETE /transactions/:id"      200 "${auth[@]}" -X DELETE "$BASE/api/v1/transactions/$TXN_ID"
else
  printf "  FAIL %-52s [no id returned: %s]\n" "create transaction" "$CREATED"; FAIL=$((FAIL+1))
fi

check "422 on invalid create"           422 "${auth[@]}" "${json[@]}" -X POST \
      -d '{"type":"expense","amount":0,"occurredOn":"2026-06-01"}' "$BASE/api/v1/transactions"

echo; echo "Passed: $PASS  Failed: $FAIL"
[[ "$FAIL" == 0 ]] && exit 0 || exit 1
