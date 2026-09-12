import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { FeatureIcon } from "@/components/marketing/feature-icon";
import { featurePath, type Feature } from "@/lib/features";
import { bento, bentoRow, type BentoCell } from "@/lib/grid-fill";
import { cn } from "@/lib/utils";

/**
 * One entry in a feature directory — the `/features` hub, the homepage feature
 * index, and the "Related features" / "Mentioned above" blocks on the feature
 * and comparison pages.
 *
 * Those used to carry their own copy of this markup, near enough identical,
 * which is how the hub ended up with a `Learn more` affordance the others never
 * grew. One component, one card: every directory shows the affordance, because
 * a card that is a link to a page should say so wherever it appears.
 *
 * `cell` comes from the bento maths in `src/lib/grid-fill.ts`, and carries both
 * the card's width and where it got it. A card given two columns and left in
 * its stacked layout just looks stretched, so it turns side-on instead — icon
 * beside the text rather than above it — which is what makes the extra width
 * read as emphasis on the flagship rather than as a gap in the grid.
 */
export function FeatureCard({
  feature,
  location,
  heading: Heading = "h3",
  cell,
}: {
  feature: Feature;
  /** Goes into the click event, so each directory's links can be told apart. */
  location: string;
  /** Pick the level that keeps the page's outline in order. */
  heading?: "h3" | "h4";
  /** This card's place in the bento — its width, and where it turns side-on. */
  cell: BentoCell;
}) {
  return (
    <Link
      href={featurePath(feature.slug)}
      data-track-event="nav_link_click"
      data-track-params={JSON.stringify({ location, label: feature.slug })}
      className={cn(
        "group flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md",
        bentoRow(cell),
        cell.span,
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
        <FeatureIcon name={feature.icon} className="size-5" />
      </div>
      <div className="flex flex-1 flex-col">
        <Heading className="font-medium">{feature.label}</Heading>
        <p className="mt-1.5 text-sm text-muted-foreground">{feature.blurb}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
          Learn more
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Column counts a feature directory can be laid out in, and the grid classes
 * that go with them. Written out rather than composed, so Tailwind's scanner
 * can see them.
 *
 * `3` is the directory shape, for the `/features` hub: groups of four or five
 * in a page wide enough to carry three columns, where the first entry is the
 * flagship and the bento widens it to square the row off. `2` is for the four
 * related features at the foot of a feature or comparison page — peers, none of
 * them the flagship, laid out two by two because those pages are `max-w-4xl`
 * and a fourth column would leave each card about 200px to say its piece in.
 */
const GRID_CLASS = {
  2: "grid gap-4 sm:grid-cols-2",
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
} as const;

/**
 * A directory of feature cards that fills whole rows at every width.
 *
 * The column count and the span maths live together here on purpose: they are
 * two halves of one decision, and holding them in separate files is how a grid
 * ends up with a stranded card after someone adds a thirteenth feature.
 */
export function FeatureCardGrid({
  items,
  location,
  heading,
  columns = 3,
  className,
}: {
  items: Feature[];
  location: string;
  heading?: "h3" | "h4";
  /** Columns at `lg`; `sm` is always two. */
  columns?: keyof typeof GRID_CLASS;
  className?: string;
}) {
  if (items.length === 0) return null;

  // Capped at two columns: a feature card holds an icon, a label and one line,
  // which a full-bleed row would stretch rather than showcase.
  const cells = bento(items.length, { sm: 2, lg: columns }, 2);

  return (
    <div className={cn(GRID_CLASS[columns], className)}>
      {items.map((feature, i) => (
        <FeatureCard
          key={feature.slug}
          feature={feature}
          location={location}
          heading={heading}
          cell={cells[i]}
        />
      ))}
    </div>
  );
}
