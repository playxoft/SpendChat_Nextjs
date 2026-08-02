# 11 · Additional Details

Cross-cutting concerns: money math, dates/timezone, states, offline, toasts,
accessibility, testing, and the gotchas that will bite if you skip them.

---

## 1. Money (mirror `src/lib/money.ts`)

Amounts are **integer minor units** end to end. Implement these helpers once in
`core/money.dart`:

```dart
// currency = { code, symbol, decimals } from settings.currencyDetail / meta.currency
int toMinorUnits(num value, int decimals) => (value * math.pow(10, decimals)).round();
double fromMinorUnits(int minor, int decimals) => minor / math.pow(10, decimals);
int signedMinor(String type, int amountMinor) =>
    type == 'expense' ? -amountMinor.abs() : amountMinor.abs();

/// Formats minor units using the currency + locale.
/// signed=true → always prefix + or − (U+2212). Otherwise only negatives get −.
String formatMoney(int minor, {required String code, required String locale,
    required int decimals, bool signed = false}) {
  final major = fromMinorUnits(minor.abs(), decimals);
  final f = NumberFormat.currency(locale: locale, name: code,
      symbol: currencySymbol(code), decimalDigits: decimals);
  final body = f.format(major);
  if (signed) return '${minor < 0 ? '−' : '+'}$body';
  return minor < 0 ? '−$body' : body;   // − = MINUS SIGN
}
```

- The negative glyph is **U+2212 MINUS SIGN "−"**, never an ASCII hyphen.
- **Sign rules by surface** (get these exactly right):
  - **Chat bubble:** income `+` (emerald); expense **no sign**, neutral colour.
  - **Transactions list/table:** income `+` (emerald); expense `−` (neutral).
  - **Detail dialog:** fully signed (income `+` emerald, expense `−` neutral).
  - **Analytics summary:** unsigned magnitudes; income emerald, expense +
    non-negative net neutral; a negative net shows a leading `−` (neutral).
  - **Tracker month balance:** signed; **negative shows in rose**.
- Decimals come from the active currency: **0** (JPY, ISK, UGX, VND, KRW, CLP),
  **3** (KWD, BHD, OMR, JOD), else **2**. Never assume 2.
- When **sending** amounts, send **major units** (`amount: 12.50`); the server
  converts. When **displaying**, prefer the server's `amount` string or format
  `amountMinor` yourself with the decimals.

---

## 2. Dates & timezone (mirror `src/lib/dates.ts`)

- `occurredOn` is a **calendar date** `YYYY-MM-DD` (no time). Render date-only
  values in **UTC** so the stored calendar date is shown exactly, regardless of
  the device zone:
  `DateFormat('MMM d, y').format(DateTime.parse('${iso}T00:00:00Z').toUtc())` →
  "Jul 6, 2026".
- `createdAt` is a real timestamp — render its **time** in the device timezone
  (`h:mm a`).
- **"Today"/"Yesterday"** for day dividers: compute "today" in the **device**
  timezone (`todayISO`), "yesterday" = today − 1 day; compare against
  `occurredOn`; otherwise show the UTC-formatted date.
- **Default ranges:** tracker feed = current calendar **month**; analytics =
  current month (with presets). Month start = `YYYY-MM-01`; month end = last day
  of the month.
- **There is no timezone setting.** The device's IANA zone is what matters for
  "today". (The web sends it via a cookie because Workers run in UTC; on mobile
  just use the device zone directly and send correct `from`/`to`/`occurredOn`.)
- When creating a transaction, default `occurredOn` to **today** (device zone),
  and **cap the date picker at today** (no future dates).

---

## 3. Loading / empty / error / offline states

Every data screen needs all four:

- **Loading:** skeletons (chat bubbles, table rows, analytics cards) — not a bare
  spinner. Pull-to-refresh reloads.
- **Empty:** friendly copy specific to the screen (feed: "No transactions yet…";
  transactions: "No transactions match these filters."; pie: "No expense data for
  this range yet.").
- **Error:** a short message (use `error.message` from the API when present) + a
  **Retry**. Distinguish:
  - **401** → force-refresh the token and retry once; if it still fails, sign out.
  - **403** → "You don't have permission" (role too low) — hide the action for
    viewers so they rarely hit it; for "email not verified", route to verify.
  - **404** → "Not found / no access."
  - **409** → surface the server message (e.g. profile delete guards).
  - **422** → map `error.details` to per-field form errors.
  - **network/timeout** → "No connection. Check your network and try again."
- **Offline:** the app is online-first (thin client). Detect no-network and show
  a non-blocking banner; queue nothing by default. Optimistic *send* still shows
  the pending bubble, but mark it **failed** with a retry when the POST can't
  reach the server (don't silently drop it). A local read cache (last fetched
  feed/list) is a nice-to-have for a better cold-start.

---

## 4. Toast / snackbar catalogue

Top-right (or top on mobile), rich semantic colours. Success on the left, the
API-driven text on the right:

| Action | Success toast |
|---|---|
| Add transaction | "Transaction added" |
| Update transaction | "Transaction updated" |
| Delete transaction | "Transaction deleted" |
| Bulk import | "Imported N transaction(s)" |
| Delete all transactions | "All transactions deleted" |
| Save settings | "Settings saved" |
| Save input layout | "Input layout saved" |
| Add/remove category | "Category added" / "Category removed" |
| Add/update/delete profile | "Profile added" / "Profile updated" / "Profile deleted" |
| Verify email | "Email verified" / "Verification link sent — check your inbox." |
| AI review save | "Added N transaction(s)" |
| Save voice languages | "Voice languages saved" |
| Workspace currency | "Workspace currency saved" |
| Delete attachment | "File removed" |

Errors: show `error.message` verbatim when the API provides one; otherwise a
generic per-action fallback. Composer validation toasts are listed in
[04](./04-tracker-chat.md) §4.10.

---

## 5. Interaction polish

- **Haptics** on: send (light impact), delete (medium), type-toggle (selection),
  profile swipe (selection).
- **Keyboard:** amount field → numeric/decimal; correct "next"/"done" actions per
  input mode; dismiss keyboard on scroll.
- **Scroll:** tracker auto-scrolls to the bottom on load and when a new bubble
  appears; transactions/analytics start at the top.
- **Debounce** the transactions search (~400ms).
- **Optimistic** add on the tracker; consider light optimism for edits/deletes
  (the web refetches).

---

## 6. Accessibility

- Semantic labels on icon-only buttons (type toggle, send, filters, emoji).
- Respect the platform text scale; don't hard-clip money/labels — truncate
  gracefully.
- Contrast: the palette is high-contrast already; keep `muted-foreground` for
  secondary text only.
- Reduced motion: disable the rise/coin animations when the OS requests it.
- Don't rely on colour alone for income vs expense — position (left/right in the
  bubble) and sign carry the meaning too.

