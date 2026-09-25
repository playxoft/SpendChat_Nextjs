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
(currently spec **6.4.0**) and reported as `apiVersion` by the same endpoint.

## [Unreleased]

## [0.28.0] — 2026-09-25

### Fixed
- **`#tags` in AI entry never reached the transaction.** Typing `#Travel` in an
  AI note picked the tag, left the marker in the note, and then lost it: the
  drafts came back untagged and saving wrote none. The prompt described the
  field and the save path was ready for it — but the Gemini request also carries
  a response schema, and that schema never declared `tagNames`, so the model was
  structurally unable to return it. Nothing in the diff showed this; only the
  wire did. (Gemini is what every deployment runs; the other providers send no
  schema and were unaffected.)

### Added
- **The AI tags transactions itself.** Beyond honouring a `#Tag` you type, it
  now applies any tag that clearly fits the item, the way it already picks a
  category — "1200 flight to Delhi, 800 hotel" comes back tagged `Travel`. Only
  tags that already exist in the workspace are ever used; it never invents one,
  and the review step is where you drop a guess you disagree with.

### Changed
- **A review row's tags moved into its title field**, as chips at the end of the
  text, matching where the manual composer already puts them. They are editable
  there too — a "#" button on each row, and a "×" on each chip — because the
  model now proposes tags as well as reading them, and re-parsing to fix one tag
  costs a model call and discards every other edit on the list.

## [0.27.1] — 2026-09-24

### Fixed
- **A missing blog post no longer shows two footers.** A 404 raised inside the
  marketing site — an unknown blog post, or a dev-only page in production —
  rendered the site-wide not-found page, which brings its own nav and footer,
  inside the marketing layout, which already has both. It now renders just the
  404 itself there, so the page has one nav and one footer like every other.

## [0.27.0] — 2026-09-23

### Added
- **Tags work in AI entry.** Type `#travel` in the note the way you type
  `/Food`, with the same picker and the same Create-it-from-here row. The
  marker stays in the note — it is the instruction the model reads — and the
  review list shows which tags each draft picked up. Unlike the category, a tag
  is **never guessed**: you get the ones you asked for and nothing else.
- **A `#` button on the tracker composer**, for picking tags with the pointer
  instead of typing the marker.
- **Create a category from the `/` picker.** If what you typed doesn't match
  one, the last row offers to make it — the same step the `#` picker has had.
  With nothing typed it reads **New category** and does the same thing. It
  works in manual entry, in AI entry and in the single-field layout.
- **Manage either list without leaving what you're typing.** The `/` picker
  opens with **Edit categories** at the top, the `#` picker with **Edit tags**,
  which opens a compact manager — rename, recolour, delete, add — rather than
  navigating to Settings and losing an unsent transaction.
- **Settings → About**, with what the app is, the versions it's running, and
  what the AGPL actually grants you.

### Changed
- **Picked tags now sit at the end of the title field** instead of on a row of
  their own above it. The composer no longer jumps a line the moment you apply
  one. Two show inline; the rest become a `+N` that names them on hover and
  opens the picker when clicked.
- The `/` category list says **Income** or **Expense** at the end of each row,
  instead of `in` / `out` — two letters that differ by one glyph.
- **The Input settings page shows the composer, not a drawing of it.** Both
  cards' previews render the real control strip and field row, and each follows
  the *other* card's current selection — so picking a layout updates the
  density previews, and vice versa. The old mocks had drifted: they predated
  the `#` button and showed controls the composer no longer has.
- **Settings has left the sidebar.** It is in the profile menu, which is on
  every screen in both layouts, and listing it twice spent a nav slot on the
  destination people visit least. The `s` shortcut still goes there.
- Tags use a **`#` icon** everywhere instead of the tag glyph, which was a
  near-twin of the one Categories uses.
- **The profile menu drops the source link.** The offer the AGPL's section 13
  asks for moved to Settings → About, which is reachable from the same menu and
  has room to say what the licence means instead of being a bare link.
- The mobile API's `/ai/parse` reads the `#` marker and returns `tagIds` /
  `tagNames` per draft — spec **6.3.0**, additive. See
  [the API changelog](./_developer/flutter/_changelog.md).

### Fixed
- **A flight number no longer opens the tag picker.** `#204` matched the tag
  marker, and because an open picker answers for Enter, that key offered to
  create a tag called “204” instead of sending the transaction — or, in the AI
  note, instead of starting a new line. A hash followed by a digit isn't a tag,
  which is what the AI has always been told and what the API contract says.
- **⌘/Ctrl+Enter parses the AI note again** even with a picker open; it used to
  insert the highlighted option instead.
- **“Edit categories” stays open** after adding one from AI entry. It closed
  after the first, so adding two meant reopening the picker and the dialog.

## [0.26.1] — 2026-09-22

### Fixed
- **Two pages still told you to press the wrong key.** The AI and analytics
  feature pages said a `#` pins a category. It hasn't since 0.24.0 — `#` is
  the tag marker and `/` is the category one, so anyone following that copy got
  a tag named after the category they wanted. This is a leftover from the
  trigger swap, not from tags.
- Copy that tags themselves made wrong: the transactions page said seven
  columns and listed the filters without tags; the export page named the CSV's
  columns without the one just added to it; the site FAQ (which is also the
  homepage FAQ, the `FAQPage` structured data and `/llms.txt`), `/docs` and the
  README all listed the filters without tags, and neither `/docs` nor the
  README mentioned `#` at all.
- The README's shortcut table listed keys the app stopped using: navigation is
  `Q`/`T`/`E`/`F`/`S` and add is `R`, not `T`/`R`/`A`/`S` and `E`.
- The keyboard-shortcuts page explains the `#` tag marker beside the `/`
  category one. Both are in the cheat sheet; only one was in the prose.

## [0.26.0] — 2026-09-22

### Added
- **A Tags column on the transactions page.** Visible by default, and draggable,
  resizable and hideable like every other column. A row shows its first three
  tags and a `+N` for the rest, which names them on hover.
- **Filter the transactions list by tag.** A multi-select beside the category
  filter; picking several matches transactions carrying **any** of them, and the
  record count, the totals, the CSV export and the print view all narrow with
  it. It survives scrolling — loading more rows keeps the filter.
