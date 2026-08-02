# 05 · Transactions

A filterable, paginated list of transactions, **newest first**, with edit,
delete, and CSV export. Route: `/transactions`.

Data: `GET /transactions?<filters>&limit=50&offset=<page*50>` → `data:
Transaction[]`, `meta: { total, limit, offset, currency }`. Also fetch
`GET /analytics/summary?<same filters>` for the header net line.

> The web renders this as **one responsive table** (columns hide on narrow
> screens), **not** a separate mobile card layout. On Flutter you can render
> **cards/rows on phones** and a table on tablets — but keep the same fields,
> ordering, and filters. Match the data faithfully; the layout can be
> mobile-idiomatic.

---

## 1. Screen layout

- **Header:** title **"Transactions"** + an action cluster: **Add transaction**
  (`calendar-plus`), **Bulk add** (`list-plus`), **CSV** export (`download`),
  and (web-only) Print — skip Print on mobile.
- **Filter bar** (see §3).
- **Results header line:** `"{total} record{s} · Net {formatMoney(balance)}"` in
  `muted-foreground`.
- **Results:** the list/table (§2).
- **Pagination:** shown only when there's more than one page (§4).

---

## 2. Row / table fields

Each transaction row shows, in order:

| Field | Content | Notes |
|---|---|---|
| **Date** | `occurredOn` → "Jul 6, 2026" | UTC-formatted date label, `muted-foreground` |
| **Category** | `{icon ?? 💸} {name ?? "Uncategorized"}` | inline emoji + name |
| **Title** | `title` (+ a 📎 when `attachments` is non-empty) | truncate |
| **Description** | `description` | `muted-foreground`, truncate; hide on narrow |
| **Amount** | signed money, tabular, right-aligned | tone per rule below |

In a **shared workspace** (more than one user), also surface the author
(`transaction.user.name ?? email`) — the web shows it as a column/tooltip; on
mobile a secondary line or the detail dialog is fine.

**Amount tone & sign** (this screen shows a **signed** amount):
- **Income:** emerald, leading **`+`** (e.g. `+$100.00`).
- **Expense:** neutral `foreground`, leading **`−`** (U+2212, e.g. `−$40.00`).

(Note: unlike the chat bubble — where expenses have no sign — the **table/list
shows a signed amount** with the `−`, but the expense colour is still neutral,
not rose.)

- **Row tap** → the **detail dialog** (same as [04](./04-tracker-chat.md) §6:
  view, then Edit / Delete). Edit opens the shared Add/Edit form
  ([04](./04-tracker-chat.md) §7).
- **Empty state:** a bordered block, centered `muted-foreground` text
  **"No transactions match these filters."**

---

## 3. Filter bar

Controls (all optional; each change resets pagination to page 1):

1. **From** date — max = the "To" date.
2. **To** date — min = the "From" date.
3. **Type** — `All types` (default) / `Income` / `Expense`.
4. **Category** — `All categories` (default) + one entry per category, rendered
   `{icon} {name}` (income categories get a `· in` suffix). Value = category id.
5. **Search** — a text field (magnifier icon), **debounced ~400ms**, maps to
   `q`. Searches title OR description.
6. **Clear** — appears when any filter is active; resets everything.

- **Profile** is **not** in this bar — it comes from the global profile scope
  (see [03](./03-navigation-shell.md)); pass it as the `profile` query param.
- Map "all" selections to **omitting** the param (or `all`), per
  [01](./01-api-reference.md) §5.

On mobile, collapse these into a filter sheet/bottom-sheet with the same
controls, plus a visible chip summary of active filters.

---

## 4. Pagination

- **Page size = 50.** `offset = (page - 1) * 50`.
- `totalPages = ceil(meta.total / 50)`. Show pager only when `> 1`.
- Web shows **"Page X of Y"** + Previous/Next buttons (disabled at bounds). On
  mobile, prefer **infinite scroll / "Load more"** appending pages using
  `offset`, or keep the simple prev/next — either is fine as long as it uses
  `meta.total`.

---

## 5. CSV export

- The **CSV** button hits `GET /api/v1/transactions/export?<current filters incl.
  profile>` → `text/csv` (see [01](./01-api-reference.md) §9). Columns:
  `Date,Type,Category,Note,Amount,Currency`; amount is **signed** (expenses
  negative); up to 5000 rows; filename `spendchat-YYYY-MM-DD.csv`.
- On mobile: fetch the bytes with the bearer + `X-Workspace-Id` headers, write to
  a temp file (`path_provider`), then present the OS share sheet (`share_plus`).
- **Print** (web) is N/A on mobile — omit.

---

## 5a. Attachments (receipts / bills / invoices)

Transactions can carry up to **2 files** (≤ 5 MB each; images, PDF, Word,
Excel, CSV, plain text). Metadata comes embedded on every transaction
(`transaction.attachments: Attachment[]` — see [01](./01-api-reference.md) §6);
the bytes live behind short-lived presigned URLs.

**Where it lives in the UI:** the detail dialog (open a row/bubble). Show a row
of file chips — type icon + display name (`label ?? fileName`) + size
(`sizeBytes` → "820 KB"). A 📎 + count marks rows that have files.

- **View/open:** `GET /attachments/{id}/url` → `{ url, expiresInSeconds,
  fileName, contentType }`; fetch/open that `url` **without** the auth header
  (it's presigned). Images/PDF → in-app viewer; other types → OS open/share.
  For image tiles use `?variant=thumb` when `hasThumbnail` (small webp). Mint
  per view — don't cache the URL past ~5 min.
- **Upload (editor only):** camera / photo library / file picker → multipart
  `POST /transactions/{id}/attachments` (`files` field, repeatable). For images
  you may attach a small webp preview as `thumb_<index>` so lists get
  thumbnails. Enforce client-side: ≤ 2 total per transaction, ≤ 5 MB each,
  allowed types only. Errors: 400 too many, 413 too big, 422 bad type,
  503 storage not configured (hide the feature).
- **Rename/tag (editor):** `PATCH /attachments/{id} { label?, kind? }` — kind ∈
  `receipt | bill | invoice | other` (an optional preset tag; show as a chip).
- **Delete (editor):** `DELETE /attachments/{id}` (also removes the stored
  object). Confirm first — there's no undo.

Viewers can see and open files but get no upload/edit/delete affordances.

---

## 6. Ordering & scope recap

- Order: `occurredOn desc, createdAt desc` (server-side — just render as
  returned).
- Access is scoped to the current workspace's accessible profiles; the
  `profile` param narrows to one profile or all. `transactions.user_id` is
  attribution only, not a filter.
