# 04 · Tracker (Chat-Style Entry) — the Hero Screen

The Tracker is a **chat thread of transactions** with a **composer pinned to the
bottom**. You add income/expenses like sending chat messages. This is the app's
signature screen — get it right.

Route: `/app`. Data: the **current month** of transactions for the current
profile scope, **oldest-first** (like a chat), capped at 300 rows
(`GET /transactions?from=<month-start>&to=<month-end>&profile=<id|all>`; the web
uses an ascending list — request newest-last ordering, i.e. sort ascending by
`occurredOn` client-side after fetching, or fetch and reverse).

---

## 1. Layout (top → bottom)

1. **Sticky header** — profile switcher on the left; a **month summary/balance
   bar** on the right.
2. **Feed** — day-grouped list of transaction **bubbles**, scrolled to the
   bottom on load. Max content width ~672px (`max-w-2xl`), centered.
3. **Composer** — pinned above the bottom nav.
4. **Swipe gesture** layer — horizontal swipe changes profile (see
   [03](./03-navigation-shell.md) / [07](./07-profiles-and-categories.md)).

### Month summary / balance bar (header, right side)
Uses the analytics **summary** for the visible month + profile scope
(`GET /analytics/summary?from&to&profile`).

- **Mobile:** right-aligned column — the **balance** (`text-base`, semibold,
  tabular); below it an 11px row: `+{income}` in **emerald**, then
  `−{expense}` (U+2212) in `muted-foreground`.
- A **negative balance** is shown in **rose** (`rose-600` / dark `rose-400`).
  (This is one of the few places rose appears.)
- Balance/income/expense are minor units → format with the currency decimals.

---

## 2. The chat bubble

Rendered for each transaction. **WhatsApp-style alignment:**

- **Income → left** (incoming/received). **Expense → right** (outgoing/sent).

### Structure
- Outer row: avatar + bubble, `gap` ~10px, max width **`max-w-sm` (384px)**.
  Expense rows are mirrored (avatar on the right).
- **Avatar:** a **36px** circle (`muted` bg) showing the **category emoji**, or
  `💸` when there's no category. (Tooltip/long-press shows the category name, or
  "Uncategorized".)
- **Bubble body:** `card` bg, 1px `border`, soft shadow (`shadow-sm`), radius
  `2xl` (**18px**) on all corners **except** the top corner nearest the avatar,
  which is squared (`rounded-tl-sm` for income/left, `rounded-tr-sm` for
  expense/right). Padding ~14px × 10px.
- **Entrance:** the `rise` animation (fade + translateY 6px→0 over 0.28s
  ease-out).
- **Tap** the bubble → the **detail dialog** (§6).

### Bubble content
- **Top row** (`space-between`):
  - **Heading** (left): `title` → else category name → else **"Transaction"**.
    14px, medium.
  - **Amount** (right): 16px, semibold, **tabular**.
    - **Income:** emerald, with a leading **`+`** (e.g. `+$100.00`).
    - **Expense:** neutral `foreground`, **no sign** (e.g. `$100.00`). The
      neutral colour + outgoing position already read as "money out".
- **Description** (if present): 14px, `muted-foreground`, wraps, preserves line
  breaks. No expand/collapse.
- **Author label (shared workspaces only):** when the workspace has **more than
  one user**, show who entered the row (WhatsApp-group style) — a small label
  above/inside the bubble using `transaction.user.name ?? email`, tinted with a
  stable per-user color derived from `user.id`. In a solo workspace show no
  author labels at all. (The API always returns `transaction.user`.)
- **Attachment indicator:** when `transaction.attachments` is non-empty, show a
  small 📎 (paperclip) + count in the meta row. Tapping through to the detail
  dialog lists the files (see [05](./05-transactions.md) § Attachments).
