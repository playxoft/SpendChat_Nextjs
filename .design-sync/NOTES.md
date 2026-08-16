# /design-sync notes — SpendChat

Repo-specific gotchas for syncing this codebase to claude.ai/design. Read this
before a re-sync; the **Re-sync risks** section at the end is the watch-list.

## What makes this repo unusual

SpendChat is a **Next.js application**, not a published component package. The
converter's `package` shape expects a built `dist/` plus a shipped `.d.ts` tree;
neither exists here. `.design-sync/regen.mjs` (wired as `cfg.buildCmd`) stands in
for that build and produces all four inputs the converter needs:

1. **`.design-sync/ds-entry.ts`** — a curated barrel over `src/components`.
2. **`.design-sync/.cache/tailwind.css`** — the compiled stylesheet.
3. **`.design-sync/.cache/stubs/actions/*.ts`** — no-op server actions.
4. **`dist/types/`** — an emitted declaration tree, plus its `index.d.ts` entry.

Run `node .design-sync/regen.mjs` before `package-build.mjs`, always. The driver
(`resync.mjs`) does not know about it.

## Decisions that are load-bearing

- **`package.json` has a `types` field** pointing at the gitignored
  `dist/types/index.d.ts`. It exists purely so the converter can find the
  declaration tree: `findTypesRoot()` and `projectFor()` both read
  `pkgJson.types`, and without it the emitted contracts collapse to
  `[key: string]: unknown` — which is what the design agent would then code
  against. The app is `private: true` and never consumed as a dependency, so the
  field affects no build, test or deploy. **Don't remove it.**
- **Only the card set is re-exported from `dist/types/index.d.ts`.** Sub-parts
  (`CardHeader`, `DialogTrigger`, …) stay importable from the bundle without each
  claiming its own preview card. That file is generated from
  `cfg.componentSrcMap`, so adding a card is a one-line config change.
- **Server actions are stubbed, not bundled.** Every `src/actions/*.ts` is
  `"use server"`. `AppSidebar`, `AppTopbar` and `TransactionComposer` reach them
  transitively; bundling the real modules drags `pg`, `drizzle` and node builtins
  into a browser bundle and the build dies with ~50 unresolved-import errors.
  `.design-sync/tsconfig.sync.json` maps `@/actions/*` to generated stubs that
  throw a descriptive error if called. This mirrors production — Next replaces a
  `"use server"` import with an RPC reference, so the browser never holds those
  bodies either.
  - **`import type` from `@/db/schema` and `@/lib/queries` is fine** — those
    erase at compile time. Only *runtime* imports of `@/actions/*`,
    `@/services/*`, `@/lib/queries`, `@/lib/db` and `@/lib/firebase` are a
    problem. That distinction is what makes the safe component set as wide as it
    is; don't re-derive it from a naive grep.
- **`.design-sync/browser-shim.ts` must stay the first import of `ds-entry.ts`.**
  Components using `next/link` / `next/navigation` pull in Next's client runtime,
  which reads `process.env.__NEXT_*` at module scope. esbuild only defines
  `NODE_ENV`, so without the shim all 63 cards die on
  `ReferenceError: process is not defined`.
- **`.design-sync/preview-providers.tsx` is `cfg.provider`.** It nests
  next-themes' `ThemeProvider`, `TooltipProvider`, `PendingMessagesProvider` and
  Next's app-router contexts. The router contexts are **deep imports from
  `next/dist/...`** — not public API. If previews start failing with
  "Cannot read properties of null", check those import paths first.
- **`eslint.config.mjs` ignores the generated trees.** `ds-bundle/`, `.ds-sync/`,
  `dist/` and `.design-sync/.cache/` are gitignored build output, but ESLint has
  its own ignore list and doesn't read `.gitignore` — without those entries
  `pnpm lint` fails with hundreds of errors from the bundle and the generated
  action stubs. (`tsc` is unaffected: TypeScript's `include` globs skip
  dot-directories, so nothing under `.design-sync/` reaches `pnpm typecheck`.)
- **Fonts ship with the bundle.** The app loads Geist / Geist Mono through
  `next/font` in `src/app/layout.tsx`, which self-hosts them at build time —
  nothing reaches a bundle built outside Next. `.design-sync/fonts/` carries the
  woff2s (latin + latin-ext, OFL) and `tailwind-entry.css` defines `--font-sans`
  / `--font-mono`, which `globals.css` declares but never assigns outside Next.
  **Without this every card renders in the browser's default serif** — it is not
  subtle, and it is easy to miss if you only read the render check's pass/fail.

