# 02 · Design System

Match the web app exactly. It's **minimal and neutral**: a fully **achromatic**
(grayscale) palette, no gradients, generous whitespace, rounded cards, subtle
`ring` hairlines + soft shadows. The **only** accent is **emerald for income**.
Font is **Geist**. The source of truth is `src/app/globals.css` (Tailwind v4
OKLCH tokens); the hex equivalents below are exact for the grayscale tokens
(chroma 0 ⇒ R=G=B) and computed approximations for the few coloured ones.

Put every value in `core/theme/` so the whole app reads from one place.

---

## 1. Colour tokens

### Light (`:root`)

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| background | `oklch(1 0 0)` | `#FFFFFF` | app background |
| foreground | `oklch(0.145 0 0)` | `#0A0A0A` | primary text |
| card | `oklch(1 0 0)` | `#FFFFFF` | cards, sheets, bubbles |
| card-foreground | `oklch(0.145 0 0)` | `#0A0A0A` | text on cards |
| popover | `oklch(1 0 0)` | `#FFFFFF` | menus, dialogs, toasts |
| popover-foreground | `oklch(0.145 0 0)` | `#0A0A0A` | text on popovers |
| primary | `oklch(0.205 0 0)` | `#171717` | primary buttons, send button |
| primary-foreground | `oklch(0.985 0 0)` | `#FAFAFA` | text on primary |
| secondary | `oklch(0.97 0 0)` | `#F5F5F5` | subtle fills |
| secondary-foreground | `oklch(0.205 0 0)` | `#171717` | text on secondary |
| muted | `oklch(0.97 0 0)` | `#F5F5F5` | chips, hovers, avatars |
| muted-foreground | `oklch(0.556 0 0)` | `#737373` | secondary text, icons, timestamps |
| accent | `oklch(0.97 0 0)` | `#F5F5F5` | hover/focus fills in menus |
| accent-foreground | `oklch(0.205 0 0)` | `#171717` | text on accent |
| border | `oklch(0.922 0 0)` | `#E5E5E5` | borders, dividers |
| input | `oklch(0.922 0 0)` | `#E5E5E5` | input outline |
| ring | `oklch(0.708 0 0)` | `#A1A1A1` | focus ring |
| destructive | `oklch(0.577 0.245 27.325)` | ≈ `#E7000B` | delete/danger |

### Dark (`.dark`)

| Token | OKLCH | Hex / value | Use |
|---|---|---|---|
| background | `oklch(0.145 0 0)` | `#0A0A0A` | app background |
| foreground | `oklch(0.985 0 0)` | `#FAFAFA` | primary text |
| card | `oklch(0.205 0 0)` | `#171717` | cards, sheets, bubbles |
| popover | `oklch(0.205 0 0)` | `#171717` | menus, dialogs, toasts |
| primary | `oklch(0.922 0 0)` | `#E5E5E5` | primary buttons (light on dark) |
| primary-foreground | `oklch(0.205 0 0)` | `#171717` | text on primary |
| secondary / muted / accent | `oklch(0.269 0 0)` | `#262626` | chips, hovers |
| muted-foreground | `oklch(0.708 0 0)` | `#A1A1A1` | secondary text |
| border | `oklch(1 0 0 / 10%)` | white @ 10% → `Color(0x1AFFFFFF)` | borders |
| input | `oklch(1 0 0 / 15%)` | white @ 15% → `Color(0x26FFFFFF)` | input outline |
| ring | `oklch(0.556 0 0)` | `#737373` | focus ring |
| destructive | `oklch(0.704 0.191 22.216)` | ≈ `#FF6467` | danger (lighter on dark) |

> **Dark `border`/`input` are alpha whites**, not solid grays — replicate as
> white with 10% / 15% opacity so they read correctly over `card` and
> `background`.

### Semantic accents (per-component, not theme-wide)

These are Tailwind default palette utilities, not CSS tokens.

| Meaning | Light | Dark | Hex (light / dark) |
|---|---|---|---|
| **Income** amount / accent | emerald-600 | emerald-400 | `#059669` / `#34D399` |
| Income bar / indicator | emerald-500 | emerald-500 | `#10B981` |
| **Expense amount** (list/table/bubble) | **foreground** (neutral) | **foreground** | `#0A0A0A` / `#FAFAFA` |
| Expense *toggle icon* & negative *month balance* | rose-600 | rose-400 | `#E11D48` / `#FB7185` |
| Expense bar (monthly trend) | `foreground/60` | `foreground/60` | 60% foreground |
| "Sending" coin | amber-400 (ring amber-600) | same | `#FBBF24` / ring `#D97706` |

> **Read this carefully — it's the #1 thing to get right.**
> In the **transaction list, table, and chat bubble, the expense amount is
> neutral `foreground`** (no red, no minus in the bubble). Only **income is
> emerald**. Rose is used *only* for: the composer type-toggle expense *icon*, a
> **negative month balance** in the tracker header, the monthly-trend expense
> bar (actually `foreground/60`, near-neutral), and the "Not sent" error label.
> The **detail dialog** does show a signed amount (income `+`, expense `−`).