- **Settings → Tags**: the full list with what each tag costs to remove ("on 34
  transactions"), rename, recolour and delete. The second place a tag can be
  created — the first is the composer's `#` picker. Viewers see it read-only.
- **Tags in the edit dialog**, for adding or removing them on a transaction that
  already exists, with the same create-a-tag step the composer has.
- **Tags on the tracker's chat bubbles**, under the description.
- **A `Tags` column in both CSV exports** — the tag names joined by `"; "`.

### Changed
- A column added by a release now appears **where it belongs** in a saved
  column layout, not tacked onto the end. Anyone who had ever reordered their
  transactions table would have found the new Tags column parked to the right
  of Amount and User, off the edge of the table.
- The mobile API gains `/api/v1/tags` (list, create, rename, recolour, delete)
  and its CSV export gains the `Tags` column — spec **6.2.0**, additive. See
  [the API changelog](./_developer/flutter/_changelog.md).

### Fixed
- **Picking two tags in the filter kept only the second.** The control read its
  selection back from the URL, which lags a round-trip behind on this page, so
  the second tick was computed against a selection that hadn't updated yet.
- **A filter on a deleted tag was a dead end** — an empty list with every
  control looking unset and no Clear button, escapable only by editing the URL.
- **Renaming or deleting a tag that someone else had already deleted reported
  success.** The settings page now says it couldn't find the tag, which is what
  the mobile API has always answered.
- **"Create new tag" at the 10-tag limit** created the tag and silently didn't
  attach it. The option is disabled at the limit.
- Tags on a row no longer visibly reshuffle a moment after saving: the row is
  painted in the order the server will return it.
- **The edit dialog could refuse to save.** Once its content was taller than
  the window, the attachment dropzone stopped being clipped and covered the
  footer, swallowing every click on Save — the button looked fine and did
  nothing. The dialog body now scrolls properly and the footer always sits on
  top. Adding the tag field is what made the dialog tall enough to show it.

## [0.25.0] — 2026-09-22

### Added
- **Tag a transaction while you type it.** Press `#` in the title field and a
  picker opens on the workspace's tags, filtering as you go — arrow keys move,
  Enter picks, Escape dismisses, and the `#travel` token disappears from the
  title once it is applied. Picked tags sit as removable chips above the
  composer until the transaction is sent.
- **Create a tag without leaving the composer.** If nothing matches what you
  typed, the last row of the picker is **Create**, which opens a small form with
  the name already filled in and one of twenty colours already chosen from it —
  so "Travel" lands on the same colour for everyone, and you can change it
  before saving. The new tag is applied to the transaction you were in the
  middle of writing.
- **Tags are shared across the workspace**, like categories. Renaming or
  recolouring one updates every transaction carrying it.

### Changed
- The transactions list can now be filtered by tag (`?tags=`), matching **any**
  of the tags you select rather than all of them. The filter UI itself lands
  with the Tags column in the next release.
- **The mobile API contract is now 6.1.0** (was 6.0.0). The same `?tags=` filter
  works on the API's transaction list, CSV export and analytics totals — an
  additive, optional query parameter, so nothing an existing client sends
  changes meaning. Details in
  [`_developer/flutter/_changelog.md`](./_developer/flutter/_changelog.md).

## [0.24.0] — 2026-09-22

### Changed
- **The category trigger in the composer is now `/`, not `#`.** Type `/` in the
  title field (or in an AI note) and the category picker opens exactly as it
  did before; `#` no longer picks a category. The change frees `#` for
  transaction tags, which land in the next releases, and it lines the app up
  with the convention most chat tools use — `/` for a command, `#` for a label.
  Nothing about how categories work changed, only the key that opens the list.
  The AI note understands the new marker too: `500 groceries /Food`. A slash
  between digits is still a date, never a category.
- **The mobile API contract is now 6.0.0** (was 5.9.5). Transactions carry a
  `tags` array and accept `tagIds` on create/update — both additive — but the
  `/ai/parse` marker change is breaking for the Flutter app, whose own inline
  picker inserts the old character. The details and the two required client
  changes are in
  [`_developer/flutter/_changelog.md`](./_developer/flutter/_changelog.md).

### Added
- **Groundwork for transaction tags.** A workspace-scoped `tags` table and the
  `tag_ids` column that links them to transactions, with the service layer and
  validation behind them. Nothing is user-facing yet — the `#` picker, the Tags
  column on the transactions page and the tag manager in Settings arrive in the
  next release. Existing transactions are untouched.

## [0.23.0] — 2026-09-17

### Added
- **A wall of situations on the home page, and one at the foot of every feature
  page.** Sixteen concrete scenarios — splitting rent three ways in Bengaluru,
  a filing-season CSV in Melbourne, cash-only days in Lagos — laid out as a
  staggered masonry wall, plus one to three feature-specific ones at the bottom
  of all thirteen `/features/*` pages.

  **These are scenarios, not testimonials, and that was a deliberate choice.**
  The section says so in as many words. We have no customer quotes yet, and
  manufacturing them — a name, a stock-photo face, a grateful sentence — is the
  same mistake as inventing an `aggregateRating`, which the home page's JSON-LD
  has always refused to emit. The FTC's 2024 Rule on Consumer Reviews and
  Testimonials makes fabricated endorsements directly actionable; stock-photo
  licences carve out implied endorsement regardless of commercial rights; and a
  product that sells itself on being private, open source and unwilling to guess
  at your data cannot be caught having guessed at its own customers. The repo is
  public — the commit would have been too. Real quotes, when they exist, get
  their own module with a name, a date and written consent.

- **The feature directory on `/features` is a bento.** Each of the Capture,
  Understand and Organise groups under "Every feature, explained" now shows a
  panel of the surface the feature actually is — the composer's bubbles, a
  filter and its results, a role list, a CSV — with the name and blurb beneath
  it, in an asymmetric 2×2. Thirteen panels, one per feature page.

  The cells are still links, and still carry "Learn more" — now as a button in
  the bottom-right corner, pinned to the cell rather than to the end of its
  copy, so the buttons share a baseline across a row instead of stepping up and
  down with the length of each blurb. A bento must not cost the crawlable href
  or the affordance the grid it replaced had; the button is a styled span, since
  the whole cell is already a link and nesting interactive elements is invalid.

  The widths are computed, not written out, because a group is not guaranteed
  to hold four — `organise` holds five today, which lays out as a row of thirds
  above a row of halves rather than stranding one card.

- **A mirrored two-column block for the four claims** that decide whether
  someone picks this over a bank app, replacing the three-stat strip that gave
  them no room to be convincing.

  In the text-led cells the mark leads — above the title in a tall cell, beside
  it in a short one. It began pinned to the bottom of the tall cells to soak up
  slack; once both cells shared that slack evenly there was none worth
  anchoring, and a card that opens with its icon is the more obvious read.

  **What fills these cells is copy, not a panel** — the two long claims carry a
  short list of specifics under the prose, and the mark stays a glyph. A surface
  mock belongs where it shows something ("this is what the export looks like");
  a claim like "no bank login, ever" has no surface, and inventing one would be
  decoration standing in for the argument. The cells were sized to the mark
  rather than reserving a share of the width for it, so the gap between mark and
  text isn't a hole where a panel used to be planned.

  The surface mocks are in the directory bento below, where each panel is the
  thing its feature actually is, built from the same borders, muted fills and
  tabular numerals as the app. Still CSS and type only — no images, so nothing
  costs a request, repo weight, or a second asset for dark mode. Each one is
  checked against the code it depicts: the CSV panel prints the real six-column
  header from `transactions-csv.ts`, and the shortcut panel shows keys that are
  actually bound in `shortcuts.ts`.

  The long-form Capture/Understand/Organise sections further down keep their
  plain two-column cards, deliberately. They repeat the directory's three
  headings, so a bento there would show the same chat bubbles and the same role
  list twice on one page; a quiet grid underneath is what lets the bento above
  stay the thing you look at.

### Changed
- **The old "Who it's for" grid is gone**, replaced by the wall above. Six
  evenly-sized tiles in a fixed three-column grid read as a table of contents;
  sixteen uneven ones read as a wall of distinct situations. The three columns
  are packed to end level, and every card grows a little into the leftover
  rather than the last one absorbing all of it.
- **The home page's feature index is a composed bento, not a directory.**
  Thirteen equal tiles three across gave the eye no entry point; the rows now
  change shape — `[4,2]`, `[3,3]`, `[2,2,2]`, `[2,4]` — while still filling
  whole rows for any feature count, which matters because `published: false`
  entries drop out in production and the count that ships isn't the one anyone
  laid out by hand. The `/features` hub keeps its even columns: it's a directory
  people read down, where this is a showcase they scroll past once.

  Three things in it were wrong on screen and right on paper, all the same
  fault — **space a card had no content to fill**. A two-row-tall lead card left
  220px of empty card, because a feature entry is an icon, a label and one line;
  width is emphasis that content can actually fill, so the lead is wide and
  nothing spans rows. Wide cards turning side-on made them *shorter* than the
  narrow ones beside them, leaving ~100px of dead space in the row, so every
  card stays stacked here. And packing the wall's columns longest-first put the
  three longest entries in the top row, which read as the grid it replaced and
  threw away the order the entries were written in.

## [0.22.1] — 2026-09-17

### Changed
- **Shorter, even cards on the blog index.** Titles now stop at two lines and
  excerpts at three, with an ellipsis, so every card in the grid is the same
  height instead of varying by the length of the post it links to. The tallest
  card lost 23% of its text block and the grid as a whole is 172px shorter, so
  more of the thirteen posts are reachable without scrolling.

  The clamp is a display rule, not an edit to the posts. `meta.excerpt` is each
  post's SEO meta description — it feeds `description`, `openGraph`, `twitter`
  and the `BlogPosting` JSON-LD, plus the RSS `<description>` and `llms.txt` —
  and ours run 125–181 characters, which is the length a search snippet wants.
  Shortening the prose to shrink a card would have paid for card height with
  search results, and would have needed redoing for every post written later.

## [0.22.0] — 2026-09-12

### Added
- **A workspace-currency card on `/features`.** The Organise section described
  profiles, sharing and categories but never the thing that makes a shared
  total readable — one currency and number format per workspace, chosen for you
  at sign-up and editable by an admin.
- **"Request a comparison" on `/compare`.** The app somebody looked for and
  didn't find is the most useful thing that page can learn, so it now asks,
  linking to GitHub issues. It shows whether or not any comparisons are
  published — an empty hub is exactly when the question is worth asking.
- **An RSS link and a "suggest a topic" card on `/blog`.** The feed had no link
  on the page it belongs to — only a `<link rel="alternate">` no reader ever
  sees — and what people want written about is worth asking for. The two also
  carry whatever remainder the post count leaves in the grid.

### Changed
- **Card grids fill whole rows at every width.** Thirteen feature pages in a
  three-column grid left one card stranded on a row of its own; the same held
  for the blog index, the `/features` directory and the four related features at
  the foot of every feature and comparison page. Each grid now widens its
  leading card(s) until the spans divide evenly — a bento that gives the
  flagship entry the emphasis it had anyway — and a widened card lays itself out
  side-on rather than stretched. The counts come from registries that grow, so
  this is computed per breakpoint (`src/lib/grid-fill.ts`) rather than tuned by
  hand: the gap can't come back the next time a feature is added. The comparison
  hub and the prose groups on `/features` go through the same maths, so neither
  depends any longer on its registry happening to hold an even number today.

  The blog index is the exception, and deliberately: every post card there is
  the same width at every breakpoint. A chronological list reads as a list, and
  widening the newest posts made the first two rows look like a different,
  two-column layout — worse than the gap it closed. The last of the two cards
  after the posts carries the remainder instead, widened by exactly the cells
  its row has left. That span is computed too: drafts are hidden in production
  and shown in development, so the post count differs between the two, and a
  class tuned to what renders locally is a hole on the live site.
- **Related features are two by two** on feature and comparison pages, instead
  of three across with a fourth stranded underneath. Those pages are `max-w-4xl`,
  where a fourth column would leave each card about 200px to say its piece in.

### Fixed
- The `/features` directory, the homepage feature index and the "Related
  features" blocks were three copies of one card. They're one component now
  (`src/components/marketing/feature-card.tsx`), which is how two of them had
  quietly lost the "Learn more" affordance the third kept — every feature card
  states it again, on all four directories.
- The dashed "ask us for something" cards — follow the feed and suggest a topic
  on `/blog`, request a comparison on `/compare` — were three copies of one
  card too, and are now `src/components/marketing/invitation-card.tsx`.

## [0.21.0] — 2026-09-11

### Added
- **A welcome email on the first sign-in.** New accounts get one message,
  from the same ZeptoMail sender the invites use: how to log a first
  transaction three ways (type, write a sentence for the AI, speak), five
  day-one tips (the `/` cheat sheet, bulk paste, profiles, inviting someone,
  export), a short "worth knowing" on free / open source / no bank login, and a
  reply-to that reaches support. The footer says plainly it is a one-off, not a
  newsletter. Sent exactly once per account — the send is claimed with a
  conditional update on a new `users.welcomed_at` column, so two first requests
  racing through bootstrap can't both send. Existing accounts never receive it.
- **Invite emails carry a link that joins the workspace.** A new
  `/invite/<token>` page shows who invited you, to which workspace, with what
  access, and offers *Create a free account* / *I already have an account*
  (both return to the invite afterwards, address pre-filled) or, when signed in
  with the invited address, a one-click *Join workspace* that makes it the
  current workspace. A different signed-in account is refused and offered a
  switch. The token is a 192-bit secret stored on the invite rows
  (`workspace_invites.token`), shared by a workspace + email group so one email
  carries one link, and kept across a re-scope so the link in the inbox keeps
  working. Someone who already has an account gets an *Open workspace* link
  (`/app?workspace=<id>`) that switches them there.
- **Branded, plain-text-friendly email layout** shared by every message: a
  600px table, inline styles, the neutral palette and single dark button from
  the app, and a text alternative rendered from the same content. The
  app's own pieces appear as tables and borders so they render with images
  blocked: the welcome email opens on a two-message tracker feed (day pill,
  an expense bubble on the right, an income bubble on the left with the
  emerald amount) above the composer strip, in the recipient's own currency;
  shortcut keys are drawn as key caps; the invite leads with the workspace
  tile — emoji, name, role pills — and a two-bubble preview showing who added
  what. The only image is the chat-bubble mark beside the wordmark
  (`public/email/logo.png`, regenerated from `scripts/email-logo.html`).
- **`/llms.txt`**, linked from the site footer — an llmstxt.org file for language models: what SpendChat is
  and deliberately isn't (manual entry, no bank sync, no paid tier, no native
  app), how to refer to it, then generated link sections for every published
  feature, docs section, comparison, blog post and FAQ, plus developer links.
  Built from the same registries as the sitemap, so it can't list a page that
  doesn't exist.
