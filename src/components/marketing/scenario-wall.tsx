import {
  Building2,
  ChartColumn,
  Download,
  Keyboard,
  ListPlus,
  MessageSquare,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Table2,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { balanceColumns } from "@/lib/bento-rhythm";
import { SCENARIOS, type Scenario } from "@/lib/scenarios";

/**
 * Resolves the icon names in `src/lib/scenarios.ts`. Same split as
 * `feature-icon.tsx`: the data module names icons as strings so it stays free
 * of any React or `lucide-react` import, and this file is the one place that
 * pays for them.
 */
const ICONS: Record<string, LucideIcon> = {
  Building2,
  ChartColumn,
  Download,
  Keyboard,
  ListPlus,
  MessageSquare,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Table2,
  Tags,
  Users,
};

/**
 * The mark beside each situation.
 *
 * A glyph, not a face. Putting a photograph of a person here would turn a
 * scenario into an endorsement nobody gave — see the note at the top of
 * `src/lib/scenarios.ts` — and it would cost a network request per card for
 * the privilege. An icon renders from the bundle already on the page, works in
 * both themes without a second asset, and reads immediately as illustrative.
 */
function ScenarioMark({ name }: { name: string }) {
  const Icon = ICONS[name] ?? MessageSquare;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/**
 * One situation. Card-shaped — mark, heading line, prose — which is a familiar
 * enough shape to scan quickly, while the heading being the *situation* rather
 * than a person's name is what keeps it from reading as a quote.
 */
function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    // `grow` on *every* card, not just the last one. Both end the column flush,
    // but giving all the slack to the final card left it with a ~150px hole
    // under its text — the same empty-space fault the bento was fixed for.
    // Spread across five or six cards it's ~25px each, which reads as padding.
    // `basis-auto` is what keeps the cards different heights while they grow:
    // each still starts from its own content height, and only the leftover is
    // divided up.
    <figure
      className="grow basis-auto rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/20 sm:p-6"
    >
      {/* `figcaption` is a direct child of the `figure`, not wrapped in the
          flex row: the content model requires it, and the accessible name of a
          figure comes from a figcaption *child* — nested one level down, all
          sixteen figures are exposed unnamed. The row is inside the caption
          instead, which costs nothing.

          No `truncate` on the label: at sm the card is ~296px, which leaves the
          label ~208px, and "The receipt, eighteen months later" clipped to an
          ellipsis — while the same string rendered in full in the spotlight on
          the feature page. A situation that can't be read isn't one. */}
      <figcaption className="flex items-center gap-3">
        <ScenarioMark name={scenario.icon} />
        <span className="min-w-0">
          <span className="block text-pretty font-medium leading-tight">
            {scenario.label}
          </span>
          <span className="block text-xs text-muted-foreground">{scenario.place}</span>
        </span>
      </figcaption>
      <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
        {scenario.body}
      </p>
    </figure>
  );
}

/**
 * The home page's "Who it's for" wall — three columns that end level.
 *
 * Three layouts were tried, and the constraints are worth writing down because
 * they rule out the two obvious ones:
 *
 * - **A grid, one card per cell.** Every card in a row stretches to match its
 *   tallest sibling, which is the blocky look this section exists to avoid.
 * - **CSS multi-column.** Keeps natural card heights and needs no JavaScript,
 *   but balances by content: the three columns end at three different heights
 *   and the bottom edge comes out ragged.
 *
 * So the distribution is owned instead. `balanceColumns` cuts the sixteen
 * entries into three **contiguous** runs of near-equal estimated height, each
 * column is a flex stack, and the last card in each is allowed to grow. The
 * columns therefore finish on exactly the same line while every card keeps a
 * height set by its own content. Still a server component, still no JavaScript.
 *
 * Contiguous, not longest-first and not round-robin: below `sm` the three
 * columns stack, and a reader then meets the cards in column order. Only
 * contiguous runs concatenate back into the sequence the entries were written
 * in. The reasoning is in `bento-rhythm.ts`, where the packing lives.
 *
 * Weighting by text length is crude but monotonic and available at build time;
 * measuring properly would mean a client component and a layout pass on every
 * resize, for a wall of prose that never changes.
 */
export function ScenarioWall() {
  // 34 is roughly the fixed chrome of a card (mark, label, place, padding)
  // expressed in the same units as the body text, so a short entry isn't
  // weighted as though it were nearly free.
  const columns = balanceColumns(SCENARIOS, 3, (s) => s.body.length + 34);
  return (
    <section id="who-its-for" className="scroll-mt-20 border-t bg-muted/30">
      {/* Tall enough to be its own screen, but `min-h` rather than `h`: the
          wall is sixteen cards and must be free to run past the viewport on a
          narrow window instead of clipping. */}
      <div className="mx-auto flex min-h-svh max-w-6xl flex-col justify-center px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Who it&apos;s for
          </h2>
          {/* This line is not decoration. It is what makes the wall honest:
              these are situations the product is built for, not customers
              saying nice things, and a reader should be able to tell which
              they're looking at without inferring it. */}
          <p className="mt-4 text-pretty text-muted-foreground">
            Sixteen situations SpendChat was built for. Not customer quotes —
            we&apos;d rather show you the problems than invent people to describe
            them.
          </p>
        </div>

        {/* `items-stretch` is what makes the bottom edge straight: the row's
            height is set by the tallest column, and every column stretches to
            it. Within a column, only the last card grows into the slack. */}
        <div className="mt-12 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {columns.map((column, i) => (
            <div
              key={i}
              // On the two-column layout the third column would be left on a
              // row of its own, so the columns collapse to a single flow below
              // `lg` and the cards simply stack.
              className={`flex flex-col gap-4 ${i === 2 ? "sm:col-span-2 lg:col-span-1" : ""}`}
            >
              {column.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The spotlight block at the foot of a feature page.
 *
 * Wider and heavier than the wall's cards because there are only one to three
 * of them and they sit at the end of a long page — at that point a reader is
 * deciding whether the feature applies to *them*, and a bigger block with more
 * room to be specific answers that better than another row of small tiles. It
 * renders nothing when a feature has no entries, so pages can fill in one at a
 * time.
 */
export function ScenarioSpotlight({ items }: { items: Scenario[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Where this earns its keep
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Situations this feature is for — illustrative, not customer quotes.
      </p>
      <div
        className={`mt-6 grid gap-4 ${items.length > 1 ? "md:grid-cols-2" : ""}`}
      >
        {items.map((scenario) => (
          <figure
            key={scenario.id}
            className="rounded-2xl border bg-card p-6 sm:p-7"
          >
            {/* Same shape as the wall's card — figcaption directly under the
                figure, so the figure has an accessible name. */}
            <figcaption className="flex items-center gap-3">
              <ScenarioMark name={scenario.icon} />
              <span className="min-w-0">
                <span className="block text-pretty font-medium leading-tight">
                  {scenario.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {scenario.place}
                </span>
              </span>
            </figcaption>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              {scenario.body}
            </p>
          </figure>
        ))}
      </div>
    </section>
  );
}
