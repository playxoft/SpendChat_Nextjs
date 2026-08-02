# 03 · Navigation & App Shell

The shell = a **bottom navigation bar**, a top **app bar** with the profile
switcher, and the routing/redirect logic that gates the app behind auth.

---

## 1. Tabs (bottom navigation)

Four tabs, in this exact order. Icons are Lucide names (use `lucide_icons` or the
closest Material equivalent).

| # | Tab | Route | Icon | Web shortcut* |
|---|---|---|---|---|
| 1 | **Tracker** | `/app` | `message-square` | `q` |
| 2 | **Transactions** | `/transactions` | `table-2` | `t` |
| 3 | **Analytics** | `/analytics` | `chart-column` (bar chart) | `e` |
| 4 | **Settings** | `/settings` | `settings` | `s` |

\* Keyboard shortcuts are web-only — N/A on mobile.

- **Bottom bar:** fixed, height ~64px, a top border, `background` fill. Active
  tab uses `foreground`; inactive `muted-foreground`. The active icon scales
  slightly (~1.05) and the label (11px) sits under the icon.
- **Active detection:** exact match for **Tracker** (`/app`), **prefix** match
  for the others (e.g. `/settings/*` keeps Settings active).
- On tablets/large screens you *may* swap to a left navigation rail, but the
  bottom bar is fine for v1.

---

## 2. App bar (top)

- **Height ~56px (`h-14`)**, `background`, with the **Logo/wordmark** on the
  left (tapping it goes to `/app`).
- **Tracker screen** replaces/augments the bar with a **profile switcher** (icon
  avatar in a muted circle + name + subtitle + chevron) — see §3 and
  [04](./04-tracker-chat.md).
- **Right cluster** (from the web mobile topbar): a **profiles drawer** trigger
  (a `users` icon opening a left sheet with the workspace switcher + profile
  list), a **bulk-add** button (`list-plus`), a **theme toggle**, and a
  **user/avatar menu**.
- Keep it minimal on the other tabs — a title + relevant actions (e.g.
  Transactions has Add / Bulk / Export; see [05](./05-transactions.md)).

---

## 3. Profile switcher

Profiles are chat "threads" (Personal, Work, Home…) that **scope** the
tracker/transactions/analytics data. A profile has: `name`, `icon` (emoji),
`color` (unused), `sortOrder`.

- **On the tracker header (mobile):** a dropdown showing the active profile's
  emoji + name + a subtitle (`"Transactions this month"` for a single profile,
  or `"{n} profiles"` when "All profiles" is active) + a chevron. Tapping opens a
  menu listing all profiles (a check ✓ on the active one) plus an **"All
  profiles"** entry (grid icon `🗂️`/`layout-grid`).
- **Default profile emoji:** `👤`. **All-profiles emoji:** `🗂️`.
- Selecting a profile sets the current scope. The web encodes this as
  `?profile=<id>` / `?profile=all` in the URL; on mobile, hold it in app state
  (e.g. a Riverpod `currentProfileProvider`) and pass it as the `profile` query
  param to the API.
- **Mobile swipe gesture:** horizontally swiping across the tracker moves to the
  next/previous profile, **wrapping through "All profiles"** (sequence =
  `[...profileIds, "all"]`; swipe left → next, right → previous). Thresholds:
  min horizontal 60px, max vertical 45px, max duration 600ms, single touch;
  ignore swipes that start on an input/button/dialog/menu. See
  [07](./07-profiles-and-categories.md).

### Default profile scope (decide this)
- The **web** defaults to the **first profile** when no profile is selected.
- The **API** defaults to **all profiles** when `profile` is absent.
- **Recommendation for mobile:** default to **all profiles** for a friendlier
  first impression (or persist the user's last choice). Whatever you choose, be
  consistent across the three data screens.

---

## 4. Workspace switcher

Profiles live inside a **workspace**. The current workspace comes from
`GET /me` → `data.workspace` (`{ id, name, icon, role, currency, locale,
currencyDetail }`).

- Put a **workspace switcher** at the top of the profiles drawer (emoji `icon`
  — fall back to a neutral glyph when null — + current name + chevron). It
  lists the workspaces the user can reach (`GET /workspaces`); switching
  changes which profiles/data you see. Tint/mark the current workspace in the
  list and show each row's role label.
- Send the chosen workspace as **`X-Workspace-Id`** on every API call, and
  persist the id locally (`shared_preferences`) so it survives restarts. The
  server also remembers it (`lastWorkspaceId`) when you switch.
- **v1 scope:** the picker switches workspaces; **creating** one lives in
  Settings (`POST /workspaces`, spec ≥1.3.0 — the app switches to it on
  success). Full workspace admin (rename, invite members, roles, per-profile
  sharing) stays an admin-only web flow — defer it. See
  [08](./08-settings.md) § Workspaces.
- Respect the effective **role**: `viewer` = read-only (hide add/edit/delete),
  `editor` = can write transactions, `admin` = can manage profiles. `role: null`
  means access via a per-profile grant (treat like a viewer at workspace level,
  but individual profiles may grant more).

---

## 5. User / avatar menu

An avatar (first letter of the email, uppercased) opens a menu with:
- a label showing the email (or "Signed in"),
- **Settings** → `/settings`,
- **Sign out** → Firebase `signOut()` (+ clear any local session) → `/sign-in`.

---

## 6. Routing & auth redirects (`go_router`)

Route groups mirror the web app:

- **`/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email`** — the auth
  stack (unauthenticated). See [09](./09-auth.md).
- **`/app`, `/transactions`, `/analytics`, `/settings/*`** — the authenticated
  app shell (bottom nav).

**Redirect logic:**
1. Not signed in (no Firebase user) → any app route redirects to `/sign-in`.
2. Signed in but **email not verified** (email/password accounts) → redirect to
   `/verify-email`. The API returns **403** for unverified tokens, so gate the
   whole app on `user.emailVerified`.
3. Signed in + verified but on an auth route → redirect to `/app`.

Drive the redirect from a Firebase auth-state provider (`idTokenChanges()` /
`authStateChanges()`), so sign-out anywhere bounces back to `/sign-in`
automatically. Use go_router's `refreshListenable` bound to that stream.

**Deep links:** `/transactions`, `/analytics`, `/settings/<section>` should be
directly addressable. Preserve the current profile/workspace in app state, not
the URL (unlike the web).

---

## 7. Settings sub-navigation

`/settings` is itself a small section with its own nav (a list on mobile). The
sections, in order, are: **Account**, **Workspace**, **Theme**, **Input**,
**Categories**, **Shortcuts**. `/settings` should land on **Account**. Full
detail in [08](./08-settings.md). (Skip **Shortcuts** on mobile, or show it
read-only as "keyboard shortcuts (web)".)
