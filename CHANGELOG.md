# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Every user-visible change bumps `package.json` and lands under a version
heading here** — patch for a fix, minor for a feature, major for a break. The
deployment reports that same number at **`GET /version`** (alias of
`GET /api/v1/version`), read straight from `package.json`, so the endpoint can
only ever report a version this file describes — `tests/unit/version.test.ts`
fails the build if the newest heading below and `package.json` disagree. The
full rule is in [AGENTS.md](./AGENTS.md) § Versioning.

The mobile REST API under `/api/v1` carries **its own** version, tracked
separately in [`_developer/flutter/_changelog.md`](./_developer/flutter/_changelog.md)
(currently spec **5.9.1**) and reported as `apiVersion` by the same endpoint.

## [Unreleased]

## [0.5.3] — 2026-08-19

### Changed

- **The single-field composer is one box with two zones**: a currency chip for
  the amount (₹, or whatever the workspace uses) and the title beside it. The
  chip is there as soon as you click into the field, so the amount goes straight
  into it instead of being parsed back out of a sentence. Space — or Enter —
  hands over from the chip to the title, so "100 fruits" is still typed in one
  burst; Backspace at the start of the title steps back into the chip. Pasting
  "100 fruits" still splits itself across the two — and a paste the split can't
  read ("coffee 250") keeps both halves instead of dropping the words.
- **The parse hint under that field is gone**, and the composer is a line
  shorter for it. "Amount ₹0 — add a title" described a guess the field was
  making; there's nothing to guess now. The over-limit warning stays.
- **The composer card is more compact in both modes** — 16px shorter, with the
  dead space under the fields gone. Its padding and row gaps came in a notch,
  the AI note box and its mic/send buttons are a little smaller, the AI hint
  line is `text-xs`, and the manual fields now hang from the card's bottom edge
  at every density (not just compact), so what the two modes differ by sits in
  the middle of the card instead of as a gap under the last field.
- **The AI note box grows with the note**, from the same starting height it has
  always had up to about twelve lines, then it scrolls. A note covering a day's
  spending used to disappear upward two lines at a time while you were still
  writing it. Wrapped text counts, not just typed newlines.
- **AI-parsed titles and descriptions come back capitalized** — "banana" is
  saved as "Banana" — so drafts from a note match hand-typed rows instead of
  echoing however the note was typed. Casing after the first letter is left
  alone, so "iPhone case" and "3M tape" survive.
- **The transactions table's User column shows the name only**, with the email
  on hover. Printing both stacked doubled every row's height and squeezed the
  columns people actually read.
- **Search leads the transactions filter row**, ahead of the date, type and
  category pickers.
- **The theme control in the sidebar is a three-icon capsule** (light / dark /
  system) instead of a menu — one click to the theme you want.
- **The theme capsule and the Manual/AI switch are one Tab stop each**, with
  the arrow keys moving between their options — how a segmented control is
  expected to behave, and what both already announced themselves as.
- **The Manual/AI switch keeps its muted track in compact mode.** It used to
  invert to the card background there, which read as a different control between
  the two densities.
- **File and folder hover cards on `/files` use the app's own panel colours** —
  dark in dark mode, white in light — rather than the inverted hint style, which
  put a white card in front of a dark app and washed out the tag chips on it.

### Fixed

- **A dropdown inside a dialog no longer takes the dialog down with it.**
  Clicking away from an open category, profile, date or emoji picker in the
  add/edit transaction dialog dismissed both, discarding what had been filled
  in; the click now closes only the dropdown.
- **The whole profile row in the sidebar switches profiles**, including the
  ⇧1…⇧0 shortcut chip — clicking the chip previously did nothing.

## [0.5.1] — 2026-08-16

### Added

- **The component library can be published to a Claude Design project.**
  `.design-sync/` holds the tooling that turns SpendChat's own components into a
  design system — a curated browser-safe barrel over `src/components`, the
  compiled stylesheet, no-op stubs for everything that talks to a server, an
  emitted type contract, and a preview card per component — so new screens can
  be designed against the real components instead of generic stand-ins. No
  application code changed: nothing here ships in the app or the Worker.
- **`pnpm typecheck:design`** checks the preview cards, their inline fixtures
  and the preview provider against the real component props. `pnpm typecheck`
  can't see any of it — its globs skip dot-directories — so a renamed or
  retyped prop would otherwise leave every preview compiling and the published
  card quietly rendering the wrong thing.

### Changed

