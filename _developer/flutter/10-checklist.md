# 10 · Development Checklist (page by page)

Phased, checkable build plan. Do phases in order; within a phase, the boxes are
roughly ordered too. After each phase: `flutter analyze` + a device smoke test.
Cross-references point at the spec docs.

---

## Phase 0 — Project & foundation

- [ ] Create the Flutter project; add packages ([00](./00-getting-started.md) §1).
- [ ] Set up folder structure ([00](./00-getting-started.md) §2).
- [ ] `env.dart` reads `API_BASE_URL` from `--dart-define` ([00](./00-getting-started.md) §3).
- [ ] Android cleartext + iOS ATS dev exceptions; production HTTPS only.
- [ ] `flutterfire configure` for the shared Firebase project ([00](./00-getting-started.md) §4).
- [ ] `Firebase.initializeApp` in `main()`; `ProviderScope` root.

## Phase 1 — Design system ([02](./02-design-system.md))

- [ ] `app_colors.dart` — all light + dark tokens + semantic accents (exact hex).
- [ ] `app_radius.dart` — 10 base; 14 (xl) cards; 18 (2xl) bubbles/pills.
- [ ] `app_text.dart` — Geist styles; a **tabular-nums** helper for money.
- [ ] `app_theme.dart` — light + dark `ThemeData`/`ColorScheme` from tokens.
- [ ] Shared widgets: buttons (variants/sizes), input, select, card, dialog,
      sheet, badge, switch, segmented control, skeleton, toast, emoji picker.
- [ ] Reduced-motion handling; no theme-switch flash.

## Phase 2 — Data layer ([01](./01-api-reference.md) + [openapi.yaml](./openapi.yaml))

- [ ] `api_client.dart` (dio): base URL, bearer interceptor, `X-Workspace-Id`
      interceptor, **envelope unwrap** (`data`/`meta`), **error mapping** to
      `ApiException(status, code, message, details)`, **401 → force-refresh +
      retry once**.
- [ ] `money.dart` — `toMinorUnits`, `fromMinorUnits`, `formatMoney(minor, code,
      locale, {signed})`, `signedMinor`, `minorToInputString` (mirror
      `src/lib/money.ts`; U+2212 minus). ([11](./11-additional-details.md) § Money)
- [ ] `currencies.dart` — the 59-currency table ([08](./08-settings.md) §2).
- [ ] `dates.dart` — day-divider labels + UTC date formatting
      ([11](./11-additional-details.md) § Dates).
- [ ] Models: `Transaction`, `Category`, `Profile`, `Settings`, `CurrencyMeta`,
      `Summary`, `CategoryBreakdownItem`, `MonthlyPoint`, `WorkspaceSummary`,
      `User`, `Me`.
- [ ] Repositories: transactions, categories, profiles, settings, analytics,
      workspaces — one method per endpoint; return unwrapped models + `meta`.

## Phase 3 — Auth ([09](./09-auth.md))

- [ ] `auth_repository.dart` — email/password sign-in/up, native Google,
      verify-email, password reset, sign-out; `emailVerified` gating.
- [ ] Screen: **Sign in** — Google + email/password, forgot-password link, errors.
- [ ] Screen: **Sign up** — name/email/password (min 8), verification email.
- [ ] Screen: **Verify email** — continue / resend / advance on verify.
- [ ] Screen: **Forgot password** — privacy-preserving success.
- [ ] Firebase error → friendly message map ([09](./09-auth.md) §3).
- [ ] Splash/loader until first auth state resolves.

## Phase 4 — Shell & navigation ([03](./03-navigation-shell.md))

- [ ] `go_router` with auth redirect bound to the Firebase auth stream
      (unauth → `/sign-in`; unverified → `/verify-email`; auth on auth route →
      `/app`).
- [ ] Bottom nav: Tracker / Transactions / Analytics / Settings (icons, active
      states).
- [ ] App bar: logo, profiles-drawer trigger, bulk-add, theme toggle, user menu.
- [ ] Profiles drawer (left sheet): workspace switcher + profile list.
- [ ] `currentProfileProvider` (id | `all`) + `currentWorkspaceProvider` (from
      `/me`, persisted). Wire `profile` param + `X-Workspace-Id`.
- [ ] User menu: email label, Settings, Sign out.

## Phase 5 — Tracker (hero) ([04](./04-tracker-chat.md))

- [ ] Screen scaffold: sticky header + feed + composer + swipe layer.
- [ ] Month **summary/balance bar** (emerald income, muted expense, rose neg
      balance).
