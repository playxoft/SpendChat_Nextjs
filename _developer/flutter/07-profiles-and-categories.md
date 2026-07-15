# 07 · Profiles & Categories

Two "manage" features. **Profiles** are WhatsApp-style threads that scope the
data; **categories** are per-user income/expense buckets with emoji icons.

---

## 1. Profiles

A profile has `name`, `icon` (emoji), `color` (in the schema but **no UI sets
it**), and `sortOrder`. Profiles belong to a workspace; names are unique per
workspace. Every workspace always has **at least one** profile (a default
"Personal" is created at bootstrap).

API: `GET/POST /profiles`, `PATCH/DELETE /profiles/{id}`,
`POST /profiles/reorder`, `POST /profiles/{id}/move`. RBAC:
- create/rename/delete require **admin**; reorder/move require **editor**.
- 404 = no access; 403 = role too low. Gate the UI on the current workspace role
  (viewers see profiles read-only).

### 1.1 Switching (the primary interaction)
Covered in [03](./03-navigation-shell.md) §3 and [04](./04-tracker-chat.md):
- Tracker header dropdown + an **"All profiles"** aggregate (`🗂️`).
- Mobile **swipe** left/right cycles profiles, wrapping through "All profiles"
  (sequence `[...profileIds, "all"]`; left → next, right → previous). Thresholds:
  ≥60px horizontal, ≤45px vertical, ≤600ms, single touch; ignore swipes starting
  on inputs/buttons/dialogs/menus.
- Selecting a profile scopes the tracker/transactions/analytics via the
  `profile` query param.

### 1.2 Manage profiles (list)
A list (in the profiles drawer / a settings-adjacent screen):
- Header "Profiles" + an **Add (+)** button.
- Each row: emoji (`👤` default) + name + a **⋮ / long-press menu** with **Edit**
  and **Delete**.
- **Reorder** by drag (a grip handle) → `POST /profiles/reorder { ids: [...] }`
  with the **full** ordered id list. Apply optimistically, then re-sync from the
  server response.
- An **"All profiles"** entry (`layout-grid`) pinned last.

### 1.3 Create / edit
A dialog "New profile" / "Edit profile", description "Profiles group
transactions like separate chats (Personal, Company, Home…)."
- Fields: an **emoji picker** (default `👤`) + a **name** field (placeholder
  "Profile name", autofocus, 1–40 chars).
- **No color picker** (color is unused in the UI).
- Empty name → toast "Enter a profile name". Submit → `POST` / `PATCH`; toast
  "Profile added" / "Profile updated".

### 1.4 Delete (with move)
A dialog `Delete "{name}"?` / "Its transactions will be moved to another profile
so nothing is lost."
- If **other profiles exist:** a **"Move transactions to"** select (defaults to
  the first other profile). On confirm → `POST /profiles/{id}/move { toProfileId }`
  **first**, then `DELETE /profiles/{id}`. Toast "Profile deleted".
- If it's the **only** profile: show "This is your only profile, so it can't be
  deleted." and disable Delete.
- Server also enforces this: **409** "You need at least one profile" (last) and
  **409** "Move this profile's transactions to another profile first" (non-empty)
  — surface those messages if you hit them.

---

## 2. Categories

Per-user income/expense buckets. A category has `name`, `kind`
(`income`/`expense`), and `icon` (emoji). **No color.** Names are unique per
(user, kind). Categories are **per-user**, not per-workspace — they're shared
across all your workspaces/profiles.

API: `GET/POST /categories`, `PATCH/DELETE /categories/{id}`. Ordered income
first, then by name.

### 2.1 Manager (Settings › Categories)
- Header: a count (`"{n} categories"`) + an **"Add category"** button (opens the
  editor defaulting to the **expense** kind).
- Two groups side by side / stacked: **Expense** and **Income** (filtered by
  `kind`). Per-group empty state: "No categories yet."
- Each row: an **emoji picker** button (default `🏷️`) that inline-updates the
  icon (`PATCH /categories/{id} { icon }`), the name, and an **×** to delete
  (`DELETE`, toast "Category removed").
- The manager exposes **icon change + delete + add-new**; renaming is done via
  the editor dialog / API (`PATCH { name }`).

### 2.2 Editor dialog (also opened from the tracker `/` picker)
"Edit categories" / "Add or remove categories for income and expenses."
- A segmented **expense / income** toggle (resets to the incoming kind).
- **Add row:** emoji picker (default `🏷️`) + a name field (placeholder "New
  category name", autofocus) + a **+** submit. Empty name → toast "Enter a
  category name". Success → toast "Category added", reset the row.
- A grid of existing categories for the active kind, each with a delete (×).
  Empty: "No {kind} categories yet."
- Fields/limits: name 1–40, icon ≤16 chars.

### 2.3 Delete behaviour
Deleting a category **does not delete its transactions** — their `categoryId` is
set to `null` (they become "Uncategorized"). No confirmation dialog in the web
app; consider a light confirm on mobile.

### 2.4 Default seed categories
New users are seeded (server-side at first sign-in) with these — you don't create
them, but knowing them helps design empty/first-run states:

- **Expenses:** Food & Dining 🍽️, Groceries 🛒, Transport 🚆, Housing 🏠,
  Utilities 💡, Shopping 🛍️, Health ⚕️, Entertainment 🎬, Education 📚, Other 📦
- **Income:** Salary 💼, Freelance 🧾, Investments 📈, Gifts 🎁, Other ➕

---

## 3. The emoji picker

Used for both category and profile icons (and inline icon edits). It's a simple
**emoji grid + free-text** affordance. On Flutter, use `emoji_picker_flutter` or
a lightweight grid; the value stored/sent is just the emoji **string** (≤16 chars
for categories/profiles). Fallbacks used across the app: category `🏷️`, profile
`👤`, transaction avatar `💸`, all-profiles `🗂️`.
