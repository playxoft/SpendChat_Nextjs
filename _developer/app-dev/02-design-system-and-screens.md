# SpendChat Flutter — Design System & Screens

Match the web app exactly. It's **minimal and neutral**: a grayscale palette, no
gradients, generous white space, rounded cards, subtle shadows and borders. The
only accent is **emerald for income**. Font is **Geist**.

---

## 1. Color tokens

The web app defines its palette in OKLCH; below are the equivalent sRGB hex
values (grays are neutral, chroma 0). Wire these into `app_colors.dart`.

### Light (default)

| Token | Hex | Use |
|---|---|---|
| background | `#FFFFFF` | app background |
| foreground | `#0A0A0A` | primary text |
| card / popover | `#FFFFFF` | cards, sheets, menus |
| card/popover foreground | `#0A0A0A` | text on cards |
| primary | `#171717` | primary buttons, send button bg |
| primary-foreground | `#FAFAFA` | text on primary |
| secondary / muted / accent | `#F5F5F5` | chips, hovers, subtle fills |
| secondary/accent-foreground | `#171717` | text on those |
| muted-foreground | `#737373` | secondary text, icons, timestamps |
| border / input | `#E5E5E5` | borders, dividers, input outline |
| ring | `#A1A1A1` | focus ring |
| destructive | `#DC2626` | delete/danger (Tailwind red-600) |

### Dark

| Token | Hex / value | Use |
|---|---|---|
| background | `#0A0A0A` | app background |
| foreground | `#FAFAFA` | primary text |
| card / popover | `#171717` | cards, sheets, menus |
| primary | `#E5E5E5` | primary buttons (light on dark) |
| primary-foreground | `#171717` | text on primary |
| secondary / muted / accent | `#262626` | chips, hovers |
| muted-foreground | `#A1A1A1` | secondary text |
| border | `rgba(255,255,255,0.10)` → `Color(0x1AFFFFFF)` | borders |
| input | `rgba(255,255,255,0.15)` → `Color(0x26FFFFFF)` | input outline |
| ring | `#737373` | focus ring |
| destructive | `#EF4444` | danger (lighter red on dark) |

### Accents (used per-component, not theme-wide)

| Meaning | Light | Dark |
|---|---|---|
| **Income** amount / accent | emerald-600 `#059669` | emerald-400 `#34D399` |
| Income indicator dot/badge | emerald-500 `#10B981` | emerald-500 `#10B981` |
| **Expense / negative** (in summaries & balances) | rose-600 `#E11D48` | rose-400 `#FB7185` |
| Chart series (pie, grayscale) | `#D4D4D4`, `#737373`, `#525252`, `#404040`, `#262626` | same |

> In the **chat bubble**, the expense amount is rendered in the normal
> `foreground` color (neutral) and only **income** gets the emerald color.
> Rose is used for negative/expense figures in the analytics **summary** and
> balance readouts. Money uses a real minus sign "−" (U+2212) for negatives.

```dart
// core/theme/app_colors.dart
import 'package:flutter/material.dart';

class AppColors {
  // Light
  static const bgLight = Color(0xFFFFFFFF);
  static const fgLight = Color(0xFF0A0A0A);
  static const cardLight = Color(0xFFFFFFFF);
  static const primaryLight = Color(0xFF171717);
  static const primaryFgLight = Color(0xFFFAFAFA);
  static const mutedLight = Color(0xFFF5F5F5);
  static const mutedFgLight = Color(0xFF737373);
  static const borderLight = Color(0xFFE5E5E5);
  static const ringLight = Color(0xFFA1A1A1);
  static const destructiveLight = Color(0xFFDC2626);

  // Dark
  static const bgDark = Color(0xFF0A0A0A);
  static const fgDark = Color(0xFFFAFAFA);
  static const cardDark = Color(0xFF171717);
  static const primaryDark = Color(0xFFE5E5E5);
  static const primaryFgDark = Color(0xFF171717);
  static const mutedDark = Color(0xFF262626);
  static const mutedFgDark = Color(0xFFA1A1A1);
  static const borderDark = Color(0x1AFFFFFF);
  static const inputDark = Color(0x26FFFFFF);
  static const ringDark = Color(0xFF737373);
  static const destructiveDark = Color(0xFFEF4444);

  // Accents
  static const incomeLight = Color(0xFF059669); // emerald-600
  static const incomeDark = Color(0xFF34D399);  // emerald-400
  static const income500 = Color(0xFF10B981);   // emerald-500
  static const expenseLight = Color(0xFFE11D48); // rose-600
  static const expenseDark = Color(0xFFFB7185);  // rose-400
}
```

---