- **`NOTICE` declares the redistributed Geist and Geist Mono subsets** under the
  SIL Open Font License 1.1. The app loads them through `next/font`, which
  self-hosts at build time and so reaches nothing built outside Next; the
  checked-in subsets are what keep the design bundle in the product's typeface.
  The full licence text is in `.design-sync/fonts/OFL.txt`.

## [0.5.0] — 2026-08-15

### Changed

- **Moving a deleted profile's transactions now moves its files too.** Choosing
  "move" when deleting a profile re-filed the transactions and their receipts
  but still destroyed the vault — folders, files, tags and share links — which
  the confirmation admitted only in a warning line: *"Moving transactions
  doesn't move the vault."* Deleting a profile was never a decision to discard
  its documents. The whole profile now moves: everything filed under it lands
  in the profile you pick, keeping its folder structure, its tags, and the
  links you'd already shared. Choosing "delete" still deletes it all.
- **A profile with files but no transactions gets the same choice.** It had
  none — the dialog only offered options when there were transactions to
  decide about, so a profile holding nothing but documents was deleted along
  with them without being asked. Anything worth moving now earns the question.
- **The confirmation counts everything it's about to act on.** It named
  transactions and left receipts and vault files to a footnote; it now says
  "12 transactions, 40 receipts and 5 vault files" up front, on both options.

## [0.4.1] — 2026-08-15

### Fixed

- **Videos play in the file preview again.** Only `.mp4`, `.webm` and some
  `.mov` files ever previewed; `.mkv`, `.avi`, `.m4v`, `.wmv`, `.flv` and others
  opened a download card instead. Browsers report no file type at all for those
  extensions, so they were stored as anonymous binaries and nothing downstream
  knew they were video. They're now recognized by extension and streamed to the
  player with seeking support — and if your browser genuinely can't decode a
  format, the preview says so instead of showing a dead player. The same fix
  covers audio (`.flac`, `.opus`, `.aac`…). **Files already in your vault are
  covered too**: the type is worked out when a file is read, so everything you
  uploaded before this release starts previewing without being re-uploaded.
- **A view-only share link can no longer be turned into a download.** Making
  every video and audio format previewable had a side effect on links shared
  with downloads switched off: clicking a format no browser can play (`.avi`,
  `.wmv`, `.flv`…) saved the file to the recipient's computer instead of
  previewing it. Those files are no longer served over a view-only link at all,
  and the page says so; playable media still previews.
- **A shared link shows why a file won't play.** The public share page rendered
  a broken player — no controls, no message — for a format the recipient's
  browser couldn't decode. It now explains it, the same way the in-app preview
  does, and offers the download when the link allows one.
- **A TypeScript file is a file again.** Dropping a `.ts` file into the vault
  filed it as a video, complete with a film-strip icon and a player that
  errored on open. `.m4v` files also open properly in a new tab now instead of
  downloading.

## [0.4.0] — 2026-08-15

### Added

- **Deleting a profile now asks what to do with its transactions.** Instead of
  refusing until the profile was emptied by hand, the confirmation says how many
  transactions are in it and offers two options: **delete them along with the
  profile** (the default — a profile you're removing is usually one you're done
  with) or **move them to another profile**, which re-files them with their
  attachments so nothing is lost. Profiles with nothing in them delete as before.
- **The confirmation says what else goes.** A profile's vault files have always
  been deleted with it, whichever option you pick — now the dialog counts them
  and says so before you commit, rather than after. It counts the receipts on
  the profile's transactions too, so a profile with an empty vault and forty
  receipts no longer says there's nothing else to lose.

### Fixed

- **Re-filing a transaction keeps its receipts.** Attachments stayed behind on
  the old profile — hidden from the transaction they belonged to and destroyed
  if that profile was later deleted — whether the transaction was moved in bulk
  or one at a time from the transaction dialog. They now follow it in both
  cases, and deleting a profile repairs anything an older build left behind
  rather than destroying it.
- **Deleting a profile frees its storage.** Its vault files and attachments
  disappeared from the app but their stored bytes stayed, so the workspace's
  1 GB quota kept counting space nothing could reach. Large profiles are now
  cleared in batches, so a vault of hundreds of documents finishes instead of
  timing out part-way.
- **A profile delete can no longer half-happen.** Emptying the profile and
  removing it are now one database transaction: if anything is written to the
  profile while the delete is running, the whole thing rolls back and asks you
  to retry, instead of destroying the transactions and leaving the profile —
  and the delete confirms against freshly-read numbers, so transactions added
  while the dialog sat open can't be swept up unseen.

