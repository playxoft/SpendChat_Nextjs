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
    erase at compile time. It is *runtime* imports of `@/actions/*`,
    `@/services/*`, `@/lib/queries` and `@/lib/db` that can't be bundled, and
    the entry set is curated to avoid them. That distinction is what makes the
    safe component set as wide as it is; don't re-derive it from a naive grep.
- **Three browser-side modules are stubbed too, for size rather than safety.**
  Excluding a component was never an option for these — they sit under
  components the design system is *for*:
  - `@/lib/firebase` and `firebase/auth` — `UserMenu`, reached from both
    `AppSidebar` and `AppTopbar`, signs out through them. They bundle fine; they
    just bring ~600 KB of Firebase Web SDK that can never sign anyone in,
    because the bundle has no `NEXT_PUBLIC_FIREBASE_CONFIG` and `firebaseConfig()`
    throws on the first call. Stubbing swaps that failure for one that says so.
  - `pdfjs-dist` — `PendingMessagesProvider` → `upload-client` → `thumbnail` →
    `./pdf-thumbnail`. In the app that last hop is a dynamic import, so pdf.js
    (~850 KB) loads only when someone uploads a PDF; a single-IIFE bundle has no
    second chunk to defer it to, and its worker is resolved with
    `new URL(…, import.meta.url)`, which an IIFE has no meaning for.

  The stubs are hand-written and checked in under `.design-sync/stubs/`, wired
  in by the same `paths` map as the action stubs. Together they take the bundle
  from 4.2 MB to 2.9 MB. **Both tsconfigs have to carry the same `paths`** —
  `tsconfig.sync.json` for the bundler, `tsconfig.emit.json` for the declaration
  tree — or the shipped `.d.ts` documents code that isn't in the bundle.
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
  Its provider props mirror `src/app/layout.tsx` (`defaultTheme="system"`,
  `enableSystem`, `delayDuration={300}`) and should keep mirroring it: pinning
  the theme to light with `enableSystem={false}` puts the stylesheet's whole
  `.dark` layer out of reach of every card, and since next-themes owns
  `documentElement.classList` under `attribute="class"`, a `.dark` class applied
  from outside is stripped on the next render.
- **`conventions.md` is `cfg.readmeHeader`** — the first thing the design agent
  reads. It has to name `DesignPreviewProvider`, because a screen built from the
  documented wrap alone crashes the moment it uses a nav component.
- **`eslint.config.mjs` ignores the generated trees.** `ds-bundle/`, `.ds-sync/`,
  `dist/` and `.design-sync/.cache/` are gitignored build output, but ESLint has
  its own ignore list and doesn't read `.gitignore` — without those entries
  `pnpm lint` fails with hundreds of errors from the bundle and the generated
  action stubs. (`tsc` is unaffected: TypeScript's `include` globs skip
  dot-directories, so nothing under `.design-sync/` reaches `pnpm typecheck` —
  which is why the authored files here have their own program, run by
  `pnpm typecheck:design` off `tsconfig.check.json`.)
- **The target project id is not in `config.json`.** `cfg.projectId` names a
  specific claude.ai/design project — one maintainer's — and this repo is source
  anyone can clone, so it lives in **`.design-sync/config.local.json`**
  (gitignored) instead. Read it from there when driving a sync; if that file is
  missing, `DesignSync.list_projects` will find the project by name. Nothing in
  `.ds-sync/` reads the key (it's on the accepted-key list and otherwise unused),
  so a config without it validates and builds exactly the same.
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
so every shadcn primitive (28 files, 29 cards — `Avatar` and `AvatarGroup` share
`avatar.tsx`) and both brand marks would land in `general`. `regen.mjs` writes
frontmatter-only `<Name>.md` files into `.design-sync/docs/` (bound by
`cfg.docsDir`) to set `primitives` and `brand`. Which cards those are is
**derived from the source path** in `componentSrcMap` — `^src/components/ui/`
and `^src/components/<name>.tsx` — not from a list of names, because the path is
what the converter actually reacts to. A doc category only wins where the
directory-derived group came out generic — listing `app/`, `attachments/`,
`files/`, `icons/` or `marketing/` components there writes files that look
authoritative but are silently ignored. Keep the stubs body-less: a doc with
prose *replaces* the synthesized `.prompt.md` (props table + preview examples).

## Re-sync risks — what can silently go stale

- **Adding a component to `src/components` does nothing by itself.** Add it to
  `cfg.componentSrcMap`; `regen.mjs` derives the barrel, the declaration entry
  and the card group from that one map. There is no auto-discovery —
  `ds-entry.ts` is curated on purpose — and there is no second list to forget.
  (The one hand-kept list is `EXTRAS` in `regen.mjs`: files that ship in the
  bundle without claiming a card.)
- **A new runtime import of a server module inside an already-synced component
  breaks the whole bundle**, not just that component (one IIFE). If a build
  suddenly reports unresolved `pg`/`fs`/`server-only`, trace the import graph
  from `ds-entry.ts` rather than the file the error names.
- **Fixture data is inlined in the previews** (categories, profiles, workspaces,
  attachments). `pnpm typecheck` can't see any of it: TypeScript's `include`
  globs skip dot-directories, and the converter's bundler only transpiles — so
  a prop-shape change used to leave every preview compiling and the card just
  rendering wrong. **`pnpm typecheck:design` is the guard**: it regenerates
  `ds-entry.ts`, resolves `spendchat` to it, and checks all 63 previews, the
  provider and the stubs against the real component props. Run it after any
  prop-shape change — it is what turns a silent wrong render into an error.
- **`next/dist/...` router-context imports** in `preview-providers.tsx` are the
  most likely thing to break on a Next major upgrade.
- **Geist is pinned to the woff2s in `.design-sync/fonts/`.** If the app switches
  typeface in `layout.tsx`, these go stale silently — the cards keep rendering,
  just in the wrong font. Re-fetch from Google Fonts and update
  `tailwind-entry.css`'s `--font-sans` / `--font-mono`. They are redistributed
  under the SIL OFL 1.1 (`.design-sync/fonts/OFL.txt`, attributed in `NOTICE`) —
  if you swap or add a family, update both.
- **The Tailwind CLI is pinned, and `regen.mjs` asserts it.** It used to run as
  `npx --yes @tailwindcss/cli@4`: a network fetch on a cold cache, and a
  floating pin that had already drifted (CLI 4.3.3 compiling what the app built
  with 4.3.1), which quietly makes the cards' stylesheet not the app's. It is
  now a pinned devDependency invoked from `node_modules/.bin`, and regen fails
  if its version and `tailwindcss`'s disagree. When you bump one, bump both.
- **Only latin + latin-ext font subsets ship.** Fine for the English UI; if
  marketing copy ever carries other scripts, re-subset.
- **Playwright must match the cached chromium build.** This machine had chromium
  1217 and 1228 cached; playwright **1.61.1** pins 1228 and is what
  `.ds-sync/` installs. A different version re-downloads ~150MB.