## 2. Typography, radius, spacing, motion

- **Font: Geist** (sans) + **Geist Mono** for numbers. Add the Geist fonts to
  `pubspec.yaml` (download from vercel/geist) or use `google_fonts`. Amounts use
  **tabular figures** (mono or a tabular feature) so columns align.
- **Radius:** base `--radius = 0.625rem = 10px`. Derived: sm ≈ 6px, md ≈ 8px,
  lg = 10px, xl ≈ 14px, 2xl ≈ 18px. Cards/bubbles use ~16–18px (`rounded-2xl`);
  buttons/inputs ~8–10px; pills/avatars fully rounded.
- **Spacing:** 4px grid. Screen padding ~12–16px. Content max width ~ 640–768px
  (center on tablets).
- **Elevation:** very subtle. Cards = 1px border (`border`) + `shadow-sm`
  (a faint shadow). Avoid heavy Material elevation.
- **Motion:** list items / bubbles fade + rise ~6px over ~0.28s ease-out
  (`animate-rise`). Respect reduced-motion.

```dart
// Text sizes seen in the app
// bubble heading / body: 14 (sm), medium weight
// amount: 16 (base), semibold, tabular
// meta (category, time): 12 (xs), muted-foreground
// nav label: 11
```

Build `ThemeData` for light and dark from these tokens (Material 3
`ColorScheme`: `surface`=card, `onSurface`=foreground, `primary`=primary,
`outline`=border, `error`=destructive). Default the app to **system** theme;
let Settings override to light/dark/system.

---

## 3. Navigation shell

- **Mobile (phones):** a **bottom navigation bar**, fixed, height ~64px, top
  border, 4 tabs. Active tab uses `foreground`, inactive `muted-foreground`;
  active icon scales slightly (~1.05).
- **Tablet/large:** a left **navigation rail / sidebar** instead of the bottom
  bar (optional; the bottom bar is fine for v1).
- **Tabs (in order):**
  1. **Tracker** — `/app` — icon: message-square
  2. **Transactions** — `/transactions` — icon: table
  3. **Analytics** — `/analytics` — icon: bar-chart
  4. **Settings** — `/settings` — icon: settings
- An **app bar** on top shows the current **profile** (icon + name + subtitle)
  which, on mobile, is a **tap-to-switch dropdown** (see Profiles).

---

## 4. Screens

### 4.1 Auth (sign-in / sign-up / verify-email)

Centered, minimal card on `background`. Logo/wordmark "SpendChat", tagline
"Track your money like a conversation." Fields: email, password. Primary button
(dark, full-width). "Continue with Google" secondary button. Links to
sign-up / forgot-password. After sign-up, a **verify-email** screen explains the
account needs email verification before sign-in.

### 4.2 Tracker (the hero screen) — `/app`

A **chat thread of transactions** with a composer pinned to the bottom.

- **Header:** profile switcher (icon avatar in a muted circle + name + subtitle
  like "Transactions this month" or "N profiles"; chevron to switch on mobile).
- **Feed:** oldest→newest, scrolls to bottom on load (like a chat). Group by day
  with a centered **day divider** ("Today", "Yesterday", or a date). Each
  transaction is a **bubble**:
  - **Income → left-aligned** (incoming), **expense → right-aligned** (outgoing).
  - A round avatar (size ~36, `muted` bg) showing the category emoji (or 💸).
  - A card bubble (`card` bg, 1px border, `rounded-2xl`, subtle shadow; the top
    corner nearest the avatar is squared: income = top-left, expense = top-right).
  - **Top row:** heading (title, else category, else "Transaction"; 14, medium)
    on the left; **amount** on the right (16, semibold, tabular). Income amount
    in **emerald**; expense amount in `foreground`. Prefix expenses with "−".
  - **Description** (if any): 14, `muted-foreground`, below the heading.
  - **Bottom row** (12, `muted-foreground`): category emoji + name (or 🏷️
    "Uncategorized") on one side; time (+ actions) on the other.
  - Max bubble width ~ 448px. Tap a bubble → **detail dialog** (view + edit/delete).
  - Entrance: fade + rise animation.
