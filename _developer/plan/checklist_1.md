# MoneyTracker — Feature Overhaul Plan (checklist_1)

A staged plan to add profiles, richer transactions (title + description), a category
row selector with an emoji picker, keyboard shortcuts, a pie-chart analytics page,
print improvements, and a calendar fix.

Status legend: `- [ ]` todo · `- [~]` in progress · `- [x]` done

> **Process:** Do not start implementation until this plan is approved. Work phase by
> phase; keep `pnpm typecheck` and `pnpm lint` clean after every phase. Each schema
> change is `pnpm db:generate` → review SQL → `doppler run -- pnpm db:migrate`.

## Progress

All four phases are implemented on branch `feat/tracker-profiles-overhaul`, each its own
commit; `pnpm typecheck` and `pnpm lint` are clean and the app compiles.

- Phase 1 — Foundations: `ad162f9`
- Phase 2 — Tracker / composer: `03a252f`
- Phase 3 — Profiles / transactions / bulk add: `ea251d7`
- Phase 4 — Analytics / settings: `a804c25`

**Action required:** run `doppler run -- pnpm db:migrate` to apply migrations 0002–0004
to Neon, then `doppler run -- pnpm dev` to try it. A full `doppler run -- pnpm build`
needs Doppler secrets (the auth route reads `cookies.secret` at build time).

---

## Conventions to preserve (do not regress)

- Money stays integer **minor units** (`amount_minor`); convert only via `src/lib/money.ts`.
- **Single currency per user** (`user_settings.currency`). Profiles do **not** add per-profile
  or per-transaction currency.
- Every read is scoped to the authenticated user (`src/lib/queries.ts`); every mutation is a
  Zod-validated server action (`src/actions/*`). New profile scoping is **in addition to**,
  never instead of, user scoping: always `(userId, profileId)`.
- Minimal, neutral design; income keeps the single emerald accent.
- Keep all docs, code comments, and commit messages written as a normal engineering project.

---

## New dependencies (to be added in the phase that first needs them)

