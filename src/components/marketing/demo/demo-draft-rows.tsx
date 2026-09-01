"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RowTypeToggle } from "@/components/app/ai-accent";
import { DemoDateChip } from "./demo-controls";
import {
  demoCategories,
  demoCategory,
  type DemoTxn,
  type DemoTxnType,
} from "./demo-data";
import { useDemoMoney, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { toMinorUnits } from "@/lib/money";
import { parseAmountInput, stripNonAmountChars } from "@/lib/parse-amount";

/** One reviewable draft, edited as strings — the shape the app's review step uses. */
export type DemoDraft = {
  key: number;
  type: DemoTxnType;
  amount: string;
  title: string;
  categoryName: string;
};

/**
 * Is this amount saveable — readable *and* worth more than nothing?
 *
 * Two questions, and the demos need both answered against the visitor's own
 * money, which is why this takes the whole format rather than a locale.
 *
 * **Readable** is the locale half. The demos build these strings with
 * `demoAmountInput` and the visitor edits them by hand, both in whatever format
 * their browser reports. Validating against a fixed "en-US" fails both ways — a
 * comma-decimal reader's "12,50" is rejected and every row goes `aria-invalid`,
 * while a string only en-US can read passes here and then throws inside
 * `toMinorUnits` on save.
 *
 * **Worth something** is the currency half, and it has to be asked of the
 * *converted* value. A positive major amount is not a positive transaction: on
 * a 0-decimal currency "0.4" is a perfectly readable number that
 * `Math.round(0.4 * 10 ** 0)` turns into 0, so the row passed validation and
 * then wrote a `0 kr.` transaction into the feed — the very outcome
 * `demoAmount`'s floor exists to prevent on the seeded side. Rounding here
 * exactly the way `toMinorUnits` rounds on save is what stops the two
 * disagreeing about what "positive" means; a 3-decimal currency needs the same
 * arithmetic in the other direction, where 0.001 is a whole minor unit and not
 * a rounding error.
 */
export function isValidAmount(amount: string, money: DemoMoneyFormat): boolean {
  const value = parseAmountInput(amount, money.locale);
  if (value === null) return false;
  return Math.round(value * 10 ** money.currency.decimals) > 0;
}

/** A title is saveable once something other than whitespace is in it. */
export function isValidTitle(title: string): boolean {
  return title.trim().length > 0;
}

/**
 * A draft is saveable once both of its fields are — the whole-draft predicate
 * the commit path filters on.
 *
 * Deliberately *not* what an input asks about itself. A field wired to this
 * announces the wrong thing: clearing the **Title** used to turn the **Amount**
 * red and read out as an invalid amount, beside a title that reported fine.
 * Each input asks its own question (`isValidAmount` / `isValidTitle`); only the
 * commit path asks this one.
 */
export function isValidDraft(draft: DemoDraft, money: DemoMoneyFormat): boolean {
  return isValidAmount(draft.amount, money) && isValidTitle(draft.title);
}

/** What the demo feed's `addMany` takes: a transaction minus the bits it mints. */
export type DemoDraftTxn = Omit<DemoTxn, "id" | "timeLabel">;

/**
 * Turn reviewed drafts into feed transactions — the **one** place a demo amount
 * becomes minor units.
 *
 * Four surfaces commit drafts (the AI demo, the voice demo, the bulk demo and
 * the homepage's entry-methods widget) and each used to carry its own copy of
 * this mapping. They had already drifted apart — one trimmed the title and the
 * others didn't, one wrote `?? "Other"` where the rest wrote `|| "Other"` — and
 * the half that keeps needing repair is the money-sensitive half: the format
 * argument on `isValidDraft` (the locale that reads the string, the decimals
 * that decide whether it's worth anything) and the
 * `String()`-vs-`formatAmountInput` round trip were both edits to *this* logic,
 * made one file at a time. One function means the next such fix lands on all
 * four at once.
 *
 * **Unsaveable drafts are dropped here, not by the caller.** `toMinorUnits`
 * *throws* on an amount the visitor's locale can't read, and every caller runs
 * it either from a click handler or from inside a script timer — where React
 * never sees the error and the beat simply doesn't land, leaving an empty feed
 * and an uncaught throw on every replay. Filtering first is what makes the
 * mapping total. It also lets a caller count the button off the same array it
 * commits ("Add 3"), so the number and the outcome agree by construction rather
 * than by two call sites remembering to run the same filter.
 *
 * The two drifts, reconciled deliberately:
 *
 * - **The title is trimmed.** `isValidDraft` already judges a draft by its
 *   *trimmed* title, so committing the untrimmed one would save padding that
 *   validation had already decided didn't count — and a title of `"  "` would
 *   have been rejected anyway.
 * - **`categoryName` falls back on falsiness (`||`), not just nullishness.**
 *   `""` is how "no category" is spelled throughout these demos: `patchDraft`
 *   clears the field to `""` when a row's type flips, and the picker's "No
 *   category" option writes `""` too. `?? "Other"` lets that empty string
 *   through and lands a transaction with a blank category chip. The *icon* is
 *   still resolved from the draft's own name rather than from the `"Other"`
 *   fallback, because `demoCategory` matches on name alone and the default set
 *   has an "Other" in both kinds — an income row would be handed the expense
 *   pack's 📦. `💸` stays the neutral stand-in for a row nobody categorised.
 */
export function draftsToTxns(
  drafts: DemoDraft[],
  money: DemoMoneyFormat,
): DemoDraftTxn[] {
  return drafts
    .filter((draft) => isValidDraft(draft, money))
    .map((draft) => ({
      type: draft.type,
      amountMinor: toMinorUnits(draft.amount, money.code, money.locale),
      title: draft.title.trim(),
      categoryName: draft.categoryName || "Other",
      categoryIcon: demoCategory(draft.categoryName)?.icon ?? "💸",
    }));
}

/**
 * Apply a change to one draft, clearing its category when the type flips —
 * an expense category can't apply to income, which is how the app behaves too.
 */
export function patchDraft(
  rows: DemoDraft[],
  key: number,
  changes: Partial<DemoDraft>,
): DemoDraft[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...changes };
    if (changes.type && changes.type !== row.type) next.categoryName = "";
    return next;
  });
}