### Chart palette (pie chart)

The CSS `chart-1..5` tokens are a **grayscale** ramp (`#D4D4D4`, `#737373`,
`#525252`, `#404040`, `#262626`, same in both themes) — but the **category pie
chart component does NOT use them.** It hardcodes a multi-colour palette; see
[06-analytics.md](./06-analytics.md).

### Dart token file (author this)

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
  static const destructiveLight = Color(0xFFE7000B);

  // Dark
  static const bgDark = Color(0xFF0A0A0A);
  static const fgDark = Color(0xFFFAFAFA);
  static const cardDark = Color(0xFF171717);
  static const primaryDark = Color(0xFFE5E5E5);
  static const primaryFgDark = Color(0xFF171717);
  static const mutedDark = Color(0xFF262626);
  static const mutedFgDark = Color(0xFFA1A1A1);
  static const borderDark = Color(0x1AFFFFFF); // white 10%
  static const inputDark = Color(0x26FFFFFF);  // white 15%
  static const ringDark = Color(0xFF737373);
  static const destructiveDark = Color(0xFFFF6467);

  // Semantic accents
  static const incomeLight = Color(0xFF059669);  // emerald-600
  static const incomeDark = Color(0xFF34D399);   // emerald-400
  static const income500 = Color(0xFF10B981);    // emerald-500
  static const roseLight = Color(0xFFE11D48);    // rose-600 (toggle icon / neg balance)
  static const roseDark = Color(0xFFFB7185);     // rose-400
  static const amber = Color(0xFFFBBF24);        // sending coin
}
```

`themeColor` (status bar / browser chrome): light `#FFFFFF`, dark `#0A0A0A`.

---

## 2. Radius

Base `--radius = 0.625rem = 10px`. Derived scale (used verbatim by components):

| Name | Formula | px |
|---|---|---|
| sm | `radius * 0.6` | 6 |
| md | `radius * 0.8` | 8 |
| lg | `radius` | **10** |
| xl | `radius * 1.4` | **14** |
| 2xl | `radius * 1.8` | **18** |
| 3xl | `radius * 2.2` | 22 |
| 4xl | `radius * 2.6` | 26 |

Practical mapping:
- **Buttons, inputs, selects** → `lg` (10px).
- **Cards, dialogs** → `xl` (14px).
- **Chat bubbles, type-toggle pill, category chips** → `2xl`/pill (18px / fully
  rounded).
- **Badges** → `4xl` (26px, effectively a pill at that height).
- **Avatars, dots** → fully rounded.

---

## 3. Typography

Font is **Geist** (sans) with **Geist Mono** available. Load via `google_fonts`
(`GoogleFonts.geist` / `GoogleFonts.geistMono`) or bundle the Geist fonts in
`pubspec.yaml`.

- **`--font-sans` = Geist**; headings reuse Geist Sans (`--font-heading` maps to
  it — there is **no separate heading typeface**).
- **Numbers use Geist Sans with `tabular-nums`** (font feature `tnum`), **NOT
  Geist Mono.** Apply `fontFeatures: [FontFeature.tabularFigures()]` to every
  money/amount `TextStyle` so columns align.
- Geist **Mono** appears only for a couple of raw/technical hints (e.g. the bulk
  paste box) — reserve it for that.

Common sizes (px):

| Role | Size | Weight |
|---|---|---|
| Screen/section title | 16 (`text-base`) | 500 (medium) |
| Body / most component text | 14 (`text-sm`) | 400 |
| Bubble heading / row title | 14 | 500 |
| Amount (bubble) | 16 | 600 (semibold), tabular |
| Amount (analytics stat) | 24 (`text-2xl`) | 600, tabular |
| Meta (category, time, captions, labels) | 12 (`text-xs`) | 400 |
| Bottom-nav label | 11 | — |
| Inputs | 16 on mobile (`text-base`), 14 on wide | — |

Base: antialiased, `leading-snug`/`leading-none` on titles.

---

## 4. Radius, spacing, elevation, motion

- **Spacing:** 4px grid. Screen padding ~12–16px. Content max width ~640–768px
  (`max-w-2xl` for the tracker feed = 42rem/672px; `max-w-4xl`/`max-w-5xl` for
  analytics/transactions on wide screens — center on tablets).
- **Elevation is subtle.** Elevated surfaces use a **hairline ring** of
  `foreground @ 10%` (`ring-1 ring-foreground/10`) **plus** a soft shadow
  (`shadow-md`/`shadow-lg`), rather than a solid 1px border. Cards in the feed
  use a real `border` + `shadow-sm`. Muted footers/strips: `bg-muted/50` +
  top border. **Avoid heavy Material elevation** — keep `Card`/`Dialog`
  elevation low and lean on the hairline + a faint shadow.
