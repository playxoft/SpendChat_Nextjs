# 08 · Settings

Route: `/settings`, which lands on **Account**. Sections (in nav order): Account,
Workspace, Theme, Input, Voice, Categories, Shortcuts.

**User** settings (`theme`, `inputMode`, `voiceLanguages`) persist via
`PATCH /settings` (partial) and follow the account across devices and
workspaces. **Currency + number format (locale) are per-workspace** — edited
under Workspace settings via `PATCH /workspaces/{id}` (admin only), and read
from the `workspace` object (`/me`, `/workspaces`).

Persisted user `settings` fields: `theme`, `inputMode`, `voiceLanguages` (plus
`lastWorkspaceId`, managed by workspace switching). **There is no timezone
setting** — timezone is device-derived (see
[11](./11-additional-details.md)).

---

## 1. Account

Card "Account" ("Signed in as {email}") holds the **Danger zone** (§6). Currency
and number format used to live here; they moved to **Workspace settings** (§ 1a).

## 1a. Workspace currency + number format

Under **Settings › Workspace**, a "Currency & number format" card. Everyone in
the workspace sees amounts in this currency; **only admins can change it** —
non-admins see the controls read-only (no Save/Cancel). Values come from the
`workspace` object; on save → `PATCH /workspaces/{id} { currency, locale }`,
toast "Workspace currency saved".

- **Currency** — a searchable combobox over the **59 supported currencies**
  (§2). Helper: "Everyone in this workspace sees amounts in this currency.
  Existing amounts keep their stored value; only how they're displayed changes."
- **Number format (locale)** — a select from this fixed list (value · sample):

  | Value | Label |
  |---|---|
  | `en-US` | English (US) · 1,234.56 |
  | `en-GB` | English (UK) · 1,234.56 |
  | `en-IN` | English (India) · 1,23,456 |
  | `de-DE` | German · 1.234,56 |
  | `fr-FR` | French · 1 234,56 |
  | `es-ES` | Spanish · 1.234,56 |
  | `pt-BR` | Portuguese (BR) · 1.234,56 |
  | `ja-JP` | Japanese · 1,234 |

- **Dirty-state save (admins only):** a **Save changes** button enabled only
  when the form differs from the loaded values, and a **Cancel** that reverts. On
  save → `PATCH /workspaces/{id} { currency, locale }`, toast "Workspace currency
  saved". Non-admins get no Save/Cancel — the controls are read-only.

> **Currency vs. locale are separate.** Currency provides the symbol + decimals
> (money math); locale controls number grouping/decimal separators for display
> (`intl` `NumberFormat`). A currency has **no** locale attached.

---

## 2. Supported currencies (59)

`code · name · symbol · decimals`. Decimals drive minor-unit math — get them
right. Bundle this table in `core/currencies.dart` (the API also returns
`currencyDetail`/`meta.currency` at runtime, so you can rely on the server for
the active one, but you need the list for the picker).