- Migration `0032` (`users.welcomed_at`, `workspace_invites.token`).

### Changed
- The sign-in, sign-up and verify-email pages honour a `?next=` destination
  (same-origin paths only) so an invitee lands back on the invite they came
  from; Google sign-in respects it too.
- The docs page's content moved to `src/lib/docs.ts` so `/llms.txt` can list
  its sections; the page itself is unchanged.

### Security
- The `?next=` redirect accepts only a single-slash same-origin path — no
  protocol-relative URLs, schemes, backslashes or control characters — so the
  auth pages can't be used as an open redirect.
- Invite acceptance stays bound to the invited email address even with the
  link in hand; a forwarded invite can't hand the workspace to another account.
- Line breaks are stripped from every outgoing email subject, so a workspace
  name can't split the `Subject:` header.

## [0.20.0] — 2026-09-09

### Added
- **Signup attribution.** The public site remembers the first link that named a
  channel — UTM tags, a directory's `?ref=`, or the referring site — for up to
  30 days in the browser, and a new account stores it in `users.acquisition` at
  the moment it is created, never rewritten afterwards. Hostnames and short tags
  only: no full URLs, no query strings. Migration `0031`.
- **"How did you hear about us?"** A one-tap card above the tracker feed,
  asked once of an account in its first week — the question is about a decision
  the visitor made on their way in, and a months-old account answering it is
  noise in a report that exists to measure a launch. The answer (or a skip)
  lands in the same column, the first answer is the one that stands, and the
  card never returns.
- **An invite nudge** for a workspace that is still solo after its first day:
  shared tracking is the feature people miss, so the tracker points the admin at
  Settings → Workspace once, dismissible (`ui_prefs.onboarding`).
- **`pnpm growth:report:dev` / `growth:report:prod`** — a read-only report of
  signups per day, per channel (with how many went on to add a transaction), per
  answer, and per landing page. `--days=<n>` narrows the window; a malformed or
  unrecognised argument exits 2 with a usage line rather than silently printing
  30 days of numbers under a heading the operator can't tell apart.
- **Five comparison pages under `/compare`** — SpendChat vs Splitwise, Walnut
  (now axio), Monefy, Mint and its paid successors, and YNAB. Each has an
  at-a-glance table, a two-sided "where each one wins" verdict, an FAQ with
  `FAQPage` markup, and prints the date the competitor's facts were checked
  against its own site. A `/compare` hub lists them; the footer links it.