- **Focus ring:** 3px ring at `ring @ 50%` plus a `ring`-coloured border. Invalid
  state: `destructive @ 20%` ring (dark `@ 40%`).
- **Destructive is tinted, never solid:** destructive buttons/badges use
  `destructive @ 10–20%` background with `destructive` text — not a solid red
  fill.
- **Overlays:** scrim `black @ 10%` + a light backdrop blur; open in ~100ms.

### Motion (keyframes)

| Name | Where | Duration | Easing | Effect |
|---|---|---|---|---|
| `rise` | chat bubbles, list items entering | 0.28s | ease-out | opacity 0→1, translateY 6px→0 |
| `coin-flip` | optimistic "sending" indicator | 1.1s | linear ∞ | rotateY 0→360° |
| `stamp` | (404/marketing) | 0.55s | back-ease | rotate(-9°) scale 2.6→1, fade in |

Respect **reduced motion** (`MediaQuery.disableAnimations`) — zero these out.
Theme switches should not flash (no cross-fade needed).

---

## 5. Component styling reference

Build these once as shared widgets; every screen reuses them.

### Buttons
Base: rounded `lg` (10px), `text-sm` (14) medium, icon `size-4` (16), press
gives a 1px downward nudge, disabled `opacity 0.5`.

| Variant | Fill | Text |
|---|---|---|
| default (primary) | `primary`, hover `primary/80` | `primary-foreground` |
| outline | `background` + `border`, hover `muted` | `foreground` |
| secondary | `secondary` | `secondary-foreground` |
| ghost | transparent, hover `muted` | `foreground` |
| destructive | `destructive/10` (dark `/20`), hover `/20` | `destructive` |
| link | none | `primary`, underline on hover |

Sizes: **default `h-8` (32) px-2.5**, sm `h-7` (28), lg `h-9` (36), icon
`size-8` (32²), icon-sm `size-7`. The tracker **Send** button is `h-9`.

### Inputs / textareas / selects
- **Input:** `h-8` (32), rounded `lg`, `border` = `input`, transparent bg (dark
  `input/30`), `px-2.5`, placeholder `muted-foreground`. Focus: `ring` border +
  3px ring. Invalid: `destructive` border + ring.
- **Textarea:** min-height 64, same border/focus; grows with content.
- **Select trigger:** like input; `h-8` default; content is a `popover` with a
  hairline ring + `shadow-md`, items `rounded-md`, focused item uses `accent`.

### Cards / dialogs / sheets
- **Card:** rounded `xl` (14), `card` bg, `ring-1 ring-foreground/10`, padding
  16 (12 for compact). Footer variant: `bg-muted/50` + top border,
  bottom-rounded.
- **Dialog:** rounded `xl`, `popover` bg, padding 16, hairline ring +
  `shadow-lg`, centered, max-width ~24rem (`sm`). Scrim `black/10` + blur. Close
  = ghost icon top-right. Footer sits in a muted, top-bordered strip.
  **Outside-click does NOT dismiss by default** (except where a screen opts in).
- **Sheet:** edge-anchored (no corner radius on the anchored edge), `popover` bg,
  `shadow-lg`, slides in ~200ms. Used for the mobile profiles drawer (left) and
  any bottom sheets you choose.

### Badges, switch, tabs, skeleton, toast
- **Badge:** pill (`h-5`, rounded `4xl`), `px-2`, `text-xs` medium. Variants
  mirror buttons (default/secondary/destructive-tinted/outline).
- **Switch:** track `h-[18px] w-[32px]` rounded-full; on = `primary`, off =
  `input`; thumb `size-4` `background`.
- **Tabs / segmented control:** track `h-8` rounded `lg` `p-[3px]` `muted`;
  active segment = `background` fill + `shadow-sm`; inactive text
  `foreground/60`. (The composer type-toggle is a **pill** variant of this — see
  [04](./04-tracker-chat.md).)
- **Skeleton:** `muted` fill, rounded `md`, pulse animation.
- **Toast (snackbar):** use **top-right**, rich colours (semantic success/info/
  warning/error), `popover` bg + `border`, radius 10px. Success copy like
  "Transaction added"; error copy uses `error.message` from the API. See
  [11](./11-additional-details.md) for the toast catalogue.
- **Kbd** (keyboard hints): web-only; **skip on mobile** (no keyboard shortcuts).

---

## 6. Building `ThemeData`

Create light and dark `ThemeData` (Material 3) from the tokens:

- `ColorScheme`: `surface` = card, `onSurface` = foreground, `background` =
  background, `primary` = primary, `onPrimary` = primary-foreground,
  `secondary`/`surfaceContainer` = muted, `outline` = border, `error` =
  destructive.
- Default text colour = foreground; secondary text = muted-foreground.
- Default the app to **system** theme; Settings overrides to light/dark/system
  (persisted server-side via `PATCH /settings { theme }`, applied instantly —
  see [08](./08-settings.md)).
- Set `visualDensity` comfortable, low `Card`/`Dialog` elevation, and a global
  `fontFeatures` helper for tabular money text.
