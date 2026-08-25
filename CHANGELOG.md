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
(currently spec **5.9.3**) and reported as `apiVersion` by the same endpoint.

## [Unreleased]

## [0.13.1] — 2026-08-23

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
  field — filling as the paste is typed. Importing closes it with the
  transactions in the feed behind.
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

## [0.9.0] — 2026-08-21

### Added

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

### Fixed

- **The category chart could render as an empty circle.** When it loaded late —
  as it now does on the home page — its mount-time animation could resolve
  against a container it hadn't measured yet and draw nothing at all. The
  animation is now optional, and off wherever the chart arrives lazily.

## [0.8.0] — 2026-08-21

### Added

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

### Changed

- The AI accent gradient now has one definition instead of two near-identical
  copies, which is what makes "there is exactly one gradient in this app"
  enforceable.

## [0.7.0] — 2026-08-21

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

### Changed

- The `keywords` meta tag is gone from every page. Google has ignored it since
  2009 and Bing reads a stuffed one as a spam signal; the terms it listed belong
  in the page copy, which is where they now live.

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