| Code | Name | Symbol | Dec | | Code | Name | Symbol | Dec |
|---|---|---|---|---|---|---|---|---|
| USD | US Dollar | $ | 2 | | SAR | Saudi Riyal | ﷼ | 2 |
| EUR | Euro | € | 2 | | QAR | Qatari Riyal | ﷼ | 2 |
| GBP | British Pound | £ | 2 | | KWD | Kuwaiti Dinar | KD | **3** |
| INR | Indian Rupee | ₹ | 2 | | BHD | Bahraini Dinar | BD | **3** |
| JPY | Japanese Yen | ¥ | **0** | | OMR | Omani Rial | ﷼ | **3** |
| CAD | Canadian Dollar | CA$ | 2 | | JOD | Jordanian Dinar | JD | **3** |
| AUD | Australian Dollar | A$ | 2 | | EGP | Egyptian Pound | E£ | 2 |
| SGD | Singapore Dollar | S$ | 2 | | KES | Kenyan Shilling | KSh | 2 |
| AED | UAE Dirham | د.إ | 2 | | GHS | Ghanaian Cedi | GH₵ | 2 |
| CHF | Swiss Franc | CHF | 2 | | MAD | Moroccan Dirham | MAD | 2 |
| CNY | Chinese Yuan | ¥ | 2 | | TZS | Tanzanian Shilling | TSh | 2 |
| BRL | Brazilian Real | R$ | 2 | | UGX | Ugandan Shilling | USh | **0** |
| ZAR | South African Rand | R | 2 | | ETB | Ethiopian Birr | Br | 2 |
| NGN | Nigerian Naira | ₦ | 2 | | PKR | Pakistani Rupee | ₨ | 2 |
| HKD | Hong Kong Dollar | HK$ | 2 | | BDT | Bangladeshi Taka | ৳ | 2 |
| NZD | New Zealand Dollar | NZ$ | 2 | | LKR | Sri Lankan Rupee | Rs | 2 |
| SEK | Swedish Krona | kr | 2 | | NPR | Nepalese Rupee | Rs | 2 |
| NOK | Norwegian Krone | kr | 2 | | THB | Thai Baht | ฿ | 2 |
| DKK | Danish Krone | kr | 2 | | VND | Vietnamese Dong | ₫ | **0** |
| ISK | Icelandic Króna | kr | **0** | | IDR | Indonesian Rupiah | Rp | 2 |
| PLN | Polish Złoty | zł | 2 | | MYR | Malaysian Ringgit | RM | 2 |
| CZK | Czech Koruna | Kč | 2 | | PHP | Philippine Peso | ₱ | 2 |
| HUF | Hungarian Forint | Ft | 2 | | KRW | South Korean Won | ₩ | **0** |
| RON | Romanian Leu | lei | 2 | | TWD | New Taiwan Dollar | NT$ | 2 |
| BGN | Bulgarian Lev | лв | 2 | | MXN | Mexican Peso | MX$ | 2 |
| TRY | Turkish Lira | ₺ | 2 | | ARS | Argentine Peso | AR$ | 2 |
| RUB | Russian Ruble | ₽ | 2 | | CLP | Chilean Peso | CL$ | **0** |
| UAH | Ukrainian Hryvnia | ₴ | 2 | | COP | Colombian Peso | CO$ | 2 |
| ILS | Israeli New Shekel | ₪ | 2 | | PEN | Peruvian Sol | S/ | 2 |
| | | | | | UYU | Uruguayan Peso | $U | 2 |

- **0-decimal:** JPY, ISK, UGX, VND, KRW, CLP.
- **3-decimal:** KWD, BHD, OMR, JOD.
- Default currency: **USD**. Unknown code → the server falls back to USD.

---

## 3. Theme

Card "Theme" ("How SpendChat looks on this device."). A select: **Light / Dark /
System**.

- **Applies instantly** (no save/cancel) — set the app theme immediately, then
  `PATCH /settings { theme }` in the background (error toast only). It follows the
  account across devices. Mirror the value in the sidebar/topbar theme toggle so
  they agree.

---

## 4. Input (composer layout)

