# Building with SpendChat

SpendChat is a chat-style money tracker: you add income and expenses by talking
to a feed rather than filling in a ledger. The system is **shadcn/ui on Tailwind
v4**, deliberately minimal and neutral — no gradients, no decorative colour.

## Wrap the tree

Wrap your screen in **`DesignPreviewProvider`**. It nests every context this
library needs, in the right order — components throw, crash or render unstyled
without them:

```jsx
const { DesignPreviewProvider, Button } = window.SpendChat;

<DesignPreviewProvider>
  {/* your screen */}
</DesignPreviewProvider>
```

It takes an optional `pathname` (default `"/app"`); the nav components read it
to mark the active item. What it supplies:

- **`ThemeProvider`** (next-themes) sets the `.dark` class on the root element.
  Every colour token switches off that class, so without it dark mode does
  nothing. It runs in `system` mode, matching the app.
- **`TooltipProvider`** is required by the bare `Tooltip` root. `TransactionBubble`,
  `ControlHint` and every icon-button hint use `Tooltip` internally and will
  throw outside it.
- **`PendingMessagesProvider`** is required by `TransactionComposer`, which owns
  the optimistic chat rows.
- **Next's app-router contexts.** This is the one that bites. `AppSidebar`,
  `AppTopbar`, `BottomNav`, `SettingsNav` and `ProfileSwitcher` all call
  `usePathname()` / `useSearchParams()` / `useRouter()`, which return `null`
  outside a Next render — and the components call `.get()` on the result. A
  screen using any of them without this provider dies on "Cannot read
  properties of null" and renders blank. Nothing else supplies these.

`ThemeProvider`, `TooltipProvider` and `PendingMessagesProvider` are exported
individually if you want to compose them yourself, but there is no separate
export for the router contexts — anything with navigation in it needs
`DesignPreviewProvider`.

**`Toaster`** is not part of it: render it once near the root of your screen,
then call `toast.success("Transaction saved")` from `sonner`.

## Styling idiom: Tailwind utility classes

Style with **Tailwind v4 utility classes on `className`**. Components accept
`className` and merge it (via `tailwind-merge`), so your classes win over
defaults. There are no style props and no theme objects.

Use the **semantic** colour utilities, never raw palette colours like
`bg-gray-100` — the semantic ones are what flip in dark mode:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent` |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground`, `text-primary-foreground` |
| Emphasis | `bg-primary`, `bg-secondary`, `bg-destructive`, `text-destructive` |
| Lines | `border-border`, `border-input`, `ring-ring` |
| Radius | `rounded-md`, `rounded-lg`, `rounded-xl` (scale derives from `--radius`) |
| Type | `font-heading`, `font-mono`, `tabular-nums` (Geist sans is the inherited default — no class needed) |
| Motion | `animate-rise` (the feed's entrance) |

Every token also exists as a CSS variable for the rare case a utility doesn't
fit: `var(--background)`, `var(--foreground)`, `var(--primary)`,
`var(--secondary)`, `var(--muted)`, `var(--accent)`, `var(--destructive)`,
`var(--border)`, `var(--input)`, `var(--ring)`, `var(--card)`, `var(--popover)`,
each with a `-foreground` partner where it applies, plus `var(--radius)`.

**Two colour rules specific to this product:**

- **Money direction.** Income uses a single emerald accent —
  `text-emerald-600 dark:text-emerald-400` — and carries a leading `+`. Expenses
  are neutral `text-foreground` with **no** sign; the neutral colour already
  reads as money out. Never colour expenses red as a matter of course.
  Always pair amounts with `tabular-nums`.
- **The one gradient.** A blue→violet gradient marks "this calls a model" — the
  composer's Manual/AI toggle and AI mode's primary actions, and nothing else.
  Don't extend it to other surfaces and don't introduce a second gradient.

## Where the truth lives

- **`_ds/<folder>/styles.css`** and its `@import` closure — the real compiled
  stylesheet, including the `:root` token block, the `.dark` overrides and the
  bundled Geist `@font-face` rules. Read it before inventing a colour.
- **`components/<group>/<Name>/<Name>.prompt.md`** — per-component usage, with
  the props table and example JSX.
- **`components/<group>/<Name>/<Name>.d.ts`** — the typed contract.

Groups: **primitives** (29 shadcn controls), **app** (25 tracker surfaces),
**attachments**, **files**, **brand**, **marketing**, **icons**.

## Composing a screen

Compound components are separate exports, assembled by hand — `Card` +
`CardHeader` + `CardTitle`, `Select` + `SelectTrigger` + `SelectContent` +
`SelectItem`, `Table` + `TableHeader` + `TableRow` + `TableCell`. Use library
components for the controls and your own Tailwind classes for layout glue:

```jsx
const {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  TransactionBubble, DayDivider, Button,
} = window.SpendChat;

<Card className="max-w-md">
  <CardHeader>
    <CardTitle>October</CardTitle>
    <CardDescription>Personal · ₹ (en-IN)</CardDescription>
  </CardHeader>
  <CardContent className="flex flex-col gap-3">
    <DayDivider label="Today" />
    <TransactionBubble
      type="income"
      amountLabel="+₹85,000.00"
      title="October salary"
      categoryName="Salary"
      categoryIcon="💰"
      timeLabel="09:12"
    />
    <TransactionBubble
      type="expense"
      amountLabel="₹1,240.00"
      title="Weekly groceries"
      categoryName="Groceries"
      categoryIcon="🛒"
      timeLabel="18:34"
    />
    <Button variant="outline" size="sm" className="self-end">
      View all
    </Button>
  </CardContent>
</Card>
```

## Product conventions worth honouring

- **Amounts are pre-formatted strings.** Components take `amountLabel="₹1,240.00"`,
  not a number — the app stores integer minor units and formats once, per
  workspace. Pass a formatted string.
- **One currency and locale per workspace**, not per transaction. Don't build a
  per-row currency picker.
- **Categories are emoji + name** (`🛒 Groceries`). Keep the emoji.
- **Anything that talks to a server is stubbed in this bundle.** Saving a
  transaction, renaming a category, signing out, generating a PDF thumbnail —
  each throws a descriptive error naming itself. Wire your own handlers; the
  components are presentation-complete.
