# SpendChat — Flutter App Documentation

This folder is the **complete build spec** for the SpendChat mobile app (Flutter,
Android + iOS). It is written for a fresh Claude Code session running inside the
*Flutter* repo: read these docs, then build the app screen by screen. The app is
a **thin client** over the existing Next.js backend — all data, money math, and
business rules live on the server; the app renders, captures input, and calls
`/api/v1`.

Everything here was extracted from the live web app's source so the mobile app
is a **faithful replica**. Where the older `_developer/app-dev/*` and
`_developer/api/openapi.yaml` docs disagree with these, **these win** (see
[§ Corrections](#corrections-to-older-docs) below).

---

## How to use these docs

1. Start with **[00-getting-started.md](./00-getting-started.md)** — stack,
   dependencies, project layout, environment, and how to reach the backend.
2. Wire the **[01-api-reference.md](./01-api-reference.md)** + **[openapi.yaml](./openapi.yaml)**
   data layer (envelope, auth, models, repositories).
3. Implement the **[02-design-system.md](./02-design-system.md)** tokens and theme
   *first* — everything else depends on them.
4. Build screens in the order of **[10-checklist.md](./10-checklist.md)**, using
   the per-feature docs (04–09) as the pixel/behaviour spec.

## Document map

| Doc | What it covers |
|---|---|
| [00-getting-started.md](./00-getting-started.md) | Stack, packages, project structure, env/config, Firebase native setup, reaching the dev server |
| [01-api-reference.md](./01-api-reference.md) | Full REST contract: envelope, auth, `X-Workspace-Id`, every endpoint, all models, filters, pagination, money |
| [openapi.yaml](./openapi.yaml) | Machine-readable OpenAPI 3.1 spec (corrected) — generate Dart models from this |
| [02-design-system.md](./02-design-system.md) | Colours (light/dark tokens), typography, radius, spacing, motion, component styling, income/expense accents |
| [03-navigation-shell.md](./03-navigation-shell.md) | Bottom nav, app bar, profile switcher, workspace switcher, routing, auth redirects, user menu |
| [04-tracker-chat.md](./04-tracker-chat.md) | The hero screen: chat feed, bubbles, day dividers, composer, 3 input modes, **AI entry (parse → review → save) + hold-to-talk voice**, optimistic send, bulk add, detail dialog |
| [05-transactions.md](./05-transactions.md) | Transactions list/table, filters, pagination, CSV export, edit/detail dialog, **attachments (receipts/bills)** |
| [06-analytics.md](./06-analytics.md) | Summary cards, category pie, monthly trend, filters + range presets |
| [07-profiles-and-categories.md](./07-profiles-and-categories.md) | Profiles (switch/create/reorder/move/delete) and the categories manager |
| [08-settings.md](./08-settings.md) | Settings sections (workspace currency/locale, theme, input mode, **voice languages**), danger zone, workspaces/RBAC scope |
| [09-auth.md](./09-auth.md) | Firebase native auth flow, sign-in/up/verify/reset screens, error messages, session |
| [10-checklist.md](./10-checklist.md) | Phased, page-by-page development checklist |
| [11-additional-details.md](./11-additional-details.md) | Money/dates/timezone, loading/empty/error states, offline, accessibility, testing, gotchas |

## What we're building (one paragraph)

A minimal, fast, private money tracker where you add income/expenses like
sending chat messages. Feature parity with the web app: a **Tracker** (chat feed
+ composer with **AI entry** — type or **speak** a note, review the parsed
drafts, save), a **Transactions** list with **attachments**
(receipts/bills/invoices), **Analytics** (summary + pie + trend), **Profiles**
(WhatsApp-style threads that scope the data), **Categories**, **Settings**, and
Firebase **Auth**. Single currency per **workspace**; money is integer **minor
units** end to end. Minimal, neutral, grayscale UI — the accents are **emerald
for income** and one deliberate exception: a **blue→violet gradient** on AI
affordances only (see [02](./02-design-system.md)).

## Corrections to older docs

The `_developer/app-dev/*` docs and `_developer/api/openapi.yaml` predate these
and contain a few inaccuracies. The findings here are taken directly from source:

- **Numbers use Geist Sans with `tabular-nums`, not Geist Mono.** Mono is used
  only for a couple of raw/technical hints.
- **Expense amounts are neutral (`foreground`), not red/rose.** Only **income**
  is emerald. Rose appears only in a few affordances: the composer type-toggle
  *icon*, a negative *month balance* on the tracker header, and the "Not sent"
  error label — never on an expense amount in the list/table/bubble.
- **The category pie chart uses a multi-colour palette**, not the grayscale
  `chart-*` tokens. Exact palette is in [06-analytics.md](./06-analytics.md).
- **The transactions screen is one responsive table**, not a separate mobile
  card layout. (The chat bubble is a *tracker* component.)
- **Categories have no `color` field** anywhere (DB, API, UI). Profiles have a
  `color` column but no UI to set it.
- **The API supports 59 currencies**, not the 14 in the old enum. Full list in
  [08-settings.md](./08-settings.md).
- **`GET /me` returns a `workspace` object** (`{ id, name, role }`) the old
  OpenAPI omitted, and **403 `forbidden`** is a real error code it omitted.
- **Radius:** base is 10px; cards use `rounded-xl` (14px), chat bubbles/pills use
  `rounded-2xl` (18px).

## A note on Flutter code in these docs

Per the brief, these docs are **specs, not an implementation**. They include a
few short Dart snippets only where a snippet is the clearest way to pin an exact
value or algorithm (the colour tokens, the money formatter, the envelope
unwrap). Everything else is described so the Flutter Claude can implement it
idiomatically.