| Need | Library | Phase | Notes |
|------|---------|-------|-------|
| Pie chart (analytics) | `recharts` | 4 | shadcn `chart` components wrap recharts; client-only, Workers-safe. |
| Drag-to-sort profiles | `@dnd-kit/core` + `@dnd-kit/sortable` | 3 | Pointer + keyboard sensors; mobile-friendly. |
| Category emoji/icon picker | `frimousse` | 1 | Lightweight headless emoji picker (shadcn's `emoji-picker`); client-only. |

> Decision: prefer the libraries above. If we want zero new deps we can hand-roll the pie
> chart as SVG and the emoji picker as a static grid, but that is more code for less polish.
> Recommendation: add the three libraries.

---

## Data model changes (foundation — implemented in Phase 1)

`transactions` today: `id, userId, type, amountMinor, categoryId, note, occurredOn, …`.
Target transaction shape: **amount, title, subtitle (description), category, type, date, profile**.

- `transactions.note` → rename to **`title`** (the existing single-line text was effectively a title).
- Add **`description`** (`text`, nullable) for the subtitle.
- Add **`profileId`** (`uuid`, FK → `profiles.id`, **`on delete restrict`** — deletes are blocked while a profile has transactions).
- New **`profiles`** table: `id (uuidv7), userId, name, icon (emoji/text), color (nullable),
  sortOrder (integer), createdAt, updatedAt`. Index `(userId, sortOrder)`.
- Backfill: create a default **"Personal"** profile per user during bootstrap; set every existing
  transaction's `profileId` to that profile in the migration.
- `categories` already has `icon` + `color` — reused by the emoji picker (no schema change).

> Decision (approved): when a profile is deleted, **block delete if it still has transactions** and
> offer "move transactions to <profile>" in the UI first. So `profileId` is `on delete restrict`.

---

## Phase 1 — Foundations: data model, shared infrastructure, calendar fix

**Goal:** every later phase can build on the new schema, a keyboard-shortcut system, a reusable
date picker, and a reusable emoji picker. No user-visible feature changes beyond the calendar fix.

### Schema & data
- [x] Add `profiles` table to `src/db/schema.ts` (`id, userId, name, icon, color, sortOrder, timestamps`).
- [x] `transactions`: rename `note` → `title`; add `description`; add `profileId` FK + index `(userId, profileId)`.
- [x] `pnpm db:generate`; review generated SQL (rename must preserve data, not drop/add).
- [x] Migration step: seed a default "Personal" profile per existing user and set all `profileId`s.
- [x] `ensureBootstrap()` (`src/lib/auth.ts`): create the default "Personal" profile for new users.
- [ ] **ACTION REQUIRED (you):** `doppler run -- pnpm db:migrate` to apply migrations 0002–0004 to Neon.

### Validation, queries, actions
- [x] `src/lib/validation.ts`: add `profileInputSchema` (name 1–40, icon ≤8, color?); extend
      `transactionInputSchema` / `updateTransactionSchema` / `bulkTransactionsSchema` with
      `title`, `description?`, `profileId`.
- [x] `src/lib/queries.ts`: add `getProfiles(userId)`; add optional `profileId` to `TxnFilters`
      and thread it through `listTransactions(Asc)`, `countTransactions`, `getSummary`,
      `getCategoryBreakdown`, `getMonthlyTrend`. Return `title` + `description` in `TransactionRow`.
- [x] `src/actions/profiles.ts` (new): `addProfile`, `updateProfile`, `deleteProfile`,
      `reorderProfiles(ids[])` — all user-scoped, Zod-validated.
- [x] `src/actions/transactions.ts`: accept `title`, `description`, `profileId` in add/update/bulk.

### Keyboard-shortcut system (used by Phases 2–4)
- [x] `src/lib/shortcuts.ts`: central registry (id, keys, label, scope) + OS detection
      (`isMac`) so we can render `⌘`/`⌥`/`⇧` vs `Ctrl`/`Alt`/`Shift`.
- [x] `src/hooks/use-shortcut.ts`: hook to bind a key combo (ignores typing in inputs unless opted in).
- [x] `src/components/ui/kbd.tsx`: `<Kbd>` badge to render a shortcut hint on a button (OS-aware).

### Reusable pickers / bug fix
- [x] **Fix calendar bug:** replace the native `<input type="date">` in `transaction-dialog.tsx`
      (and filters) with a shared `DatePicker` (shadcn Popover + Calendar from `radix-ui`/`react-day-picker`)
      that correctly shows the selected date. Keep value as `YYYY-MM-DD` string for the actions.
- [x] `src/components/ui/emoji-picker.tsx`: wrap `frimousse` — emoji grid + icon options + a
      "custom" text input for pasting any emoji/character. (Wired into categories in Phase 4.)

**Acceptance:** typecheck/lint clean; existing add/edit/bulk/list flows work unchanged with the new
columns; selecting a date in the dialog now displays correctly; default profile exists for all users.

---

## Phase 2 — Tracker (chat) page & composer

**Goal:** the main tracker page gets the chat-direction layout, title+description input, the new
category row selector, profile selection, the detail dialog, and keyboard shortcuts.

- [x] **Bubble direction:** in `transaction-bubble.tsx` align **income (incoming) to the left** and
      **expense (outgoing) to the right** (chat metaphor); keep emerald accent for income. Verify mobile.
- [x] **Title + description input** in `transaction-composer.tsx`: relabel "Add a note…" → **"Add title…"**;
      `Shift+Enter` reveals/edits a **description** field; `Enter` submits.
- [x] **Category row selector** (new `category-row.tsx`): show "hot" categories inline as clickable
      chips in a row; an overflow **dropdown** lists the remaining categories in full (sized so the
      whole list is visible without scrolling — use columns/wrap, not a tall scroll area).
- [x] **`/` to edit categories:** typing `/` in the composer opens the category editor (no separate
      field/button); route to the category manager UI or an inline editor popover.
- [x] **Profile selector** in the composer (which profile the transaction belongs to); defaults to the
      currently active profile.
- [x] **Expense/Income shortcut** on the tracker page (e.g. `Cmd/Ctrl+E` toggles type); show the hint
      via `<Kbd>` on the toggle.
- [x] **Shortcut hints on buttons:** add `<Kbd>` to composer Send (Enter), bulk add, etc.
- [x] **Click a transaction → detail dialog** (`transaction-detail-dialog.tsx`): shows amount, title,
      description, category, type, date, profile; Edit/Delete from there.
- [x] **Inline description reveal:** `Shift+Enter` (or expand affordance) on a transaction row/bubble
      shows its description inline in the feed.

**Acceptance:** add an income → appears left; expense → appears right; title + (shift+enter) description
save and display; category row + overflow dropdown selects correctly; `/` opens category editing; the
type-toggle shortcut works and its hint is visible; clicking a transaction opens the detail dialog.

---

## Phase 3 — Profiles UI, Transactions page, Bulk-add table

**Goal:** profiles become a first-class navigation surface; the transactions page and bulk-add gain
profile + title/description and the print/grid improvements.

### Profiles (WhatsApp-style)
- [x] **Profile list in the left sidebar** (`app-sidebar.tsx` / new `profile-list.tsx`): each profile as
      a row with **icon + name**; click selects it and filters the tracker feed + summaries to that profile.
- [x] **Drag to sort** profiles with `@dnd-kit/sortable`; persist order via `reorderProfiles`. Keyboard
      sensor for accessibility.
- [x] **Mobile-friendly:** profiles reachable on mobile (e.g. a horizontally scrollable strip or a
      sheet/drawer), not desktop-only.
- [x] **Profile CRUD UI:** add / rename / set icon (uses the emoji picker) / delete (respecting the
      delete-policy decision above).
- [x] **Active-profile state** shared across pages (URL param or context) so tracker/transactions/analytics
      can filter by it.

### Theme switcher in nav
- [x] Move/extend the theme switcher in the left nav to **list options with a tick (✓) on the current
      theme** (Light / Dark / System), instead of the plain dropdown.

### Transactions page
- [x] **Profile selection** on the transactions page (filter by profile; choose profile when adding).
- [x] Add **Title** and **Description** columns (description shown inline / on expand); keep Date,
      Category, Amount, Actions.
- [x] **Click a row → detail dialog** (reuse Phase 2 `transaction-detail-dialog.tsx`).
- [x] **Expense/Income shortcut** on this page's add/edit form too.
- [x] **Printable grid:** print stylesheet draws **thin, semi-transparent black** lines between rows
      and columns (e.g. `rgba(0,0,0,0.15)`), hides actions/nav, fits the page.

### Bulk add as a table
- [x] Replace the freeform textarea in `bulk-add-dialog.tsx` with a **spreadsheet-style table**: columns
      for amount, title, description, category, type, date, **profile**; add/remove rows; inline
      validation per cell; keep the existing parser as an optional "paste CSV" path that fills the table.

**Acceptance:** profiles list, reorder, and select; feed/summary filter by active profile; theme list
shows a tick on the current theme; transactions page filters by profile and shows title/description;
printing the transactions page shows thin gridlines; bulk add is a row/column table that imports correctly.

---

## Phase 4 — Analytics & Settings polish

**Goal:** analytics gets a pie chart + filters + date range + print; settings gets the
save/cancel UX, the read-only shortcut list, and the category emoji picker.

### Analytics
- [x] **Pie chart** of spending by category (and/or income vs expense) using `recharts` via a shadcn
      `chart` wrapper; keep the existing bars or replace per design.
- [x] **Filters + date options + date range** (reuse `transaction-filters` patterns): type, category,
      profile, and a from/to **date range** that drives all charts.
- [x] **Print button** + **printable** analytics layout (charts + tables render cleanly on print).

### Settings
- [x] **"Save changes" button right-aligned**, enabled **only when the form is dirty** (track initial vs
      current values in `settings-form.tsx`).
- [x] **Cancel button** in settings that reverts unsaved changes to the last-saved values.
- [x] **Shortcuts section (read-only):** render the central shortcut registry from `src/lib/shortcuts.ts`
      as a non-editable list (action + OS-aware `<Kbd>`).
- [x] **Category emoji picker:** replace the plain icon text input in `category-manager.tsx` with the
      Phase 1 `emoji-picker` (emoji grid + icon options + custom paste); save into `categories.icon`.

### Final shortcut pass
- [x] Audit primary buttons across all pages and attach `<Kbd>` hints where a shortcut exists; ensure
      mac/windows rendering is correct everywhere.

**Acceptance:** analytics shows a pie chart that responds to filters + date range and prints cleanly;
settings Save is right-aligned and only active when dirty; Cancel reverts; the shortcut list renders;
the category emoji picker sets icons; shortcut hints are consistent and OS-correct.

---

## Cross-cutting / risks

- **OpenNext on Workers:** all new libs are client-side (recharts, dnd-kit, frimousse) — keep them in
  client components; no Node-only APIs. No middleware (route protection stays in the `(app)` layout).
- **Migration safety:** the `note → title` rename must be a real rename (preserve data), not drop+add.
  Test the migration on a copy before running against real data.
- **Active-profile model:** decide URL param vs context early (Phase 3) since tracker/transactions/
  analytics all read it.
- **Print CSS:** consolidate print rules (gridlines, hide nav/actions) so transactions and analytics
  share one approach.

## Confirmed decisions (approved)
1. **`note` migrates to `title`** (existing single-line text becomes the title; `description` starts empty).
2. **Profile delete policy: block if non-empty**, with a "move transactions to <profile>" action in the UI.
3. **Add the three libraries** — `recharts`, `@dnd-kit/*`, `frimousse`.
4. **Active profile tracked via URL param** (e.g. `?profile=<id>`); server components filter from it.
