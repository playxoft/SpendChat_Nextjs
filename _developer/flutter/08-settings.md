# 08 · Settings

Route: `/settings`, which lands on **Account**. Sections (in nav order): Account,
Workspace, Theme, Input, Categories, Shortcuts. All settings persist server-side
via `PATCH /settings` (partial) and follow the account across devices.

Persisted `settings` fields: `currency`, `locale`, `theme`, `inputMode` (plus
`lastWorkspaceId`, managed by workspace switching). **There is no timezone
setting** — timezone is device-derived (see [11](./11-additional-details.md)).

---

## 1. Account (currency + number format)

Card "Account" ("Signed in as {email}"). Contains the currency + locale form and,
below it, the **Danger zone** (§6).

- **Currency** — a searchable combobox over the **59 supported currencies**
  (§2). Helper: "Currency is applied across the whole app. Existing amounts keep
  their stored value; only how they're displayed changes."
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

- **Dirty-state save:** a **Save changes** button enabled only when the form
  differs from the loaded values, and a **Cancel** that reverts. On save →
  `PATCH /settings { currency, locale }`, toast "Settings saved".

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
| `combined` | **One field (amount + title)** | "A single field. The leading number becomes the amount and the rest becomes the title — fastest for quick entries." | `[100 fruits]` → $100 · fruits |

- **Dirty-state save:** Save changes / Cancel (both disabled unless changed) →
  `PATCH /settings { inputMode }`, toast "Input layout saved".
- This controls the tracker composer's field layout — see
  [04](./04-tracker-chat.md) §4.5–4.7.

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

1. **Delete all transactions** — "Permanently remove every transaction. Your
   categories and settings are kept. This cannot be undone." Confirm →
   `POST /transactions/delete-all { confirm: "DELETE" }`, toast "All transactions
   deleted".
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
| `q`/`t`/`a`/`s` navigate | bottom-nav tabs |
| `e` add / `b` bulk add | tracker/topbar buttons |
| `⌘/Ctrl+Enter` send | Send button |
| `Shift+Enter` description | description toggle |
| `/` tag category | inline `/` picker in the title field |
| `⌘/Ctrl+E` toggle type | composer type toggle |
| `Shift+1…0` / `Shift+`` ` profile switch | profile dropdown + swipe gesture |
| `⌘/Ctrl+P` print | N/A |

---

## 8. Workspaces & RBAC

Profiles live in **workspaces**; access = workspace membership or a per-profile
grant, with roles **viewer < editor < admin** (effective role on a profile =
max of the two).

- **viewer** — read profiles/transactions.
- **editor** — + create/edit/delete transactions, reorder/move profiles.
- **admin** — + manage profiles, members, and workspace settings.

**What the mobile app needs (v1, in scope):**
- Send `X-Workspace-Id` on every call (see [01](./01-api-reference.md) §3).
- Read the current workspace + role from `GET /me` → `data.workspace`.
- A **workspace switcher** (read/switch only), persisting the chosen id.
- **Gate edit/delete UI by role:** viewers get a read-only app; hide add/edit/
  delete and profile-management affordances. Treat `role: null` (grant-only) like
  a viewer at the workspace level.

**Likely out of scope for v1 (admin web flows):** renaming workspaces, inviting/
removing members, changing roles, cancelling invites, per-profile sharing
management, creating workspaces. These are admin-only and can stay on the web.
If you do add them later, they're server actions today — they'd need `/api/v1`
endpoints first.

**Workspace copy (for reference if you build the admin UI):**
- Create dialog: "New workspace" / "A workspace has its own profiles and members
  — handy for a company, a family, or a side project." Single Name field
  (≤60 chars). A new workspace bootstraps admin membership + a default "Personal"
  profile.
- Roles select: Viewer "can view", Editor "can add & edit transactions", Admin
  "can manage everything".