- **Composer** (pinned bottom, above the bottom nav; `background`, top border):
  1. A **type toggle** — a segmented pill (`Expense` | `Income`) in a
     `muted/50` rounded-full track; the active segment gets a `background` fill +
     shadow. (Web binds ⌘/Ctrl+E; on mobile just the toggle.)
  2. A **date picker** (defaults to today, max = today) and, when viewing "All
     profiles", a **profile picker**.
  3. A **category row**: horizontally scrollable emoji chips for the current
     type; a trailing "edit" affordance opens the category editor. Typing `/` in
     the title also opens an inline category picker (nice-to-have on mobile).
  4. **Amount** field (with the currency symbol prefix, tabular) and **Title**
     field ("Add a title…"), ordered by the user's **input mode**:
     `amount_title` (default), `title_amount`, or `combined` (one field parsed as
     "100 fruits" with a live "Adds $100 · fruits" preview).
  5. An optional **Description** field.
  6. **Send**: a full-width primary button on mobile ("Send", with an up-arrow);
     inline icon button on wide layouts.
  - Validation mirrors the server: amount > 0, a title, a date, a profile. Show
    errors as toasts/snackbars. Optimistically append the bubble, then reconcile.

### 4.3 Transactions — `/transactions`

A **list** (cards on mobile, table on wide) of transactions, newest first,
**paginated** (`limit`/`offset`, use `meta.total`). Columns/fields: date, title,
description (expandable), category, amount (income emerald / expense with "−"),
actions (edit, delete). A **filter bar**: type, category, profile, date range,
search (`q`). Row/card tap → detail dialog. A profile filter + an "All profiles"
option. Provide **CSV export** (call `/transactions/export`, share/save the file).

### 4.4 Analytics — `/analytics`

Driven by the same filters (type, category, profile, **date range**). Sections:

- **Summary** cards: Income (emerald), Expense (rose), Balance (emerald if ≥0
  else rose). Values are minor units → format with the currency decimals.
- **Category pie chart** (`fl_chart` PieChart) of spend (or income) by category,
  using the **grayscale** chart palette; legend with category emoji + name +
  amount + %.
- **Monthly trend**: income vs expense per month (`/analytics/monthly?from=`),
  as grouped bars or two lines.
- Empty states when there's no data in range.

### 4.5 Profiles (WhatsApp-style)

Profiles are chat "threads". A profile has icon (emoji) + name + color + order.

- **Switcher:** app-bar dropdown on mobile listing all profiles with a check on
  the active one, plus an "All profiles" (grid icon) option. Selecting one scopes
  the tracker/transactions/analytics to that profile (like opening a chat).
- **Manage profiles** (a screen or sheet, reachable from Settings or a long-press):
  - Create (name + emoji picker + optional color).
  - Rename / change icon.
  - **Reorder** (drag handles → `/profiles/reorder`).
  - **Delete**: blocked (409) if it's the last profile or still has transactions;
    offer **"Move transactions to <profile>"** (`/profiles/{id}/move`) first, then
    delete. Show the server's 409 message.
  - Every user always has at least one profile ("Personal").

### 4.6 Settings — `/settings`

- **Currency** (from the supported list: USD, EUR, GBP, INR, JPY, CAD, AUD, SGD,
  AED, CHF, CNY, BRL, ZAR, NGN), **Locale**, **Theme** (Light / Dark / System —
  show a check ✓ on the active one), **Input layout** (amount-then-title /
  title-then-amount / combined). A **Save** button that's enabled only when the
  form is dirty, and a **Cancel** that reverts. Use `PATCH /settings` (partial).
- **Categories manager:** list income + expense categories; add/edit (name +
  **emoji picker** + optional color) / delete. Deleting a category leaves its
  transactions but clears their category.
- **Danger zone:** "Delete all transactions" — a destructive action requiring the
  user to type/confirm `DELETE` (`POST /transactions/delete-all`).
- Optional: a read-only shortcuts list (web-only; skip on mobile) and account
  (email + sign-out).

### 4.7 Shared components

- **Detail dialog / bottom sheet** — amount, title, description, category, type,
  date, profile; Edit and Delete actions.
- **Emoji picker** — used for category/profile icons (a grid + free text).
- **Empty / loading / error states** — skeletons for the feed, list, and charts;
  friendly empty copy; retry on error.
- **Toasts/snackbars** — success ("Expense added" / "Income added") and error
  (use `error.message` from the API).

---

## 5. Money formatting

`amountMinor` is the source of truth. Format like the server (`src/lib/money.ts`):

```dart
// major = amountMinor / 10^decimals ; decimals from meta.currency / settings.currencyDetail
String formatMoney(int minor, {required String symbol, required int decimals, bool signed = false}) {
  final major = minor / pow(10, decimals);
  final s = '$symbol${major.abs().toStringAsFixed(decimals)}';
  if (signed) return '${minor < 0 ? '−' : '+'}$s';
  return minor < 0 ? '−$s' : s;
}
```

Expenses display as negative where a sign is shown (feed amount, summaries). The
API returns positive `amountMinor` + a `type`; apply the sign in the UI
(`type == 'expense'` → negative) exactly as the web app does.