- **Bottom meta row** (12px, `muted-foreground`, `space-between`):
  - **Left:** category emoji (`🏷️` if none) + name (`"Uncategorized"` if none),
    truncated.
  - **Right:** the **time** (`h:mm AM/PM`, from `createdAt` in the device
    timezone) and any inline actions.

---

## 3. Day grouping

- Rows are oldest-first; group **consecutive** rows by `occurredOn` (the
  transaction's calendar date, **not** `createdAt`). A new group starts whenever
  the date changes.
- Between groups, a centered **day divider** pill: `muted` bg, rounded-full,
  `px-3 py-1`, 12px medium `muted-foreground`.
- Divider label: **"Today"** / **"Yesterday"** / else the date `"Jun 17, 2026"`.
  Compute "today"/"yesterday" in the device timezone; format the fallback date in
  **UTC** so the stored calendar date is shown exactly (see
  [11](./11-additional-details.md) § Dates).

### Empty feed
Centered empty state: a `message-square-plus` icon in a 48px `muted` circle,
heading **"No transactions yet"**, subtext **"Add your first one below — type an
amount, pick a category, and send."**

---

## 4. The composer (core entry surface)

Pinned to the bottom (above the bottom nav), `background`, top border. Inner
content centered at `max-w-2xl`.

**The composer has two personalities, switched by a Manual / AI toggle** (a
small segmented pill above/inside the composer). *Manual* is the structured
entry described in this section; *AI* is a free-text note parsed by a model
(§4.11). The choice is a **device-local preference** — persist it (shared
preferences) and reopen the composer in the same mode; default **manual**. The
AI segment and AI mode's primary buttons use the app's **one gradient
exception**: blue→violet (see [02](./02-design-system.md)) — that's the visual
marker for "this calls a model". **Hide the AI mode entirely for viewers**
(`workspace.role` viewer / a grant-only viewer): the server rejects them with
403 anyway.

Manual-mode element order:

1. **Controls row:** the **type toggle** (left) + a right cluster with the
   **date picker**, and — only when "All profiles" is active — a **profile
   picker** (and, on mobile in all-profiles mode, a compact category tag).
2. **Category chip row** (full width; behaviour depends on layout — see §4.3).
3. **Input row:** the amount/title fields (order depends on **input mode**), a
   description-toggle button (mobile), and — on wide layouts — an inline send
   button.
4. **Description field** (always visible on wide; toggled on mobile).
5. **Full-width Send button** (mobile).

### 4.1 Type toggle (segmented pill)
A pill (`muted/50` track, rounded-full, hairline border, `p-0.5`) with two
segments in order **Expense | Income**. The active segment gets a `background`
fill + `shadow-sm` + medium weight; inactive is `muted-foreground`.

- Each segment has an icon + label. **The label is hidden on mobile (icon
  only).** Icons keep their colour: income `arrow-up-circle` **emerald**, expense
  `arrow-down-circle` **rose**.
- **Default type = expense.**
- Switching the type **clears the selected category** (categories are per-type).

### 4.2 Date picker
A button + popover calendar (not a native field). **Default = today**, **max =
today** (no future dates). On mobile show a compact label ("6 Jul"); wide shows
"Jul 6, 2026". Use `showDatePicker` or a calendar popover; cap `lastDate` at
today.

### 4.3 Category chip row
Categories filtered to the **current type**. Default shape: a **horizontally
scrollable row of emoji chips** + a trailing **"More"** button (chevron) that
opens a grid popover of all categories plus an **"Edit categories"** action
(opens the category editor — see [07](./07-profiles-and-categories.md)).

- **Chip:** pill, `border`, `px-2.5 py-1`, 14px; emoji (`🏷️` fallback) + name
  (truncated). **Selected chip is inverted:** `foreground` bg, `background` text,
  `foreground` border. Tapping the selected chip again **deselects** it.
- Empty state: "No categories yet."
- On mobile, when **"All profiles"** is active, the full chip row collapses into
  a single compact tag button in the controls row (opens the same grid popover).

### 4.4 Profile picker (only in all-profiles mode)
Rendered only when the scope is "All profiles" **and** there are profiles.
Selecting one sets where the new transaction lands. When a specific profile is
already the scope, the picker is hidden and new transactions land in that
profile. Trigger shows the profile emoji (`👤` fallback) + name (name hidden on
mobile — emoji only).

### 4.5 Amount & title fields — the **three input modes**
The order/shape of the amount+title inputs is driven by the user's
`settings.inputMode`:

| Mode | Layout |
|---|---|
| **`amount_title`** *(default)* | amount field, then title field |
| **`title_amount`** | title field, then amount field |
| **`combined`** | one field holding **two zones** — an amount chip and the title beside it |

**Amount field:** a currency **symbol prefix** (from the currency), numeric
keyboard (`decimal`), placeholder `"0.00"`, tabular. Sanitize input to digits +
`.`/`,` only.

**Title field:** placeholder `"Add a title — type # to tag a category"`, max
**40** chars (the server cap). Typing **`#query`** at the end opens an **inline
category picker** (see §4.6).

**Combined field:** *not* one string that gets parsed. It's a shell styled like
an input (same border/ring, focus moved to focus-within) holding two real
inputs side by side:

- an **amount chip** — a small rounded fill carrying the currency symbol and a
  numeric input sized to its content (`decimal` keyboard, placeholder `"0.00"`,
  digits + `.`/`,` only, max **20** chars). It tints with the type: muted for
  expense, a faint emerald for income.
- the **title** beside it — placeholder `"Add a title — type # to tag a
  category"`, max **40** chars (the server cap), with the same `#` picker as
  §4.6.

Hand-over rules, so "100 fruits" is still typed in one burst:
- **Space** (or **Enter**) in the chip moves the caret to the title, once the
  chip has something in it. It is never typed into the amount — which costs the
  space as a grouping separator in the locales that use one ("1 000"); typing
  the digits alone reads the same.
- **⌘/Ctrl+Enter** in the chip sends, like anywhere else.
- **Backspace** at the very start of the title steps back into the chip.
- Tapping the shell's padding lands in whichever zone is still empty; tapping
  an untouched field starts in the chip.
- **Pasting** into the chip splits (see §4.7).

Over the 9-whole-digit cap the shell turns red (that state replaces the focus
ring) and the send is blocked.

**Enter/submit affordances (wide layouts, informational):** in `title_amount`,
Enter on the amount (last field) submits; otherwise Enter advances to the next
field; Shift+Enter reveals/focuses the description. On mobile, rely on the Send
button + keyboard "done"/"next" actions.

### 4.6 The `#` inline category picker
When the title (or combined) field ends with `#query`:
- Show a small anchored popover of matching categories (name contains `query`,
  max 8). Highlight one; up/down to move, enter/tab to select, escape to dismiss.
- Selecting sets the category **and strips the `#query` token** from the field.
- Empty: `No category matches "{query}"`.
- On mobile this is a nice-to-have; at minimum keep the "More" grid popover.

### 4.7 Pasting into the amount chip
Typing fills the two zones directly (§4.5), so parsing is only needed for a
**paste into the chip** — "100 fruits" copied from a message should still end up
split. Mirror `src/lib/quick-entry.ts` (`parseQuickEntry` + `splitChipPaste`):

```
QUICK_ENTRY_RE = /^\s*[^\d\s]?\s*(\d+(?:\.\d+)?)\s*(.*)$/
```

- Optional leading whitespace, **one optional non-digit non-space char** (a
  currency symbol like `$`), optional space, then the number, then the rest =
  title.
- Examples: `"100 fruits"` → `{100, "fruits"}`; `"12.50 lunch w/ team"` →
  `{12.5, "lunch w/ team"}`; `"$100 fruits"` → `{100, "fruits"}`; `"100"` →
  `{100, ""}`; `"fruits"` → `{null, "fruits"}` (no leading number ⇒ no amount).
- The number swallows its own separators, so `"1,000 rent"` is 1000 — not 1 with
  the title `",000 rent"`. Separators follow the user's locale.

**What to do with the result** — the amount goes in the chip, the title joins
the title zone, and the caret follows it. **When the parse yields no amount, the
whole pasted string goes to the title and the chip is left empty.** Do *not*
salvage an amount by deleting the non-numeric characters: "Dinner for 2 people
800" reduces to 2800 and "Rs. 500 groceries" to 0.5, both of which would send
without a warning. An empty chip blocks the send and the paste stays on screen
to be fixed — the whole point of this parser is that it never guesses at money.

A paste of digits and separators alone needs no split: insert it as pasted, even
if it lands over the 9-digit cap (it shows red), rather than dropping it
silently.

### 4.8 Description field
A single-line input (placeholder `"Add a description (optional)"`, max **150**,
the server cap). On wide layouts always visible; on mobile hidden behind a
toggle button (`align-left` icon; pressed state reflects visibility).

### 4.9 Send button
- **Mobile:** a **full-width** primary button `h-9` with an up-arrow + **"Send"**.
- **Wide:** an inline icon button (`h-9`) with an up-arrow (+ a `⌘↵` hint,
  web-only — omit on mobile).

### 4.10 Validation (on submit)
Check in this order; on failure show a **toast** and stop:
1. **Amount** > 0 (combined mode reads its chip). Unreadable → `"That amount
   isn't clear — try 12.50"` (the example formatted in the user's locale);
   empty/≤0 → `"Enter an amount greater than 0"`. Focus **the amount field** —
   the one that's wrong. Over 9 whole digits → `"Amount is too large (max 9
   digits)"`.
2. **Title** required (trimmed). Empty → `"Add a title"`.
3. **Date** present → else `"Pick a date"`.
4. **Profile** resolved → else `"Pick a profile"`.

Then build `TransactionInput`:
`{ type, amount, categoryId, profileId, title, description?, occurredOn }` and
`POST /transactions`.

### 4.11 AI mode — free-text (and voice) entry

The composer's second personality. One rounded box (ChatGPT-style) with a
multi-line note field and, pinned in its corner, a **mic button** and a
**gradient send button** (blue→violet, the AI accent). A small help affordance
explains the note syntax.

**Compose → parse → review → save.** Nothing is written until the final step:

1. **Note field.** Placeholder: `"Describe your spending — e.g. 200 fruits,
   1000 electricity (June bill) #Bills, got 5000 salary"`. Max **2000** chars
   (cap the field client-side; the server 400s past it). Syntax the parser
   honours — surface these in a help sheet:
   - one transaction per item/amount ("200 fruits, 100 veg" = two rows);
   - `#CategoryName` tags a category;
   - `(parentheses)` become the description;
   - income words ("got 5000 salary", "refund") flip the type;
   - relative dates ("yesterday", "last Friday") resolve against the device
     timezone.
2. **Send** → `POST /ai/parse { text, timezone: <device IANA zone> }` with a
   loading state on the gradient button. Errors, mapped for the user:
   400 nothing-parseable (show the server message — it's written for users),
   429 quota ("try again later"), 503 feature-off (hide/disable AI mode with a
   notice), 502 retry.
3. **Review grid** (replaces the note in the composer): one editable row per
   draft — compact type toggle, amount, title, **description** (pencil toggles
   an edit field), category select (options of the row's type; "" = none), date
   picker (max today). Row actions: **remove**; a trailing **"add row"** (+)
   for anything the AI missed; **"Start over"** (↺) drops the drafts but keeps
   the note text so the user can fix the wording and re-parse.
4. **Save** (gradient primary, e.g. "Add N transactions") → validate rows like
   manual entry (amount > 0, title non-empty), then commit via
   `POST /transactions/bulk` with the kept rows mapped to `TransactionInput`
   (`categoryId` comes straight off the draft). Toast the count, clear back to
   the empty note, refresh the feed.

**Voice entry (hold-to-talk).** The mic is **held, not tapped** (walkie-talkie
style — on web it's hold the button or hold `M`):

- While held: record (`MediaRecorder` equivalent — on Flutter, e.g. the
  `record` package, AAC/M4A or Opus), show a **listening strip** with an
  elapsed/level indicator. Optionally show live interim text from the
  platform's on-device speech recognizer (`speech_to_text`) as a grey preview —
  it's cosmetic only; the real transcript comes from the server.
- **Auto-stop at 60 s** (the server rejects > 4 MB).
- On release: upload as **multipart** to `POST /ai/transcribe` (`audio` field;
  set the part's content type, e.g. `audio/mp4` for m4a). Show a transcribing
  spinner on the mic.
- The returned `text` is **inserted into the note field** (append to whatever's
  typed) — the user reads it, fixes a misheard merchant, and presses send.
  Voice never creates transactions directly; it feeds the same parse→review
  path.
- Errors: 400 "couldn't hear anything" → toast + let them retry; 503 → hide the
  mic (transcription not configured); 429/502 as above. Ask for the microphone
  permission on first hold, not at app start.
- The languages the model expects come from `settings.voiceLanguages`
  (Settings → Voice, see [08](./08-settings.md)) — code-mixed speech works
  because the list can name several.

**Gating recap:** AI mode (toggle + mic) is hidden for viewers; both endpoints
also enforce editor + a shared 30-requests/hour per-user quota server-side.

---

## 5. Optimistic send & reconciliation

This is what makes it feel like chat. On submit:

1. **Immediately append** a pending bubble with a client `tempId`, status
   `sending`, `createdAt = now`, and a display snapshot (type, amountMinor via
   `toMinorUnits`, title, description, category name/icon, profileId).
2. **Immediately clear the composer** (amount, title, combined, description,
   description toggle → off, category → null, date → today) and refocus the first
   field for rapid successive entry.
3. Fire `POST /transactions` in the background.
   - **Success:** mark the bubble `sent` and store the returned real `id`. Keep
     it until a refreshed feed contains that id, then swap seamlessly (no flash).
   - **Failure:** mark it `failed`; show a **"Not sent"** label (rose) with a
     **"Try again"** action (replays the same input) and a dismiss (×).
4. **Scroll to bottom** whenever a new bubble appears.

Visual states:
- **sending:** bubble at ~60% opacity with a small **amber "coin"** spinner
  (`coin-flip` animation) instead of a timestamp.
- **sent (unconfirmed):** normal bubble showing the real time.
- **failed:** the "Not sent" + retry/dismiss row.

Only show pending bubbles that belong to the profile in view (a bubble with no
profile filter shows in all scopes). Suppress the empty state while any pending
bubble is showing.

> Update/delete are **not** optimistic in the web app — they mutate then rely on
> a refetch. You can keep the same simplicity on mobile, or add light
> optimism if it feels better.

---

## 6. Transaction detail dialog

Tapping a (real) bubble opens a dialog (`sm` width; outside-click closes).

- **Header:** a 44px `muted` circle with the category emoji (`💸` fallback); the
  title (`title || categoryName || "Transaction"`) with the capitalized `type`
  beneath; and a right-aligned **signed** amount (16–18px, semibold, tabular).
  Here the amount **is signed**: income `+$…` (emerald), expense `−$…` (U+2212,
  neutral).
- **Description** (if present): in a `muted/50` rounded block, scrollable.
- **Attachments** (if any): a row of file chips (icon + display name — `label ??
  fileName`); tapping one opens/downloads it via `GET /attachments/{id}/url`.
  Editors can add files (photo/camera/file picker → multipart upload) and delete
  them here. See [05](./05-transactions.md) § Attachments.
- **Fields** (label/value rows): **Category** (`{icon} {name ?? "Uncategorized"}`),
  **Profile** (`{icon} {name ?? "—"}`), **Date** (`Jul 6, 2026`), and — in a
  shared workspace — **Added by** (`user.name ?? email`).
- **Footer:** **Edit** (ghost, pencil) → opens the edit form (§7); **Delete**
  (destructive, trash) → `DELETE /transactions/{id}`, toast "Transaction
  deleted", close. **No extra confirm step** — a single tap deletes. (Consider a
  small confirm on mobile to avoid accidental deletes; the web does not.)

---

## 7. Add / edit form (shared dialog)

The tracker composer is the fast path; a fuller **Add/Edit dialog** exists too
(used by the Transactions screen's "Add transaction" and by the detail dialog's
Edit). Title "Add transaction" / "Edit transaction"; description "Amounts are
recorded in {CODE}." Fields:

- **Type toggle** (expense first, default expense; switching clears category).
- **Amount** (numeric, currency symbol prefix, placeholder "0.00"). Must be > 0.
- **Date** (default today, max today). Required.
- **Category** (select; default "No category" → null; options filtered to the
  type).
- **Profile** (select; default the active/first profile).
- **Title** (max 40, "Add title").
- **Description** (textarea, 2 rows, max 150, "Optional description").
- Submit "Add transaction" / "Save changes" → `POST` / `PATCH`. Toasts
  "Transaction added" / "Transaction updated". On add, reset the form.

For edit, prefill the amount as the **unsigned major-unit string** (e.g. `12.50`)
from `amountMinor`.

---

## 8. Bulk add

A power feature: add many transactions at once. On mobile, surface it from the
top bar (`list-plus` icon).

### Two ways in
- **Spreadsheet-style table editor** (primary): rows with columns Type, Amount,
  Title, Description, Category, Date, and (in all-profiles mode) Profile, plus a
  remove button. Opens with **3 blank rows** (default type expense, date today).
  A header "New rows:" date picker sets the default date for new/blank rows.
  Per-row: a type toggle (icon-only, tinted ring when active — emerald/rose), an
  amount field with the currency prefix, title (max 40), description (max 150),
  a category select (per the row's type), a per-row date (max today), optional
  profile, and remove (can't remove the last row).
- **Paste box** (secondary): a collapsible multi-line textarea that parses
  spreadsheet/CSV-ish text into rows.

### Paste parse format (mirror `src/lib/bulk-parser.ts`)
- One transaction per line; blank lines and lines starting with `#` are skipped.
- Comma-separated columns: **`amount, note, category, type, date`** — only
  `amount` is required.
- **Amount:** optional leading `+`/`-` sets the type sign; value must be finite,
  `> 0`, `≤ 999,999,999.99`.
- **Type:** explicit `type` column wins, else the sign (`+` → income, default
  expense). Aliases: income = `income|in|inc|+`; expense = `expense|exp|out|-`.
- **Date:** defaults to today; if present must be a valid `YYYY-MM-DD`.
- `note` truncated to 280 chars. Returns `{ drafts, errors[] }` (each error has
  a line number + message; surface them as warnings).

### Import
- A "filled" row = has an amount, title, description, or category. Each filled
  row needs **amount > 0 AND a non-empty title**, else highlight the invalid
  cells and toast `"Each row needs a number for the amount and a title"`.
- On import → `POST /transactions/bulk { items: [...] }` (server limit **1–500**
  items). Toast `"Imported N transaction(s)"`, reset to 3 blank rows, close.

> A simpler v1 is acceptable: a paste box + parse + a review list + import. The
> full inline-editable table is a nice-to-have that matches the web exactly.

---

## 9. Loading & skeletons

While the feed loads, show a **chat skeleton**: ~7 bubble placeholders
alternating left/right, every third one wider. Each is an avatar circle +
bubble-shaped placeholder with a couple of shimmer lines. Use pull-to-refresh to
reload the month.