## Known render warns (triaged — not new)

The final validate run is clean: **63/63 render, zero warns.** Getting there
needed these, which are worth knowing before you "fix" them again:

- **Mobile-only components** (`BottomNav`, `AppTopbar`) are `md:hidden`. The
  render check always captures at **1200px wide** regardless of the card's
  `viewport` attribute, so they collapse to 2px. Their previews wrap the
  component in a phone frame that re-shows it with a scoped `@media` rule (and,
  for `BottomNav`'s `fixed` bar, a `translateZ(0)` containing block). The
  component itself is untouched.
- **Desktop-only components need a wide enough card viewport.** `AppSidebar` is
  `hidden md:flex` (768px) and `SiteNav`'s links are `hidden lg:block` (1024px).
  Their `cfg.overrides[…].viewport` values clear those breakpoints. A viewport
  *below* the breakpoint renders a blank card — that is what `760x560` did to
  AppSidebar.
- **`CategoryPieChart` grades from a mid-animation screenshot.** recharts plays
  an entrance animation and `package-capture` screenshots on `networkidle` with
  no settle delay, so the sheet shows a sliver instead of a donut. A manual
  capture with a 2.5s delay renders the full donut — the uploaded card is
  correct. Don't "fix" the preview for this.
- **`ContextMenu` can only show its trigger surfaces.** Radix's context-menu root
  is uncontrolled by design: no `open`, no `defaultOpen`, only a real
  right-click. The card shows the vault rows the menu attaches to.
- **`EmojiPicker` previews the closed trigger only.** `EmojiPickerPanel` streams
  Emojibase from the app's own `/emojibase` path, which exists only inside the
  Next app. A story that mounts the open panel **hangs the capture** (it did —
  a full capture run timed out on it).
- **`Toaster` renders nothing until `toast()` fires.** Its card documents where
  to mount it rather than faking a notification.
- **`ShortcutList`'s last scope sits below the card fold** and scrolls into view.

## Grouping

Card groups come from the source directory, except where that directory is on
the converter's generic-name skip list. `ui/` and `components/` are both on it,
so all 28 shadcn primitives would land in `general`. `regen.mjs` writes
frontmatter-only `<Name>.md` files into `.design-sync/docs/` (bound by
`cfg.docsDir`) to set `primitives` and `brand`. A doc category only wins where
the directory-derived group came out generic — listing `app/`, `attachments/`,
`files/`, `icons/` or `marketing/` components there writes files that look
authoritative but are silently ignored. Keep the stubs body-less: a doc with
prose *replaces* the synthesized `.prompt.md` (props table + preview examples).

## Re-sync risks — what can silently go stale

- **Adding a component to `src/components` does nothing by itself.** It must be
  added to `FILES` in `regen.mjs` *and* to `cfg.componentSrcMap`. There is no
  auto-discovery: `ds-entry.ts` is curated on purpose.
- **A new runtime import of a server module inside an already-synced component
  breaks the whole bundle**, not just that component (one IIFE). If a build
  suddenly reports unresolved `pg`/`fs`/`server-only`, trace the import graph
  from `ds-entry.ts` rather than the file the error names.
- **Fixture data is inlined in the previews** (categories, profiles, workspaces,
  attachments). If those prop shapes change, the previews still compile —
  TypeScript never type-checks them, esbuild only transpiles — and the card just
  renders wrong. Re-read the sheets after any prop-shape change.
- **`next/dist/...` router-context imports** in `preview-providers.tsx` are the
  most likely thing to break on a Next major upgrade.
- **Geist is pinned to the woff2s in `.design-sync/fonts/`.** If the app switches
  typeface in `layout.tsx`, these go stale silently — the cards keep rendering,
  just in the wrong font. Re-fetch from Google Fonts and update
  `tailwind-entry.css`'s `--font-sans` / `--font-mono`. They are redistributed
  under the SIL OFL 1.1 (`.design-sync/fonts/OFL.txt`, attributed in `NOTICE`) —
  if you swap or add a family, update both.
- **The Tailwind CLI is invoked as `@tailwindcss/cli@4` via `npx`** — a network
  fetch on a cold cache, and a floating major-4 pin.
- **Only latin + latin-ext font subsets ship.** Fine for the English UI; if
  marketing copy ever carries other scripts, re-subset.
- **Playwright must match the cached chromium build.** This machine had chromium
  1217 and 1228 cached; playwright **1.61.1** pins 1228 and is what
  `.ds-sync/` installs. A different version re-downloads ~150MB.