/**
 * The AI review step's editable rows.
 *
 * Shared by the AI demo and the voice demo, because they converge on the same
 * screen: voice produces a transcript, the transcript is parsed, and what comes
 * back is reviewed here. Writing the grid twice would guarantee the two pages
 * eventually disagreed about what reviewing a draft looks like.
 *
 * `visible` drives the staggered reveal — rows past it are held back so they
 * can appear one at a time without the list re-mounting.
 */
export function DemoDraftRows({
  rows,
  visible,
  onPatch,
  onRemove,
}: {
  rows: DemoDraft[];
  /** How many rows to show. Pass `rows.length` for all of them. */
  visible: number;
  onPatch: (key: number, changes: Partial<DemoDraft>) => void;
  onRemove: (key: number) => void;
}) {
  const money = useDemoMoney();

  return (
    <div className="scrollbar-slim min-h-0 flex-1 overflow-auto">
      {/* One shared grid template across every row, so columns line up instead
          of shifting row to row — the app uses the same approach. */}
      <div className="min-w-[34rem] space-y-2 pr-1">
        {rows.slice(0, visible).map((row) => (
          <div
            key={row.key}
            className="grid animate-rise grid-cols-[auto_5.5rem_minmax(6rem,1fr)_8.5rem_7rem_auto] items-center gap-x-2 rounded-lg border bg-muted/30 p-2"
          >
            <RowTypeToggle
              value={row.type}
              onChange={(type) => onPatch(row.key, { type })}
            />
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                {money.currency.symbol}
              </span>
              <Input
                inputMode="decimal"
                value={row.amount}
                onChange={(e) =>
                  onPatch(row.key, { amount: stripNonAmountChars(e.target.value, money.locale) })
                }
                aria-label="Amount"
                // Each field answers for itself. Wired to the whole-draft
                // predicate, this went red when the *title* was cleared — the
                // amount was announced invalid while the title, the thing
                // actually missing, announced fine.
                aria-invalid={!isValidAmount(row.amount, money) || undefined}
                className="h-8 w-full pl-6 tabular-nums"
              />
            </div>
            <Input
              value={row.title}
              onChange={(e) => onPatch(row.key, { title: e.target.value })}
              aria-label="Title"
              aria-invalid={!isValidTitle(row.title) || undefined}
              className="h-8 w-full"
            />
            <Select
              value={row.categoryName || "none"}
              onValueChange={(v) =>
                onPatch(row.key, { categoryName: v === "none" ? "" : v })
              }
            >
              <SelectTrigger className="h-8 w-full" aria-label="Category">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {demoCategories(row.type).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DemoDateChip className="w-full" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove transaction"
              onClick={() => onRemove(row.key)}
              className="shrink-0"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