Card "Transaction input" ("Choose how the composer at the bottom of the tracker
lays out its fields when you add a transaction."). A 3-option radio group:

| Value | Label | Description | Preview |
|---|---|---|---|
| `amount_title` *(default)* | **Amount, then title** | "The original layout. Type the amount first, then a title beside it." | `[$ 100] [fruits]` |
| `title_amount` | **Title, then amount** | "Flip it around — type the title first, with the amount beside it." | `[fruits] [$ 100]` |
| `combined` | **One field (amount + title)** | "One field, two zones: a currency chip for the amount and the title beside it. Space jumps from the chip to the title — fastest for quick entries." | `[[$ 100] fruits]` |

- **Dirty-state save:** Save changes / Cancel (both disabled unless changed) →
  `PATCH /settings { inputMode }`, toast "Input layout saved".
- This controls the tracker composer's field layout — see
  [04](./04-tracker-chat.md) §4.5–4.7.

---

## 4a. Voice (languages the mic expects)

Card **"Voice languages"** ("Which languages the mic should expect. Pick every
language you speak while adding transactions — including mixing two in one
sentence."). Backs the tracker's hold-to-talk voice entry
([04](./04-tracker-chat.md) §4.11).

- A **multi-select** over the 27-language catalogue (codes + native names in
  [01](./01-api-reference.md) § Settings): English first, then Indian languages
  alphabetically, then the rest. Render each option as its **native name**
  (`हिन्दी`, `தமிழ்`, …) with the English name as secondary text.
- **1 to 5 selections** — disable further selection at 5. Deselecting the last
  one resets to English (the server would anyway).
- Save → `PATCH /settings { voiceLanguages: ["en","ta",…] }`, then read the
  **normalized** list back from the response (the server drops unknown codes,
  dedupes, caps at 5, and falls back to `["en"]`). Dirty-state Save/Cancel like
  the Input card.
- **Why a list:** the transcription model takes a free-text hint that can name
  several languages, which is what makes code-mixed speech ("groceries-க்கு 500
  rupees") transcribe correctly. Don't reduce it to one code.

---

## 5. Categories

Settings › Categories embeds the **category manager** — see
[07](./07-profiles-and-categories.md) §2.

---

## 6. Danger zone

A **confirm-by-typing-DELETE** pattern: each destructive action opens a dialog
whose description ends "Type **DELETE** to confirm.", with a text field
(placeholder "DELETE") and a confirm button **disabled until the text is exactly
`DELETE`**.

1. **Delete all transactions** — **workspace admins only** (hide/disable for
   everyone else; the server 403s non-admins). Clears **every** transaction
   (regardless of author) in the selected profiles of the current workspace;
   categories and settings are kept. Optionally offer a profile picker →
   `POST /transactions/delete-all { confirm: "DELETE", profileIds?: [...] }`
   (omitted/empty = all profiles). Toast with the returned `deleted` count.
2. **Delete account** — "Erase everything: your transactions, workspaces
   (including shared ones you own), categories, and settings." Confirm → the
   account-delete flow, then Firebase `deleteUser()` (if it needs a recent login,
   inform the user their data is gone but they must sign in again to remove the
   login), then sign out and return to the start.
   - *Note:* there is no `/api/v1` account-delete endpoint documented here (it's a
     web server action). For v1 mobile, you can either implement it if/when a
     `/v1` endpoint exists, or link out / defer account deletion to the web. Ship
     "Delete all transactions" at minimum.

---

## 7. Shortcuts

The web has keyboard shortcuts; **they're N/A on mobile.** Either omit the
Shortcuts section or show it read-only labelled "Keyboard shortcuts (web app)".
The behaviours that matter on mobile map to gestures/buttons:

| Web shortcut | Mobile equivalent |
|---|---|
| `q`/`t`/`e`/`s` navigate | bottom-nav tabs |
| `r` add / `b` bulk add | tracker/topbar buttons |
| `⌘/Ctrl+Enter` send | Send button |
| `Shift+Enter` description | description toggle |
| `#` tag category | inline `#` picker in the title field |
| `a` Manual/AI entry | the composer's Manual/AI toggle ([04](./04-tracker-chat.md) §4.11) |
| `m` (held) voice note | hold-to-talk mic button in AI mode |
| `g` workspace picker, then `1…9` | workspace dropdown in the nav drawer |
| `⌘/Ctrl+E` toggle type | composer type toggle |
| `Shift+1…0` / `Shift+`` ` profile switch | profile dropdown + swipe gesture |
| `⌘/Ctrl+P` print | N/A |

---

## 8. Workspaces & RBAC

Profiles live in **workspaces**; access = workspace membership or a per-profile
grant, with roles **viewer < editor < admin** (effective role on a profile =
max of the two).

- **viewer** — read profiles/transactions.
- **editor** — + create/edit/delete transactions, move a profile's transactions,
  manage categories, use AI/voice entry, manage attachments.
- **admin** — + manage/reorder profiles, members, workspace settings
  (currency), and clear transactions (delete-all).

**What the mobile app needs (v1, in scope):**
- Send `X-Workspace-Id` on every call (see [01](./01-api-reference.md) §3).
- Read the current workspace + role from `GET /me` → `data.workspace`.
- A **workspace switcher** (read/switch only), persisting the chosen id.
- **Gate edit/delete UI by role:** viewers get a read-only app; hide add/edit/
  delete and profile-management affordances. Treat `role: null` (grant-only) like
  a viewer at the workspace level.

**In scope since spec 1.3.0:** **creating workspaces** — Settings has a "New
workspace" dialog backed by `POST /api/v1/workspaces` (name ≤30, optional emoji
icon; the caller becomes admin, gets a default "Personal" profile, and the app
switches to the new workspace).

**Likely out of scope for v1 (admin web flows):** renaming workspaces, inviting/
removing members, changing roles, cancelling invites, per-profile sharing
management. These are admin-only and can stay on the web. If you do add them
later, they're server actions today — they'd need `/api/v1` endpoints first.

**Workspace copy (for reference if you build the admin UI):**
- Create dialog: "New workspace" / "A workspace has its own profiles and members
  — handy for a company, a family, or a side project." Name field (≤30 chars) +
  optional emoji icon picker (default 🏢). A new workspace bootstraps admin
  membership + a default "Personal" profile.
- Roles select: Viewer "can view", Editor "can add & edit transactions", Admin
  "can manage everything".