### Security

- **The delete confirmation can't act on numbers it doesn't have.** If the
  check of what a profile contains fails, the dialog now says so and offers to
  retry. Previously it fell back to "this profile has no transactions" with the
  delete button live, so one click could destroy a profile's entire history —
  the refusal that exists to prevent exactly that never fired, because the app
  had explicitly asked for the deletion.

## [0.3.0] — 2026-08-15

### Added

- **The vault's "All profiles" view groups by profile.** At the root, every
  view — grid, list, and the column browser — now shows a colored divider bar
  per profile (its color, or a stable accent derived from it) with that
  profile's folders and files beneath, so a shared workspace reads as
  "Business… Personal…" instead of one mixed pile. Opening a folder, searching,
  or filtering by tag returns to the normal flat rendering.
- **Upload into a profile from the "All profiles" view.** There was nowhere to
  put a file there — with several profiles on screen the page couldn't tell
  which one you meant, so only folders accepted them. Each profile's divider bar
  now takes files itself: drop them on it, or use the upload button on the bar,
  and they land in that profile's root, in grid, list and column views alike.

### Changed

- **Files and folders stop repeating their profile's name at the root.** Where
  a divider bar already heads the group, the per-item profile badge on grid
  tiles and column rows — and the whole "Profile" column in list view — said the
  same thing once per row, so they're gone. Search results and tag-filtered
  results are a flat mix of every profile with no bar above them, and there each
  item still names its own.
- **The storage gauge is off the sidebar.** The ring and "0.1/1 GB" next to
  **Files** followed you around every page to report something that only matters
  while you're managing files. It stays on the Files page toolbar, where it's in
  context — and every other page now skips the query that fed it.

## [0.2.1] — 2026-08-15

### Security

- **Vault files are never rendered inline unless they're a previewable type.**
  The mobile API's download-URL endpoint asked storage to serve *any* file
  inline, so a document uploaded as HTML or SVG could execute its own script
  when opened in the app. Previews are now limited to images, PDFs, text and
  media — everything else downloads instead. The web app was never affected.

### Fixed

- **Deleting a file or folder now removes its thumbnail from storage.** Only
  the original was deleted, so every previewed file left its thumbnail behind
  permanently — invisible to the storage meter and impossible to clean up.
- **The 5 MB limit now applies to the thumbnails clients send with an upload.**
  They were accepted at any size, which made the limit bypassable on the mobile
  API.
- **Share-link lists no longer include expired links**, so the share sheet
  can't offer a link that leads to a dead page.
- **A read-only member browsing the vault no longer creates folders in someone
  else's profile.** Opening the Files page created the predefined "Transaction
  attachments" folder and recorded the viewer as its author; it's now created
  only for members who can write to that profile.
- **A thumbnail can no longer end up attached to the wrong file** in an upload
  that mixes field names or includes a non-file part.

### Changed

- The mobile API spec moves to **5.6.0** — see
  [the API changelog](./_developer/flutter/_changelog.md) for the per-endpoint
  detail and the (minimal) Flutter impact.

## [0.2.0] — 2026-08-14

### Added

- **Storage indicator on the Files page**: a ring plus an at-a-glance
  "0.1/1 GB" label in the toolbar shows how much of the workspace's storage is
  used; hover (or tap on a phone) for the exact numbers and a progress bar. It
  counts vault files and transaction attachments together and updates as soon
  as an upload or delete completes. The same mini gauge sits next to **Files**
  in the sidebar on every app page.
- **Folder sizes in the vault**: the list view's Size column now totals each
  folder (subfolders included), and the hover card on grid tiles shows it too.
  The column view gained the same hover card, opening to the side so it never
  covers neighboring rows.
- **1 GB storage quota per workspace**, now enforced: an upload that doesn't
  fit — on the web or the mobile API — is rejected with a clear message saying
  how much space is left. The mobile API reports usage in `GET /files`
  `meta.storage` (API spec 5.5.0).

### Changed

- **App pages moved under `/app`**: `/transactions`, `/analytics`, `/files` and
  `/settings/*` now live at `/app/transactions`, `/app/analytics`, `/app/files`
  and `/app/settings/*`, cleanly separating the authenticated app from the
  marketing site's URL space (the tracker was already `/app`). Old URLs
  permanently redirect (308), so existing bookmarks keep working. The mobile
  REST API (`/api/v1`) is unaffected.