---

## 7. Testing

- **Unit:** `money.dart` (round-trip minor↔major for 0/2/3-decimal currencies,
  sign rules, U+2212), `dates.dart` (Today/Yesterday, UTC formatting, month
  ranges), the combined-input parser (`quick-entry` cases), the bulk parser.
- **Serialization:** model `fromJson` against `openapi.yaml` example payloads
  (including nulls: `category: null`, null title/description).
- **API layer:** envelope unwrap, error mapping per status/code, 401
  refresh-and-retry, `X-Workspace-Id` attachment.
- **Widget/golden:** the chat bubble (income/expense, signs, corners), summary
  cards, the pie legend, both themes.
- **Backend smoke:** the server repo ships `scripts/api-smoke.sh <base> <jwt>` —
  run it with a real Firebase token to confirm the backend before wiring the app.

---

## 8. Gotchas (read before you build)

1. **Expense amounts are neutral, not red.** Only income is emerald. Rose appears
   only in: the composer type-toggle *icon*, a *negative month balance* on the
   tracker header, and the "Not sent" label. See [02](./02-design-system.md) §1.
2. **Sign differs by surface:** bubble expense = no sign; list/detail expense =
   `−`. See §1.
3. **Numbers use Geist Sans + `tabular-nums`, not Geist Mono.**
4. **The pie chart uses its own 10-colour palette**, not the grayscale `chart-*`
   tokens. See [06](./06-analytics.md) §4.
5. **Categories have no color.** Profiles have a `color` column but no UI.
6. **Currency ≠ locale.** Currency = symbol + decimals; locale = number
   grouping. They're independent settings.
7. **59 currencies, and decimals vary (0/2/3).** Don't hardcode 2.
8. **`profile` param semantics:** a UUID scopes to that profile; `all`/omitted =
   all accessible profiles. The API default (no param) = all; the web defaults to
   the first profile — pick a deliberate mobile default.
9. **`X-Workspace-Id` on every call**, persisted locally; unknown id → 404.
10. **RBAC: 404 = no access, 403 = role too low.** Gate viewer UIs.
11. **Analytics `categories` needs `type`; `monthly` needs `from`** (and ignores
    other filters).
12. **PATCH transaction is a full-body replacement**, not a partial patch — send
    every mutable field.
13. **Email-verify gate:** unverified email/password tokens get **403**; gate the
    app on `emailVerified`.
14. **Dates are UTC-rendered** for the date-only calendar value; "today" uses the
    device zone. Cap the date picker at today.
15. **U+2212 minus**, everywhere a negative sign appears.
16. **Bulk limit is 500 items** per request; transactions export caps at 5000
    rows.
17. **AI endpoints are extra-gated.** Editor role + a shared **30 calls/hour**
    per-user quota across `/ai/parse` and `/ai/transcribe`. Handle 429 (quota),
    502 (retry), and 503 (feature not configured — hide/disable the AI UI, like
    the web) as *distinct* cases; a bare error toast for all three feels broken.
18. **Presigned attachment URLs must be fetched WITHOUT the Authorization
    header.** Your global auth interceptor will happily attach the bearer to the
    R2 URL — some S3-compatible hosts then reject the request (two credentials).
    Fetch `/attachments/{id}/url` with auth, then GET the returned `url` with a
    clean client. The URL expires in ~5 min — mint per view, never cache it.
19. **AI drafts are suggestions, not writes.** `/ai/parse` (and voice
    transcription) never create rows. The review step is the product: always
    show the drafts for edit before `POST /transactions/bulk`.
20. **Voice recordings: ≤ 60 s / ≤ 4 MB, and set the part's content type**
    (e.g. `audio/mp4` for m4a). A part without a content type falls back to the
    `mimeType` form field — send it too if your client strips types.
21. **`voiceLanguages` is normalized, not validated.** Unknown codes are
    silently dropped (empty → `["en"]`), so update local state from the PATCH
    *response*, not from what you sent.
22. **`Transaction.user` is attribution, not access.** Never filter by it
    client-side to decide what's editable — the server's 403/404 is the truth.
    Use it only for the author labels in shared workspaces.