- **A blog post on running Next.js 16 on Cloudflare Workers** — the five things
  that broke on the way there (middleware, `firebase-admin`, a shared pool,
  React's `cache()` outside a render, and a `DESC NULLS LAST` index) and what
  replaced each, with links to the files. Written for cross-posting to dev.to,
  Hashnode and Medium with a canonical back here.

### Changed
- **Privacy and cookie policies** describe the attribution record and the
  local-storage entry that carries it, including when the browser drops it.
- The stored first touch is now **deleted** once it goes stale, not merely
  ignored — the cookie policy says it expires after 30 days, and an entry left
  sitting in local storage did not honour that.
- A referrer is ignored on the sign-in/sign-up/verify pages and inside the app.
  Those are round trips, not channels: someone who arrives direct, signs up, and
  clicks the verification link in their webmail would otherwise have been
  attributed to their mail provider.

## [0.19.0] — 2026-09-06

### Added

- **Enter confirms the AI review list.** After a note is parsed into drafts,
  Enter — bare, or with ⌘/Ctrl — saves them, so an AI entry can be finished on
  the keys that started it instead of a reach for the mouse. It stands down
  wherever the key already means something else: on a button, inside an open
  category select or date picker, in a row's own amount, title or description
  field, while an input method is composing a character, and whenever the Add
  button itself would be disabled. The ⌘/Ctrl chord is the exception — it saves
  from wherever focus is. The Add button now shows the chord, the way the manual
  composer's send button does.

### Changed

- **The Features page drops its breadcrumb trail.** On a first-level page the
  trail read "Home > Features" — one link, to where the logo already goes —
  left-aligned above a centred header. Its `BreadcrumbList` markup went with it,
  since structured data for navigation the reader can't see is what the spam
  policies target. Feature and blog pages keep theirs, and the feature pages'
  trail is now centred with the hero it sits above.

## [0.18.0] — 2026-09-06

The three posts that predate the deep-dives, brought up to the same standard.

### Changed

- **The two original posts are full articles now.** "Introducing SpendChat"
  covers the six decisions the product is built on and the ones deliberately
  left out; "Track your money like a conversation" is about why expense-tracking
  habits die in the second week and what a chat interface changes about that.
  Both gained FAQs, figures and their own illustrations, in the same shape as
  the nine deep-dives — and an `updated` date, so the sitemap reports real
  freshness rather than a 2026 stub.
- **"SpendChat is now open source" is a release note again.** It had grown a
  general argument for open-sourcing a money app, which the new deep-dive covers
  properly and at length — two pages competing to answer one question helps
  neither. It now says what shipped, what it changes for you, and points at the
  longer piece. It also says "open core", which `README.md` and `CONTRIBUTING.md`
  both lead with and the announcement had left out.
- **"Track your money like a conversation" is now "Why Expense Tracking Habits
  Fail in Week Two".** The old title was `siteConfig.tagline` word for word, so
  the homepage and a 1,500-word FAQ-rich article were bidding for one query with
  the same title tag. The URL is unchanged.
- **A post shows its "Updated" date when it has one.** `updated` already drove
  `dateModified` and `og:modifiedTime`, but nothing rendered it — markup
  claiming a freshness the page doesn't show is a signal Google is entitled to
  discount. The release note gained the `updated` date its rewrite had earned.

### Added

- **A test behind the blog's generated images**
  (`tests/unit/blog-assets.test.ts`). `scripts/blog-image.html` keeps a
  hand-copied second set of every post's title, date, tag and reading time, and
  it has already shipped a cover printing the wrong date. The test holds the two
  files together and checks that each figure is embedded by a post and rendered
  to a PNG.

### Fixed

- **Eight claims about the product that the source doesn't support.** Voice
  entry was "hold `M`" with no mention that the composer has to be in AI mode
  first — the exact omission the last release fixed in four other posts — and
  was described as returning drafts by itself, when it drops the transcript into
  the AI note and waits for you to send it. Export and print were "no cap"
  against a 5,000-row file and a table that prints the fifty rows it has loaded.
  Bulk add was "paste a year of rows" against a 500-row limit. Signing up was
  "that's it for setup" on the route that mails a verification link first. The
  composer was "an amount, a category and send" when the title is the required
  field and the category is optional. And it was said to open with the amount
  field focused — in fifteen places across four posts, two figures and the chat
  and keyboard-shortcuts feature pages. It doesn't: `TransactionComposer` has no
  mount effect and no `autoFocus`, and every `.focus()` in it is a reaction to
  something you did. What was true, and load-bearing, is that the composer is
  always open under the feed with nothing to launch first — so that is what the
  copy says now.
- **The two rewritten posts have inbound links.** They were the only posts on
  the site nothing linked to — fifteen links out between them, none back — which
  put the two pages this release most wants to rank at the bottom of the site's
  own link graph.

## [0.17.0] — 2026-09-06

Nine feature deep-dives on the blog, one per part of the product.

### Added

- **Nine long-form posts.** Tracking expenses with AI, voice entry across mixed
  languages, going without a bank connection, spreadsheets versus an app,
  categorising expenses, sharing books with a partner, organising receipts,
  exporting to CSV at tax time, and what "open source expense tracker" ought to
  mean. Each is a comparison or a how-to rather than a feature list, each
  carries an FAQ and links through to the feature page it belongs to, and each
  is dated to when it was written — late June to early September — so the index
  reads as a cadence rather than a drop.
- **Eighteen new figures**, two per post, rendered ahead of time from
  `scripts/blog-figure.html` — three layouts, comparison, flow and table — in
  the same dark palette as the covers, and served straight off the CDN like
  every other static asset.

### Fixed

- **The "SpendChat is now open source" cover printed the wrong date.** Its
  entry in `scripts/blog-image.html` said 2 June while the post itself is dated
  2 September, so the shared preview card disagreed with the page. Corrected and
  re-rendered.
- **"Track your money like a conversation" documented the wrong key.** It said
  `/` tags a category in the composer; `/` opens the keyboard-shortcut sheet and
  `#` is the category tag.
- **Six wrong statements a review caught in the new posts.** The spreadsheet
  comparison said one `SUM` over the exported amount column gives you the net —
  it gives you exactly double, because the table closes with a `Total:` row (the
  sibling CSV post says so on the same day). The AI post's central sum said two
  seconds an entry is "about twenty minutes a year" for 1,800 entries; it is an
  hour, which is still the argument. Voice entry was described as one key with
  no mention that the composer has to be in AI mode first, so the instruction
  did nothing on a fresh account. The categories post advised merging a split
  category back, and there is no merge — deleting one leaves its transactions
  uncategorised, which the same post warns about two sections earlier. The CSV
  post recommended Print → Save as PDF for accountants and landlords without
  saying the table loads 50 rows at a time, so the PDF prints the header's full
  totals over the first 50 rows. And the receipts post opened on `IMG_4032.HEIC`
  without mentioning that HEIC is not an accepted upload.
- **The blog and the feature pages competed for four queries.** Four FAQ
  questions were word-for-word identical between a new post and an existing
  feature page, and both surfaces emit `FAQPage`, so the two were bidding
  against each other for one rich result. Reworded on the blog side.
- **The cover's alt text is defined once.** `imageAlt` was honoured in the
  article body but ignored by the index card and by `og:image`, both of which
  hard-coded the headline — the duplicate the field exists to remove. All three
  now read `coverAltFor()`.
- **The sitemap published `lastmod` a day early east of UTC.** Post dates were
  parsed at local midnight and serialised as UTC, and prod is built from a
  laptop rather than CI. They parse as UTC now, like the RSS feed's `pubDate`.
- **A figure's accent read backwards.** The table renderer painted every "Yes"
  in the emerald accent, so in "what the app actually holds" the only two
  highlighted rows were the two where the answer is yes. Which answer reads as
  the accent is now the figure's to say.
- **`<JsonLd>` escapes `<`.** `JSON.stringify` does not, so one `</script>` in a
  title, excerpt or FAQ answer would have closed the tag early and spilled the
  rest of the JSON onto the page.
- **The post order is deterministic for two posts sharing a date.** The
  comparator never returned 0, which left the index, the feed order and the
  eager-loaded cover up to the engine.

## [0.16.0] — 2026-09-06

The two things the blog was missing before it could carry anything longer than
a release note: FAQs that search engines can read, and illustrations that don't
shift the page as they load.

### Added

- **Posts can carry an FAQ.** A `faqs` array in a post's frontmatter renders as
  an accordion at the foot of the article *and* as `FAQPage` structured data —
  from the one array, so the visible text and the markup can't drift apart.
  Marking up an answer that isn't on the page is the mismatch search engines
  treat as spam, and this makes it impossible to write.
- **In-post illustrations.** A `<Figure>` component with required alt text, a
  visible caption, and declared dimensions so a lazily-loaded image no longer
  pushes the paragraph you're reading down the page.
- **Blog posts carry a breadcrumb trail**, visible and as `BreadcrumbList`
  markup, in place of the bare "All posts" link — so a search result shows
  Home › Blog › the post rather than a raw URL.

### Changed

- **Blog posts are wider: `max-w-2xl` → `max-w-4xl`.** 1200×675 figures were
  being scaled to 672px, which is not a size at which a comparison table can be
  read. Text, cover and figures all share the one width — `POST_WIDTH`, a single
  constant on the post page — so nothing sits wider than the column around it.
  4xl is as wide as the body copy goes before line length starts costing more
  than the pictures gain.

### Fixed

- **A blog cover's alt text was the post's own headline**, printed as the `<h1>`
  directly above it and as the card title on the index — so a screen reader
  announced the same sentence twice, on every post and every card. The covers we
  generate are title cards, so beside the headline they are decorative and now
  say so; a cover that shows something else describes it in `imageAlt`. That one
  answer is derived in `src/lib/blog.ts` and used by the post, the index card and
  the social preview, which had each been deciding it separately — and
  disagreeing. A chat preview, where the card stands alone with no headline
  beside it, still gets a description rather than an empty string.
- **Two FAQ entries asking the same question collided.** The accordion keyed its
  items by the question text, so a repeated question opened both panels from one
  click and left React reusing the wrong subtree. Items are keyed by position
  now. The block itself was a second copy of the feature pages'; both render one
  `FaqSection`, so the next fix here lands in one place.

## [0.15.0] — 2026-09-05

A tighter marketing header: it tells you where you are, and it takes a key.

### Added

- **Press `s` anywhere on the public site to get started.** The key goes exactly
  where the "Get started" button goes — straight into the app if you're already
  signed in, to sign-up if you're not — and the button now carries a chip
  showing it. It stands down wherever a keystroke already means something: while
  the mobile menu is open, while you're typing in a field, and while you're
  playing with the keyboard demos on the Features pages, which take the same key
  for themselves.

### Changed

- **The header highlights the page you're on.** Pricing, Docs, Blog and About
  now light up the way Features already did, in the top bar and in the mobile
  menu, and sub-pages count — a blog post keeps "Blog" lit. Screen readers get
  the same information as `aria-current`.
- **One button in the header instead of two.** "Sign in" no longer sits beside
  "Get started" on desktop, or under it in the mobile menu, so the header asks
  for one decision rather than asking you to classify yourself first. If you
  already have an account, the sign-up page links straight to the sign-in form,
  and `/sign-in` itself is unchanged — a bookmark or a saved password still
  lands where it always did.

## [0.14.0] — 2026-09-02

Open-source readiness pass: the things that would have been wrong on the day the
repository went public.

### Security

- **Next.js 16.2.9 → 16.2.12.** Picks up fixes for four high-severity advisories
  in 16.2.x, two of them Server-Side Request Forgery in Server Actions — which
  is most of how this app writes anything.
- **pdf.js 6.1.200 → 6.3.289**, past the versions carrying an
  arbitrary-JavaScript-execution bug reachable from a crafted PDF. Receipt
  thumbnails are rendered from whatever file you pick, so that parser reads
  hostile input by design. XFA — a second, richer parser a thumbnail never needs
  — is now switched off explicitly rather than left to its default.
- **Deleting your account now deletes your files.** It removed every database
  row but nothing from object storage, so uploaded receipts, vault documents and
  your profile picture stayed in the bucket after the rows that referenced them
  were gone — unreachable from any screen, and impossible for a later sweep to
  find, but still stored. Anything the account owned is now collected before the
  delete and removed after it. The whole deletion also runs in one transaction:
  it was eight separate statements, so a failure part-way could destroy your
  transactions, leave the account half-alive, skip the file sweep entirely and
  still report that the deletion had failed. (Deleting a single *profile*
  already worked this way; the two now share one implementation.)
- **The AI and email rate limits can no longer be beaten by sending everything
  at once.** Both counted, then wrote, as two statements: fifty simultaneous
  requests all read a count under the limit and all passed, which is precisely
  the caller each limit exists to stop. Both now take a per-user advisory lock
  for the length of the check, so concurrent callers queue behind one another
  and the one past the limit genuinely loses. The AI cap protects the operator's
  model bill; the email cap protects the sending domain from being used to send
  bulk mail.
- Upload routes — including voice transcription and avatars, which take the
  largest and the most frequent bodies — turn away an oversized upload from its
  `Content-Length` before reading it, rather than buffering the whole thing and
  rejecting it afterwards.
- A PDF that fails to parse no longer leaks its loading task into the shared
  pdf.js worker. A malformed or hostile file is exactly the one whose parse
  rejects, and that was the path that skipped cleanup.

### Changed

- **The privacy policy now describes the app that exists.** It had not been
  touched since the first week of the project and had fallen behind the product:
  it named only two processors, said nothing about AI entry, voice entry,
  uploaded files, share links or workspaces, and stated that your records are
  never visible to other users — which stopped being true when workspaces
  shipped. It now lists every third party that touches your data and what each
  one receives, explains exactly when content reaches an AI provider (only when
  you use AI or voice entry) and that recordings are discarded, describes what
  workspace members and share links can see, and points at the account deletion
  that has been in Settings for months rather than telling you to email support.
- Every signed-in screen now offers the source code from the account menu, which
  is what the AGPL asks a hosted copy to do — the link previously existed only
  in the marketing footer, which never renders inside the app.

### Fixed

- `.env.example` was missing ten variables the app actually reads — all of R2
  file storage, all of ZeptoMail, and `APP_ENV` — while the README claimed it
  documented them. A fresh clone got a file vault that answered 503 and invites
  that silently never sent, with nothing anywhere to explain why. All are now
  documented, with a note on what breaks when each is unset, and a test fails
  the build if the file and the code ever disagree again.
- The launch blog post described the stack as using Neon Auth (it has been
  Firebase Authentication since June) and carried a publication date from before
  the project's first commit.
- `CONTRIBUTING.md` told contributors the Doppler CLI was required. It is not —
  it is the maintainers' secret store, and the `*:local` scripts have always
  covered the same ground from a plain `.env.local`.

## [0.13.4] — 2026-09-01

### Fixed

- **You can type an amount in your own numerals again.** Every amount field —
  the composer, the edit dialog, the AI review grid, the bulk grid — filtered
  keystrokes through a rule that only recognised the digits 0-9, so an Arabic,
  Persian, Devanagari or Bengali keyboard produced nothing at all: no character
  appeared, and no error said why. The row would show you a perfectly correct
  "٤٠٫٠٠" and then refuse to let you retype it. Amounts now accept any numeral
  system, including the locale's own decimal and grouping separators, and are
  read back the same way. This is the half that was missing from 0.13.2's fix
  for saving a prefilled amount in those locales.
- **Totals in a downloaded report are numbers your spreadsheet can add up.**
  The three totals at the top of the CSV were written as display text: the
  negative sign was U+2212 MINUS SIGN rather than an ASCII hyphen, so Excel and
  Sheets read the Net cell as words instead of a figure — it couldn't be summed,
  compared or charted, and nothing explained why. Under a locale with its own
  numerals the same cells also carried Arabic-Indic digits and a right-to-left
  mark. They are now plain numbers with the currency in its own column, matching
  the Amount column and the table's own footer total.

  The Date column still follows your locale, including its numerals — that's
  deliberate, and unchanged.
- CJK numerals (〇一二三) are *not* read as an amount. They are digits in one
  numbering system and ordinary words in every other use, so accepting them
  would have turned a note reading "一" into the number 1.

## [0.13.3] — 2026-09-01

### Fixed

- **The "four ways to add a transaction" section was invisible on a phone held
  sideways.** Its demo frame is sized against the viewport minus the pinned
  heading, and on a short screen that subtraction went negative — which CSS
  floors at zero. You got four screens of scrolling describing a widget that
  wasn't there. The frame now has a floor, and below 44rem of screen height the
  section stops pinning altogether and reads as an ordinary heading, widget and
  four blocks — which is also what it does without JavaScript.
- **The FAQ answers could be opened blind from the keyboard.** The expander's
  focus ring was drawn in a colour that measures 1.54:1 against the card, under
  the 3:1 a focus indicator has to meet, so there was no visible sign of which
  question you were about to open. It now uses the same ring the shortcut
  playgrounds already switched to.
- **Sending or importing in a demo dropped your place on the page.** Both
  buttons switch off the moment they clear the box, and a browser blurs a
  focused button that becomes disabled — so the keyboard landed back at the top
  of the document and you had to tab through the whole page to add a second row.
- **Demo scroll boxes can be scrolled from the keyboard.** Firefox and Safari
  don't make a scroll container focusable on their own, so the transaction
  feeds, the file lists, the shortcut cheat sheet, the generated CSV and the
  comparison table all stopped at the first screenful unless you had a mouse.
  This covers the app's tables too.
- **Three demos left the rows you'd just added out of sight**, below the fold of
  their own feed, while the caption said they'd been added above.
- **Replaying the AI and voice demos stacked duplicates.** Adding, replaying and
  adding again piled up three, six, nine copies of the same transactions and
  drifted the balance to a number the demo never meant to show. A replay now
  puts the feed back.
- Two controls invited you to use them and did nothing: the voice demo said
  "type or hold M" over a box that is read-only and listens for no key, and the
  files demo's Upload button was fully live with nothing behind it.
- The settings sections on a phone had no scrollbar and nothing else to say the
  row continued past the edge — about three of the seven fit on a narrow screen.
- The keyboard shortcut sheet and the category strip animated their scrolling
  even when you'd asked for reduced motion. A `behavior` passed in JavaScript
  wins over the stylesheet, so it has to read the preference itself.
- The demos could price themselves in one country's currency while formatting
  the numbers for another — rupees grouped the Esperanto way, and a bulk sample
  written with separators nobody in that country types.
- Scrolling past the homepage's entry section left its animation timers running.

### Changed

- **The export page no longer promises more than the exporter does.** It said
  any spreadsheet would add up the amount column — true only where the decimal
  separator is a dot, since that column is always written with one — and that
  bulk-pasted rows "leave the same way they came", which they don't: the export
  and the bulk parser order their columns differently.
- Ctrl+Shift+E no longer flips a row between expense and income in the bulk-add
  grid. Plain Ctrl+E (⌘E) still does, which is what the tracker has always
  accepted and what the hint under the grid names.
- Nine release headings in this file described seven releases: `0.7.0` and
  `0.8.0` were written in the same commit that set the version to `0.9.0`, so no
  build ever carried them. They are one section now, and two headings that were
  dated a day before the work they describe have been dated to it.

## [0.13.2] — 2026-08-27

### Fixed

- **Editing an amount no longer fails to save if your language uses its own
  numerals.** The edit dialog prefilled the amount as "٤٠٫٠٠" for Arabic,
  Bengali, Persian, Marathi, Nepali and Burmese locales — legible, but rejected
  by the app's own parser, so Save failed on every attempt until you retyped the
  number in ASCII. The locale is picked automatically from your browser at
  sign-up, so nobody chose this. Amounts written back into an input now pin
  Latin digits the way every other round-tripping formatter already did;
  displayed amounts keep your numerals.
- **Keyboard hints are spoken again.** A shortcut chip sitting in a sentence was
  hidden from screen readers, so "Press ⌘↵ to send" was read as "Press to send".
  Chips in prose now carry the combo in words, punctuation keys are named
  ("Slash", "Hash", "Backtick") instead of being dropped at a reader's default
  verbosity, and the shortcuts reference — in Settings, in the `/` dialog, and on
  the marketing page — announces each row's key instead of a list of verbs.
- **Blog previews stopped disappearing from search and chat.** Post images in the
  page's structured data were relative on the article page, which Google drops,
  and a post pointing at an absolute URL had the site address pasted in front of
  it. The first cover on the index also loads eagerly now, since it is usually
  the largest thing on the screen.
- Several corrections to the feature pages, which had promised things the app
  does not do: filtering to uncategorised transactions, archiving a profile, and
  unlimited exports. Bulk import (500 rows) and export (5,000 transactions) now
  state their real limits, and the privacy and export pages no longer contradict
  each other about the latter.

### Changed

- The marketing demos follow your own currency and number format throughout —
  the voice transcript now quotes the same figures the rows it produces show, the
  bulk preview and the import agree to the last decimal for currencies with three
  of them, and a demo can no longer offer to import a row it would silently drop.
- The mobile navigation menu scrolls, so "Sign in" and "Get started free" are
  reachable on a phone now that the menu lists every feature page.
- The analytics page renders its ranked category list as part of the page rather
  than inside the chart's lazily-loaded bundle, so it is there before the chart
  is — and for anything that reads the page without running it.

## [0.13.1] — 2026-08-26

### Changed

- **The four entry methods scroll past instead of swapping in place.** The
  section's heading and the composer beside it stay put — they're the constants
  — while each method's description scrolls up with the page, fading in as it
  reaches the middle and back out as it leaves. The fade follows the scroll
  wheel rather than playing a fixed animation once you cross a line, so it goes
  at whatever pace you read at, forwards or back. Past the last method the
  heading, the copy and the widget go up the page together and the next section
  follows — previously the widget slid away on its own while the heading stayed
  stuck to the top.
- The demo now starts on the method you arrive at. Previously the first one sat
  idle until you scrolled to the second, so the opening example was the one you
  never saw run.
- The hero's tracker is taller, and sized against the viewport rather than
  fixed, so it fills a desktop screen without pushing its own buttons below the
  fold on a laptop.
- **Bulk paste opens the bulk-add dialog**, the way it does in the app,
  instead of being a third box in the composer. It's the one entry method that
  isn't the composer — showing it there said the wrong thing about where the
  feature lives. The dialog opens over the widget with the grid the real one
  has — a row per transaction, type, amount, title and category each in its own
  field. Nothing is typed: a paste arrives as a block, so the grid fills a row
  at a time. Importing closes it with the transactions in the feed behind.
- **Every demo's replay control moved out of the widget and under it.** It was
  sitting in the composer's control strip, which is a copy of the app's — and
  the app has no Replay button in it, so the demo was editing the thing it was
  meant to be showing, and crowding the real controls on a narrow screen.
- The last method now parks on the reading line rather than scrolling past it.
  The other three have somewhere to go — the next method — but the fourth has
  nothing after it, and letting it climb away left the widget demonstrating a
  paste with nothing beside it saying what the paste was. It holds where it was
  read while the page keeps scrolling, then leaves with the heading and the
  widget.
- The last of the four entry methods no longer fades out. A method fades to
  make room for the next one and there isn't one, so it now stays readable
  until it leaves with everything else.
- **The "you're signed in" card sees itself out after ten seconds.** It's an
  offer, not a task, and it was sitting in the corner for the whole visit.
  Pointing at it pauses the countdown; moving away restarts it. Two cards don't
  time out, because they hold the only way out of where you are: the one you
  reach by `?stay=1`, whose checkbox is the only switch that turns the redirect
  off, and the one that appears when opening the app took too long.

### Fixed

- **No horizontal scrollbar in the interface shoves content around on Windows
  any more.** A Mac draws scrollbars over the content and only while you
  scroll; Windows and Linux draw a real one that takes layout space out of the
  box it belongs to, so a bar appearing under a row of chips or a table moved
  everything above it. Every sideways scroller in the app and on the site now
  either has no bar (rows of chips and tabs, where 6px is a sixth of the row
  and nothing is reachable only by dragging) or a 6px one instead of the
  platform's 17 (tables and grids, where the bar is the only thing saying
  there's more to the right). The page's own scrollbar is untouched.
- **The category strip no longer carries a scrollbar on Windows.** It had a
  4px one, which macOS draws over the content only while you scroll and
  Windows draws permanently, taking a slice out of a row that is only as tall
  as its chips. There's no bar on it now, on any platform — you swipe or
  shift-scroll the strip, and every category is also one tap away in the picker
  beside it.
- **Shortcut hints use symbols on Windows too.** `Ctrl` `Enter` was two wide
  boxes where a Mac had two small ones, which is the difference between fitting
  in a compact control strip and not; it now reads ⌃ ↵ everywhere. Screen
  readers and the shortcuts page still get the words — "Ctrl+Enter" is what
  gets announced and what people search for.
- **The homepage no longer jumps a thousand pixels down the page on load.**
  Every demo composer carries the app's category strip, which centres the
  selected chip when it mounts — through `scrollIntoView`, which is free to
  scroll the page as well as the strip. On a phone that landed you below the
  hero before you had touched anything. It scrolls the strip and nothing else
  now, in the app as well as on the marketing pages.
- **The homepage no longer scrolls sideways on a phone.** The comparison table
  scrolls inside its own container, but the screen-reader labels in its tick
  and dash cells are absolutely positioned, and with nothing positioned around
  them they were being placed against the document — pushing the page 140px
  wider than the screen. With the page wider than the viewport, the fixed
  navigation bar no longer covered it, which is what made the whole thing look
  broken.
- The demo composer's controls fit on a phone. The date chip — which reads
  "Today" and does nothing — is hidden below `sm`, where it was crowding the
  category row out of the strip and leaving the Replay button on top of it.

## [0.13.0] — 2026-08-22

### Changed

- **The four entry methods are now one widget you scroll through**, not tabs.
  Keep reading and the composer works its way from typing two fields, to
  writing a sentence, to holding the mic, to pasting rows — and each one ends
  with what you entered sitting in the feed as ordinary transactions, which is
  the point being made. Nothing is hidden behind a click any more, so all four
  descriptions are on the page for anyone reading or searching.
- The widget is taller, and the composer sits at the bottom under the history —
  where the app puts it.
- **The hero now shows the app's own composer** rather than a separate,
  slightly different one built for the homepage. There was one composer too
  many in the codebase; there is now one.
- Blog covers run edge to edge on the cards, and are larger on the post itself,
  which also starts closer to the top of the window.
- The transactions type filter is a dropdown — All, + Income, − Expense —
  rather than a three-way switch.
- The section's heading and description now stay put while you scroll it, and
  only the method under them changes — so the four descriptions swap in place
  instead of travelling up the page past the heading.

### Fixed

- **Amounts added by a demo were converted twice.** A ₹1,000 lunch imported
  through the bulk demo showed as ₹80,000: the seeded rows are written in
  dollars and converted for the reader, but a row a demo had just added was
  already in the reader's currency and got multiplied a second time on its way
  into the feed. Conversion now happens in exactly one place.
- Some seeded amounts were the wrong size — a $360 afternoon coffee, and a chai
  that didn't match the ₹20 in the sentence being spoken above it.

### Removed

- The Reset button on the chat demo. It was housekeeping for a demo that resets
  itself.

## [0.12.0] — 2026-08-22

### Added

- **The homepage now shows you entering a transaction, not just the result.**
  Each of the four tabs under "Four ways to add a transaction" animates its own
  input as the section scrolls into view: the amount and title fields typing
  themselves and a send that drops a bubble into the feed, a messy sentence
  landing in the AI note box and coming back as drafts, the mic button
  recording with the words arriving as you'd hear them, and a paste box filling
  in row by row while the real parser previews it underneath. Each tab has a
  Replay control, and anyone who has asked their system for reduced motion sees
  the finished state without any of it moving.
- **A files section on the homepage** — folders with their colour tints, files
  with their tags and sizes, and the workspace storage gauge, with the vault's
  specifics (share links, 1 GB per workspace, 5 MB per file) beside it.
- **A shortcuts section you can actually use** — click the panel, press `t`,
  and the section changes. Every key shown comes from the app's own registry,
  and the panel listens only while it has focus, so the page's own keyboard
  behaviour is untouched.

- **Every demo now shows money in your own currency.** A page pricing lunch at
  $12.50 asks a reader in Chennai to translate before the product feels like
  it's for them, so the demos read a currency from your browser and scale the
  example amounts to match — ₹3,200 for a weekly shop rather than ₹40. Nothing
  about your own data is converted; the app still stores each workspace in its
  own currency and does no conversion at all.
- **Blog posts have cover images**, shown on the index, on the post itself, and
  as the preview card when a post is shared.

### Changed

- The receipts card and the static list of shortcut chips have been replaced by
  the two sections above.
- **Answers on the feature pages are now expandable**, under a heading that says
  FAQ rather than Questions. They stay in the page for search engines and for
  anyone reading without JavaScript.
- The transactions filter has an explicit **Both (−/+)** option. Clearing it
  used to mean clicking the selected side a second time, which nothing on
  screen told you about.

### Fixed

- The bulk-import demos pasted a comma-separated sample regardless of where you
  are, so in every locale that writes decimals with a comma — much of Europe —
  the preview reported every row as broken. The sample is now written in your
  own format.

## [0.11.0] — 2026-08-22

### Added

- **The last five feature pages** — shared workspaces, custom categories,
  keyboard shortcuts, export and print, and privacy and security. Every feature
  now has a page of its own, each with a demo you can use without an account.
- The **workspaces** demo shows what a role actually means: change someone from
  viewer to editor and watch which profiles they can reach change with it,
  including the case where a per-profile grant beats their workspace role.
- The **shortcuts** demo responds to real keystrokes — press `t` and the
  sidebar moves — and its cheat sheet is generated from the app's own registry,
  so it can never advertise a key the app doesn't bind.
- The **export** demo shows the actual CSV you would download, regenerated from
  the app's own serialiser as you change the filters, including how it quotes a
  title containing a comma and a quotation mark.
- The **privacy** page is a plain account of what leaves your device for each
  action, and says outright what we don't have: no encryption at rest, no
  audits or certifications, no two-factor authentication.

### Fixed

- Several claims on the newer feature pages were wrong and have been corrected
  against the code: the CSV export carries your filters but **not** your sort
  order (it is always newest first), it holds the title rather than the longer
  description, and a single file covers up to 5,000 transactions. The analytics
  page also claimed the transactions table can filter to uncategorised rows,
  which it can't.

## [0.10.0] — 2026-08-22

### Added

- **Four more feature pages, each with a working demo** — the transactions
  table, analytics, the receipts vault, and bulk import. The transactions demo
  really filters, searches your notes and sorts; the analytics demo swaps its
  whole dataset when you change the range; the bulk-import demo runs the app's
  actual parser on every keystroke, including on the one sample row that's
  broken on purpose.
- The Features menu now opens on hover, and clicking "Features" goes to the
  overview page instead of only toggling the menu.

### Changed

- **Every demo now runs at the app's compact density**, so the whole control
  strip sits on one line the way it does in the app — which also gives the feed
  back the vertical space it was spending on a taller composer.
- Demo feeds fill from the bottom and span two days, so they show a day divider
  and read as a history someone has been keeping rather than three rows in an
  empty box.

### Fixed

- The AI and voice note boxes were stretching to fill the composer instead of
  sizing to their content, which made them several times taller than the app's.
- The bulk-import preview said "1 line need fixing".

## [0.9.0] — 2026-08-22

### Added

- **The Features page now covers everything the app actually does.** AI entry,
  voice entry, receipts and the files vault, analytics, profiles, shared
  workspaces and custom categories were all missing from it — the page still
  described the product as it stood six months ago.
- **A Features menu in the site navigation**, grouped into Capture, Understand
  and Organise, so each feature page is one click away from anywhere on the
  marketing site. On phones the same list appears under Features in the menu.
- Feature pages are described once, in one place, and the hub page, the
  navigation menu and the sitemap all read from it — so a new one can't be
  published and then quietly forgotten by the sitemap.
- Breadcrumbs on nested marketing pages, so a search result shows
  Home › Features › … instead of a bare URL.

- **Four feature pages, each with a live demo you can use without an account** —
  chat entry, AI entry, voice entry, and profiles. The demos are built from the
  app's own components, so what you try on the marketing site is what you get
  after signing up: the same transaction bubbles, the same category picker, the
  same Manual/AI toggle, the same push-to-talk mic.
- The **voice page lets you hear the multi-language case rather than read about
  it** — switch between English, Hinglish, Tamil-with-English and Spanish and
  watch each one come back transcribed and split into transactions. It also
  lists all 27 languages you can pick from.
- The AI demo runs the whole sequence — a messy sentence typing itself out, the
  parse, the editable drafts, the confirm — and replays on demand. It scripts a
  fixed example rather than calling a model, and says so.
- No microphone is ever requested by the voice demo, and nothing any demo does
  is saved.

- **The home page now shows what the app actually does.** It described the
  product as it stood six months ago; AI entry, voice, receipts, analytics,
  profiles and shared workspaces were nowhere on it. New sections cover all of
  them, plus who it's for, how it compares to bank-linking apps and
  spreadsheets, and a keyboard-shortcut list that reads from the app's own
  registry rather than being typed out separately.
- **"Four ways to add a transaction"** — a tabbed section covering chat, AI,
  voice and bulk paste. The bulk tab runs the app's real parser as you type, so
  you can edit the pasted rows and watch them re-parse.
- A spending breakdown with the category chart from the analytics page. The
  numbers are also written out as a plain list, so they're readable before the
  chart loads and to anything that never loads it.
- The FAQ gained eight entries covering bank connections, AI, voice, profiles,
  sharing, receipts and installation.

### Changed

- The `keywords` meta tag is gone from every page. Google has ignored it since
  2009 and Bing reads a stuffed one as a spam signal; the terms it listed belong
  in the page copy, which is where they now live.

- The AI accent gradient now has one definition instead of two near-identical
  copies, which is what makes "there is exactly one gradient in this app"
  enforceable.

### Fixed

- **The category chart could render as an empty circle.** When it loaded late —
  as it now does on the home page — its mount-time animation could resolve
  against a container it hadn't measured yet and draw nothing at all. The
  animation is now optional, and off wherever the chart arrives lazily.

## [0.6.2] — 2026-08-21

### Fixed

- **The home page no longer navigates you to the app part-way through reading
  it.** If you had the "always take me straight here" preference but signed in
  somewhere else, coming back to the tab could yank you to the app. The handoff
  is now decided when the page loads, and only then.
- **`/?stay=1` works even if you dismissed the card earlier.** Dismissing it and
  then returning to that URL used to leave the preference with no way to reach
  its off switch for the rest of the visit.
- The home page no longer errors for people browsing with all storage blocked —
  reading the dismissal could throw where it was meant to be caught.
- While the app opens, the page behind the loading cover is properly inert: it
  can't be tabbed into or read out by a screen reader any more. **Esc** now
  cancels the wait and gives the page back.
- A held mic is released whenever the button is disabled mid-hold — not just
  during a profile switch, but also when a parse starts under it.

### Changed

- The **Cookie Policy** now describes `__session` accurately (it carries your
  sign-in token, and therefore your name and email), lists `__refresh` alongside
  it, and no longer implies `/?stay=1` clears the "go straight to the app"
  preference — unticking the box does.

## [0.6.1] — 2026-08-21

### Fixed

- **The home page's "go to app" card now closes when you close it.** If you had
  ticked "Always take me straight here", the ✕ did nothing — on `/?stay=1`, the
  one page where you were most likely to press it.
- **Ticking that box no longer throws you out of the page you're on.** It sets
  what happens on your *next* visit; before, the tick itself redirected you
  immediately, and the only way back was a URL nothing on the page mentioned.
  The card now says where that way back is.
- If the app doesn't open within a few seconds, the home page comes back with a
  "Try again" instead of leaving you on a spinner you can't get out of.
- The card now appears (and disappears) as soon as you sign in or out, rather
  than waiting for the next reload — including after signing out in another tab.
- **A held mic no longer keeps recording when you switch profile or workspace.**
  The switch disabled the button mid-press, which left the recording running to
  its one-minute cut-off with your mic still open.
- ⌘/Ctrl+E and `a` are now ignored during a profile or workspace switch, like
  the rest of the composer already was — they could flip the transaction type
  (clearing the chosen category) or swap entry modes on a locked composer. `r`
  and `b` likewise no longer open an add dialog mid-switch.

### Changed

- The **Cookie Policy** now lists the two cookies the home page handoff uses
  (`sc_signed_in`, `sc_go_to_app`), what each holds, and how to clear them.

## [0.6.0] — 2026-08-21

### Added

- **If you're already signed in, the home page offers to take you to the app.**
  A card slides in on the right — "Go to app", plus a checkbox to make that the
  default. Tick it and visiting the home page sends you straight to your
  tracker from then on, on that browser. Dismiss it and it stays quiet for the
  rest of the visit.
- Changed your mind? Open **`/?stay=1`** to load the home page anyway; the card
  appears with the box already ticked, so you can untick it there.

### Notes

- Signed-out visitors see none of this — the home page is exactly as it was, and
  it stays statically rendered, so nothing about its speed or search indexing
  changes. The preference is per browser rather than per account, which is what
  lets the home page skip an account lookup before deciding where to send you.

## [0.5.7] — 2026-08-21

### Fixed

- **AI mode now goes quiet while you switch profile or workspace, the way
  manual entry already did.** Only the manual side of the composer dimmed and
  locked during a switch; the AI note stayed live, so you could keep typing,
  hold the mic, parse a note, or confirm a reviewed batch while the profile
  underneath you was still changing — and a batch confirmed in that window
  landed in whichever profile finished loading. Both sides now dim and lock
  together, including the note, the mic (its hold-to-talk shortcut included),
  and the review list's Save.

## [0.5.6] — 2026-08-19

### Fixed

- **The files vault is fast when it's showing every profile, not just one.**
  0.5.5 gave both of its tables an index the listing can read straight off, but
  only a view scoped to a single profile could use it — asking for all of them
  went back to reading everything and sorting it. That is the default the mobile
  app gets, so the phone was on the slow path every time. Both halves of the
  page now read one date-ordered index per profile and merge them. On a vault of
  60,000 files, the all-profiles view went from reading 1,283 blocks to 36.

## [0.5.5] — 2026-08-19

### Fixed

- **Opening the files vault no longer slows down as the vault fills up.** The
  page builds its list from two tables — uploaded files and transaction
  attachments — and both were indexed by workspace, while every read of either
  is scoped by profile. That's the same mismatch `transactions` had in 0.5.4,
  in the same place, and both also sorted their dates the one way Postgres
  won't match to the order the vault asks for. So the page read everything it
  could see and sorted the lot to show the first screen. On a vault of 60,000
  files, opening it went from reading 1,336 blocks to 22. This is the normal
  view, which shows one profile; "All profiles" still sorts, and is unchanged.
- Merging two profiles no longer re-reads every file in the database once for
  each tag name the two have in common.

### Changed

- Replaced those indexes with ones the listings read straight off, plus plain
  ones for the storage-quota total.

## [0.5.4] — 2026-08-19

### Added

- `pnpm db:health:dev` / `pnpm db:health:prod` — reports how close the database
  is to its Neon storage cap (writes start failing at the cap, with no warning
  shoulder), lists the largest tables, prunes rate-limit logs past a retention
  window, and shows the slowest statements. Exits non-zero past 80% so it can
  gate a cron or CI job. `--no-prune` (or `--dry-run`) reports without changing
  anything, and because the sweep deletes by default, a malformed or unknown
  flag stops the run rather than being ignored.

### Changed

- Replaced five indexes on `transactions` with one that matches how the table is
  actually read. Four were keyed on who entered a row, while every read is
  scoped by which profile it belongs to, so no read could use them; the fifth
  became redundant. Reclaims roughly 41 MB per million rows and removes that
  much write work from every insert and update.

### Fixed

- **Opening the transactions list no longer gets slower as a workspace fills
  up.** The list was fetching every transaction the workspace owned, attaching
  each one's category, profile and author, and only then sorting and keeping the
  first fifty. The work grew with the workspace rather than with the page, which
  nobody would notice at a few hundred rows and everybody would notice at a few
  tens of thousands. It now picks the fifty rows first and looks up their
  details afterwards, reading one date-ordered index per profile and stopping as
  soon as the page is full. Measured on a workspace of a million transactions,
  a page went from roughly 6,050,000 block reads to a few hundred — and, more to
  the point, that number no longer moves as the workspace grows.
- **A row can no longer appear twice, or go missing, while scrolling the
  list.** Transactions added together in one go share a timestamp to the
  microsecond, and rows tied on time had no defined order between them, so the
  boundary between two pages could land differently for each page. Ordering now
  falls through to the transaction's id, which is unique.
- **The tracker feed's "All profiles" view reads the same way.** It was still
  reading every transaction in the workspace and sorting the lot to show the
  newest forty; it now reads one date-ordered index per profile and stops once
  the page is full.
- **Scrolling back through the feed no longer gets slower the further back you
  go.** Each step was re-reading the history above it and discarding it; it now
  jumps straight to where the last page ended. On a profile with 300,000
  transactions, a page 150,000 rows deep went from about 50,000 block reads to
  43.
- **Transactions imported together no longer disappear from the tracker feed.**
  A batch is written in one go, so every row in it carries the same timestamp
  down to the microsecond — but the marker the feed uses to ask for the next
  page could only carry milliseconds. Anything sharing a timestamp with the last
  row on a page was quietly stepped over: import a hundred transactions dated
  the same day and the feed showed the first forty, then jumped past the rest.
  They were still in the table and the totals; they just could not be scrolled
  to. Timestamps are now recorded at the precision the marker can carry. One
  side effect, once: transactions created before this release can report a
  creation time up to a millisecond later than they used to.
- Sorting the transactions table by Date, then clicking to reverse it, no longer
  falls back to the slow path — that click produces the list's own default
  order, so it now costs what the default costs.

## [0.5.3] — 2026-08-19

### Changed

- **The single-field composer is one box with two zones**: a currency chip for
  the amount (₹, or whatever the workspace uses) and the title beside it. The
  chip is there as soon as you click into the field, so the amount goes straight
  into it instead of being parsed back out of a sentence. Space — or Enter —
  hands over from the chip to the title, so "100 fruits" is still typed in one
  burst; Backspace at the start of the title steps back into the chip. Pasting
  "100 fruits" still splits itself across the two; a paste that isn't an amount
  followed by a title ("coffee 250") lands in the title whole, for you to move
  the number yourself, rather than having one guessed out of it.
  **The trade-off:** because a space in the amount now means "go to the title",
  it can't also be a grouping separator — if you write amounts as "1 000", type
  "1000" instead. Pasting "1 000 rent" is unaffected in locales that group with
  a space, and elsewhere it goes to the title rather than being read as 1.
- **The parse hint under that field is gone**, and the composer is a line
  shorter for it. "Amount ₹0 — add a title" described a guess the field was
  making; there's nothing to guess now. The over-limit warning stays.
- **The composer card is more compact in both modes** — 16px shorter, with the
  dead space under the fields gone. Its padding and row gaps came in a notch,
  the AI note box and its mic/send buttons are a little smaller, the AI hint
  line is `text-xs`, and the manual fields now hang from the card's bottom edge
  at every density (not just compact), so what the two modes differ by sits in
  the middle of the card instead of as a gap under the last field.
- **The AI note box grows with the note**, a line at a time up to about twelve,
  then it scrolls. A note covering a day's spending used to disappear upward two
  lines at a time while you were still writing it. Wrapped text counts, not just
  typed newlines.
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
  Picking a category, profile, date or emoji in the add/edit transaction dialog
  dismissed the dialog along with the picker, so the form you had just opened
  vanished under you; the click now closes only the dropdown. A dialog holding
  a dropped receipt also counts as unsaved work now, and stays put.
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
[0.5.6]: https://github.com/playxoft/SpendChat_Nextjs
[0.5.5]: https://github.com/playxoft/SpendChat_Nextjs
[0.5.4]: https://github.com/playxoft/SpendChat_Nextjs
[0.5.3]: https://github.com/playxoft/SpendChat_Nextjs
[0.5.1]: https://github.com/playxoft/SpendChat_Nextjs
[0.5.0]: https://github.com/playxoft/SpendChat_Nextjs
[0.4.1]: https://github.com/playxoft/SpendChat_Nextjs
[0.4.0]: https://github.com/playxoft/SpendChat_Nextjs
[0.3.0]: https://github.com/playxoft/SpendChat_Nextjs
[0.2.1]: https://github.com/playxoft/SpendChat_Nextjs
[0.2.0]: https://github.com/playxoft/SpendChat_Nextjs
[0.1.0]: https://github.com/playxoft/SpendChat_Nextjs