### Fixed

- **Sorting the vault by size now orders folders too.** The Size column showed
  each folder's real total, but the sort quietly fell back to alphabetical for
  folders; they now rank by the same totals the column displays.
- **The storage indicator's details no longer vanish mid-hover.** Moving the
  mouse from the ring toward its popover used to close it before the pointer
  arrived; it now stays open while you're over either.
- **No more layout snap for the composer on phones.** A phone whose saved
  density is "normal" briefly rendered the desktop layout and collapsed to
  compact once the page finished loading; the first paint is now compact.
- The Files page computed the workspace's storage total twice per visit (once
  for the sidebar gauge, once for the toolbar ring); it now runs one query.

## [0.1.0] — 2026-08-14

First cut version. Entries are grouped by theme rather than strictly
chronologically; the work spans 2026-06-17 to 2026-08-14.

### Added

**Foundation**
- **Project setup**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui (neutral, minimal theme).
- **Cloudflare Workers** deployment via `@opennextjs/cloudflare` with `wrangler.toml`; the Worker bundle fits the free-tier 3 MB limit.
- **Neon Postgres + Drizzle ORM** with indexed, access-scoped schema and a migration history.
- **Light / dark / system** theme toggle (`next-themes`) across marketing and app.
- Money stored as **integer minor units** to avoid floating-point drift.
- Primary keys generated as **UUIDv7** (Postgres 18 `uuidv7()`).

**Tracker**
- **Chat-style tracker** (`/app`): transactions as message bubbles with day/month dividers, running balance, and a chat composer.
- **Optimistic entry** — pending-message composer, optimistic month balance, and optimistic rows on the feed.
- **Bulk add**: paste many transactions with a live parsed preview, per-row default date, type toggle, and `⌘E` flip.
- Slash-command category tagging from the title field; emoji category picker; inline category rename.
- Configurable transaction input layout, compact composer density, and compact mobile controls.
- Timezone-aware dates and a month picker.

**Workspaces, profiles & access control**
- **Shared workspaces with RBAC** — membership plus per-profile grants, viewer/editor/admin roles, effective role = max of the two.
- Member invites by email (ZeptoMail), converted at the invitee's first bootstrap.
- Per-workspace currency, number format, and shared categories; workspace emoji icons and longer names.
- Member and per-profile access management UI; permissions centralized in a `Permissions` context.
- Profile sidebar, switch shortcuts, per-section profile persistence, and composer locking during a switch.
- Row-level authorship display in shared workspaces.

**Transactions & reporting**
- **Transactions table**: resizable, sortable, drag-to-reorder columns with infinite scroll.
- Date-range filter with calendar range mode; income/expense type filter on transactions and analytics.
- **Analytics**: monthly income/expense/net summary, category pie/bars, 6-month trend, and an all-time range.
- **Branded CSV export** and printable report headers.

**Files vault**
- `/files` Drive-like vault with grid, list, and **column** views.
- Tag entities with colors, folder color tints, drag-and-drop move, OS drop-to-folder with progress, context menus, thumbnails.
- A system "Transaction attachments" folder, plus share links and share pages.

**Attachments**
- `transaction_attachments` schema and validation; upload/download service backed by **R2** with presigned access.
- Attachment UI integrated into the transaction view, with thumbnails.

**AI & voice**
- **AI transaction entry** — natural-language text parsed into reviewable drafts, never written directly.
- **Hold-to-talk voice entry** (`m`): recorded in the browser, transcribed server-side, dropped into the AI note for human review. Audio is discarded, never stored.
- Editable descriptions and add-row on the AI review grid; persisted entry mode; always-on amount preview.
- Models are **configured, never hard-coded** — each feature owns an env-var registry pair.

**Mobile REST API**
- Versioned **`/api/v1`** REST API for the Flutter client, with Firebase bearer auth and a shared `src/services/*` layer.
- Covers transactions, workspaces, currency/categories, AI entry, voice, attachments, and the files vault.

**Auth & account**
- Google sign-in, email/password, email verification, and password reset by email code.
- Sessions kept alive for a month via refresh token; show/hide password toggles.
- Editable account profile, avatar uploads, and a security card.

**Marketing, SEO & content**
- Marketing site (landing, features, about, FAQ, pricing, privacy, terms), custom 404, and app icon.
- **MDX-powered blog and docs** with SEO.
- `createMetadata` helper enforcing canonical URLs, a static OG image, `sitemap.xml`, `robots.txt`, web manifest, and JSON-LD.
- Consent-gated GA4 + Clarity analytics.