- [ ] **Chat bubble**: income-left/expense-right, avatar, squared corner, heading
      fallback chain, amount tone (income emerald `+`, expense neutral no-sign),
      description, meta row, rise animation, tap → detail.
- [ ] **Day grouping** + dividers (Today/Yesterday/date).
- [ ] Empty state.
- [ ] **Composer**: type toggle (clears category), date picker (max today),
      category chip row + "More" grid + `/` picker, profile picker (all-profiles),
      the **three input modes**, combined parser + live preview, description
      toggle, send button.
- [ ] Submit validation (amount>0, title, date, profile) + toasts.
- [ ] **Optimistic send**: append pending bubble, clear+refocus composer, POST,
      reconcile (sending coin / sent / failed + retry), scroll to bottom.
- [ ] **Detail dialog** (view, signed amount, Edit, Delete).
- [ ] **Add/Edit form** (shared dialog).
- [ ] **Bulk add** (paste parse + review; ideally the inline table).
- [ ] Chat skeleton; pull-to-refresh.

## Phase 6 — Transactions ([05](./05-transactions.md))

- [ ] List/table: date, category, title, description, **signed** amount (income
      emerald `+`, expense neutral `−`), row tap → detail.
- [ ] Header: title + Add / Bulk / CSV; results line "{n} records · Net {…}".
- [ ] Filter bar: from/to, type, category, search (debounced), clear.
- [ ] Pagination (page size 50; `meta.total`) — prev/next or infinite scroll.
- [ ] CSV export → fetch + share the file.
- [ ] Empty / loading / error states.

## Phase 7 — Analytics ([06](./06-analytics.md))

- [ ] Range presets (This month default / 3 / 6 / 12 / All time) + custom
      from/to.
- [ ] Summary cards: Income (emerald), Expenses (neutral), Net (emerald if ≥0
      else neutral).
- [ ] Category **pie** (donut, the exact 10-colour palette, legend with amount +
      %), empty state.
- [ ] **Monthly trend** (6 months, dual bars, income emerald / expense
      `foreground/60`).
- [ ] Skeleton; pull-to-refresh.

## Phase 8 — Profiles & Categories ([07](./07-profiles-and-categories.md))

- [ ] Profile switcher (dropdown + "All profiles") wired to scope.
- [ ] Profile swipe gesture (wrap through "All profiles"; correct thresholds;
      ignore inputs).
- [ ] Manage profiles: list, add/edit (emoji + name), reorder (drag → reorder
      API), delete-with-move (+ last-profile guard, 409 messages).
- [ ] Category manager: Expense/Income groups, add/edit (emoji + name), inline
      icon change, delete (sets txns uncategorized).
- [ ] Emoji picker component.
- [ ] Role gating (viewers read-only).

## Phase 9 — Settings ([08](./08-settings.md))

- [ ] Settings nav (Account, Workspace, Theme, Input, Categories, Shortcuts);
      lands on Account.
- [ ] Account: currency combobox (59) + locale select; dirty-state save/cancel.
- [ ] Theme: Light/Dark/System, applies instantly + PATCH.
- [ ] Input: 3-option layout picker; dirty-state save.
- [ ] Danger zone: delete-all-transactions (type DELETE). Account delete: defer or
      implement per availability.
- [ ] Workspace: read/switch-only picker + role display (defer admin flows).
- [ ] Shortcuts: omit or read-only "web" note.

## Phase 10 — Polish ([11](./11-additional-details.md))

- [ ] Every screen: loading (skeleton), empty, and error (retry) states.
- [ ] Pull-to-refresh everywhere; pagination/infinite scroll where relevant.
- [ ] Toast catalogue wired (success + `error.message`).
- [ ] Haptics on send/delete/type-toggle; keyboard "done/next" actions.
- [ ] Offline / no-network handling; 401 refresh; 403 role handling; 409 conflict
      messages surfaced.
- [ ] Accessibility: labels, contrast, dynamic text, reduced motion.
- [ ] Dark-mode QA on every screen.
- [ ] Number/date formatting matches the user's currency + locale.
- [ ] App icons, splash, store metadata.

---

## Definition of done per screen

A screen is "done" when it: loads real data via the repository, shows correct
loading/empty/error states, matches the [02](./02-design-system.md) tokens in
both themes, handles the relevant role gating, formats money/dates correctly, and
survives a token refresh (401) and a lost-network case without crashing.