**Platform & observability**
- **Structured logging** to BetterStack, with every line stamped by per-request identity (requestId, platform, user, workspace, profile) via `AsyncLocalStorage`.
- Request context carried through the session and export routes; logs tagged with host and deploy environment.
- **Version endpoint** — `GET /version` (and `GET /api/v1/version`, the one endpoint needing no bearer token) reports the deployed app release, the `/api/v1` contract version, the environment, the Cloudflare Worker build, and links to both changelogs. Values come from `package.json` and the OpenAPI spec, held in sync by a unit test.
- Per-request auth caching; geo-detected currency/locale defaults at bootstrap.
- App-wide keyboard shortcuts with a cheat sheet on `/`.

### Changed

- **Auth migrated from Neon Auth (`@neondatabase/auth`) to Firebase Authentication.** ID tokens are verified statelessly against Google's JWKS with `jose` (no `firebase-admin`, which is Node-only and unfit for Workers) and bridged to an httpOnly `__session` cookie. `users.firebase_uid` maps the provider id to our own UUIDv7 `users.id`, so nothing downstream sees a provider id.
- **Database driver moved to node-postgres, routed through Cloudflare Hyperdrive** in the deployed Worker, with query caching disabled so a just-written balance is never stale.
- Currency, number format, and categories **moved from the user to the workspace**, so every member sees the same amounts.
- **License** switched to **AGPL-3.0** (network copyleft); the project briefly carried Apache-2.0 during setup.
- Schema maintenance: dropped category color, unique-lowercase emails, added FK-supporting indexes.
- Removed the initial IntelliJ Java stub and leftover Next.js starter assets.

### Fixed

- **Comma-decimal amounts silently mis-scaled** (`1,50` stored as `150.00` — a 100× error) for every EU/IN-format user, across the money converter, quick entry, and bulk paste. Now share `src/lib/parse-amount.ts`.
- **Two providers, one email** caused permanent lockout: a Google sign-in after an email/password sign-up on the same address threw a unique-violation 500 on every request. Now links the account, or returns a clear `409` for unverified emails.
- `GET`/`PATCH /transactions/{id}` ignored `X-Workspace-Id`, so a user in two workspaces could read or edit across them.

### Security

- **CSV formula injection** — titles and categories beginning `=`, `+`, `-`, or `@` executed when an export was opened in Excel/Sheets, reachable cross-user in shared workspaces. Now escaped, with numeric cells exempt so `-40.00` survives.
- **`deleteAllTransactions` scoped only by `user_id`** — a demoted or removed collaborator could still wipe every transaction they had authored inside someone else's workspace. Now role- and workspace-checked.
- **Login CSRF / session fixation** — `POST /api/auth/session` set the session cookie from a request-body token with no origin check, so a cross-site `text/plain` POST could skip preflight. Now gated on `Sec-Fetch-Site`/`Origin`.
- Invite and notification emails **escaped** (workspace and profile names were interpolated into HTML raw) and **rate-limited**, closing a phishing/spam vector from a verified domain.
- Input length and amount limits tightened; shared title/description/amount caps enforced.
- Strict security headers (CSP, HSTS, X-Frame-Options), Zod-validated input, and parameterized queries throughout.

### Known limitations

- **Sign-out does not revoke Firebase refresh tokens.** Revocation needs admin credentials this Workers deployment doesn't hold, so a stolen `__refresh` cookie stays valid until Firebase expires it. "Sign out everywhere" is not supported. Accepted and documented in-code.

### Open source readiness

- `SECURITY.md` with a private vulnerability-reporting process; GitHub issue templates, PR template, and issue-template config.
- CI workflow running `pnpm lint` and `pnpm typecheck` on pushes and PRs.
- Toolchain pinned via `packageManager` (pnpm) and `engines.node` (>=20).
- Documentation corrected to the Firebase stack, and a **Doppler-free setup path** added (`dev:local`, `build:local`, `db:migrate:local`, `db:studio:local`) so the app runs from a plain `.env.local`.
- Repository metadata, `NOTICE`, and all repo links pointed at `playxoft/SpendChat_Nextjs`.

[Unreleased]: https://github.com/playxoft/SpendChat_Nextjs
[0.2.0]: https://github.com/playxoft/SpendChat_Nextjs
[0.1.0]: https://github.com/playxoft/SpendChat_Nextjs
