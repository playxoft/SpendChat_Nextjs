import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two four-cell bento layouts, for blocks where four things deserve more room
 * than a row of equal tiles gives them.
 *
 * **On the reference designs these came from.** Both leaned on coloured glow
 * gradients — an orange aura behind a chart, a blue halo behind a bell. The
 * structure is what was worth taking; the glow is not ours to take. AGENTS.md
 * reserves gradients for AI affordances alone ("don't extend it to anything
 * else, and don't add a second gradient"), and a marketing page that borrows
 * the AI treatment for a privacy card teaches the reader that the gradient
 * means nothing. So these are built in the neutral palette, and the visual
 * interest comes from the layout and the mock panels instead.
 *
 * **On empty space.** Both layouts put cells of different sizes beside each
 * other, which is the whole point and also the trap: a short line of copy in a
 * tall cell reads as a mistake. Each cell therefore takes an optional `extra` —
 * a second line, or a short list of specifics — that only the larger cells are
 * given. Filling the space with something worth reading beats padding it.
 */

export type BentoItem = {
  /** The bold lead-in. Rendered with a full stop, as in the reference. */
  label: string;
  /** The sentence after it. */
  body: string;
  /**
   * Extra copy for the cells with room to spare — a second sentence, or a few
   * specifics. Omitted on the small cells, where it would crowd.
   */
  extra?: ReactNode;
  /** The mock panel. Neutral, CSS-only, no images and no network requests. */
  visual: ReactNode;
  /** When set, the cell is a link to this path and grows a "Learn more". */
  href?: string;
  /** Analytics: which block the click came from, and which entry. */
  trackLocation?: string;
  trackLabel?: string;
};

/**
 * Design A — an asymmetric 2×2: narrow/wide on the top row, wide/narrow on the
 * bottom. Each cell is a visual panel with the caption beneath it.
 *
 * The alternation is what stops it reading as a plain quartet: no two cells in
 * a column share an edge with a cell the same width, so the eye crosses the
 * block diagonally rather than scanning it as two rows of two.
 */
const LG_SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
};

/**
 * Cell widths, in columns out of six, for `count` cells.
 *
 * Four is the reference layout and is written out: `[2,4]` then `[4,2]`, so no
 * cell shares an edge with one the same width and the eye crosses the block
 * diagonally. Other counts are decomposed into rows of two and three that each
 * add to six, because a directory group is not guaranteed to hold four — the
 * `organise` group holds five today, and entries are added over time.
 */
function showcaseSpans(count: number): number[] {
  if (count === 4) return [2, 4, 4, 2];
  const spans: number[] = [];
  let left = count;
  // Rows of three (as `[2,2,2]`) and rows of two (as `[3,3]`), preferring
  // threes so a long group stays dense, with one pair of twos absorbing a
  // remainder of one.
  let threes = Math.floor(left / 3);
  const rest = left % 3;
  if (rest === 1 && threes > 0) threes -= 1;
  left -= threes * 3;
  for (let i = 0; i < threes; i++) spans.push(2, 2, 2);
  while (left >= 2) {
    spans.push(3, 3);
    left -= 2;
  }
  if (left === 1) spans.push(6);
  return spans;
}

export function BentoShowcase({
  items,
  className,
}: {
  items: BentoItem[];
  className?: string;
}) {
  const spans = showcaseSpans(items.length);
  return (
    // `auto-rows-fr`: every row the same height, not just every cell within a
    // row. Without it a row whose cells all have short copy comes out shorter
    // than the row above, and the block reads as two grids rather than one —
    // the second Understand row sat 32px under the first purely because
    // Analytics carries an extra line and Receipts & files doesn't.
    <div
      className={cn("grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-6", className)}
    >
      {items.map((item, i) => {
        const body = (
          <>
            {/* The caption takes the slack, not the panel. With `flex-1` on
                both they split it and neither lines up; giving it to the
                caption means the panels share a floor and the buttons share a
                baseline, which is what makes a row of cells look set rather
                than assembled. */}
            <div className="flex min-h-44 items-center justify-center border-b bg-muted/40 p-5">
              {item.visual}
            </div>
            {/* `mt-auto` on the action row, so the button sits in the corner of
                the *cell* rather than wherever this cell's copy happens to end.
                Cells in a row are the same height but their captions are not,
                and buttons that don't line up across a row read as sloppy. */}
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-lg font-semibold tracking-tight">{item.label}</h3>
              <p className="mt-1.5 text-pretty leading-relaxed text-muted-foreground">
                {item.body}
              </p>
              {item.extra && (
                <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.extra}
                </div>
              )}
              {item.href && (
                <div className="mt-auto flex justify-end pt-4">
                  {/* A span, not a <button>: the whole cell is already an <a>,
                      and nesting interactive elements is invalid HTML. It looks
                      like a button and is part of the one link. */}
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors group-hover:border-foreground/25 group-hover:bg-muted">
                    Learn more
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              )}
            </div>
          </>
        );
        const shell = cn(
          "flex flex-col overflow-hidden rounded-2xl border bg-card",
          LG_SPAN[spans[i] ?? 3],
        );
        // A cell that links to a page has to say so, and has to *be* a link —
        // the directory it replaced was a grid of anchors, and turning it into
        // a bento must not cost the affordance or the crawlable href.
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            data-track-event="nav_link_click"
            data-track-params={JSON.stringify({
              location: item.trackLocation ?? "feature_bento",
              label: item.trackLabel ?? item.label,
            })}
            className={cn(
              shell,
              "group transition-all hover:-translate-y-0.5 hover:shadow-md",
            )}
          >
            {body}
          </Link>
        ) : (
          <article key={item.label} className={shell}>
            {body}
          </article>
        );
      })}
    </div>
  );
}

/**
 * Design B — two mirrored columns: a tall cell above a short one on the left, a
 * short above a tall on the right. Text-led, with the panel below the copy.
 *
 * Built with flex weights rather than grid row spans so the two columns always
 * come out the same height whatever the copy does — the mirror only reads as
 * deliberate if the block is square at the bottom.
 */
export function BentoStack({
  items,
  className,
}: {
  items: BentoItem[];
  className?: string;
}) {
  const [first, second, third, fourth] = items;
  if (!first || !second || !third || !fourth) return null;
  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      <div className="flex flex-col gap-4">
        <BentoStackCell item={first} weight="tall" />
        <BentoStackCell item={second} weight="short" />
      </div>
      <div className="flex flex-col gap-4">
        <BentoStackCell item={third} weight="short" />
        <BentoStackCell item={fourth} weight="tall" />
      </div>
    </div>
  );
}

/**
 * The two cells are laid out differently on purpose, and it isn't decoration:
 * it's what keeps either from having a hole in it.
 *
 * A **tall** cell has the room for the reference's stacked treatment — copy,
 * then the mark sitting in the space below it. A **short** cell does not: the
 * same stacking there pushes the mark to the floor and leaves a visible gap
 * between it and the text, which is precisely the "empty space" failure this
 * layout is supposed to avoid. So a short cell turns side-on instead, the mark
 * beside the copy, and the cell is exactly as tall as its content needs.
 */
function BentoStackCell({
  item,
  weight,
}: {
  item: BentoItem;
  weight: "tall" | "short";
}) {
  const tall = weight === "tall";
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card p-6 sm:p-7",
        // `grow basis-auto`, never `flex-[n]`: the shorthand sets
        // `flex-basis: 0%`, which makes the cells a fixed ratio of the column
        // and ignores what is in them — the taller card's content then overruns
        // its share and `overflow-hidden` crops it, which is how the lock mark
        // on "No bank login" got sliced in half. From an auto basis each cell
        // is at least as tall as its content, and only the leftover is shared.
        // Both cells grow equally so that leftover is split rather than dumped
        // on one of them.
        "grow basis-auto",
        tall ? "flex flex-col" : "flex items-center gap-4",
      )}
    >
      {/* The mark leads in both layouts — above the title in a tall cell,
          beside it in a short one. It used to sit at the *bottom* of a tall
          cell, anchored there by `mt-auto` to soak up slack; now that both
          cells share the slack evenly there is none worth anchoring, and a card
          that opens with its icon is the more obvious read. */}
      {/* Sized to the mark, not to a share of the cell. It was `w-2/5` to stop
          a full-width mock panel crowding the copy beside it — but every visual
          this layout now carries is a small glyph, so that only reserved two
          fifths of the card and left the gap between mark and text looking like
          a mistake. If a wide panel ever lands here it should cap itself, not
          have the cell reserve space for it. */}
      {!tall && <div className="shrink-0">{item.visual}</div>}
      {tall && <div className="mb-5">{item.visual}</div>}
      <div className={tall ? "contents" : "min-w-0"}>
        <h3 className="text-xl font-semibold tracking-tight">{item.label}</h3>
        <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
          {item.body}
        </p>
        {item.extra && (
          <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {item.extra}
          </div>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Mock panels
 *
 * CSS and type only — no images, so nothing here costs a request, a byte of
 * repo weight or a second asset for dark mode. They're impressions of the real
 * interface rather than screenshots, which is deliberate: a screenshot goes
 * stale the first time a padding value changes, and nobody notices for months.
 * ------------------------------------------------------------------ */

/** A stand-in for a chat bubble in the tracker's feed. */
function Bubble({
  children,
  align = "right",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl border px-3 py-1.5 text-xs",
        align === "right"
          ? "self-end bg-foreground text-background"
          : "self-start bg-background text-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function ChatMock() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Bubble align="left">Coffee 180</Bubble>
      <Bubble>Groceries 2,400</Bubble>
      <Bubble align="left">Auto 60</Bubble>
    </div>
  );
}

export function DraftMock() {
  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
        &ldquo;lunch 320 and petrol 1100&rdquo;
      </div>
      <div className="space-y-1.5">
        {[
          ["Lunch", "Food & Dining", "320"],
          ["Petrol", "Transport", "1,100"],
        ].map(([what, cat, amt]) => (
          <div
            key={what}
            className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
          >
            <span className="font-medium">{what}</span>
            <span className="truncate text-muted-foreground">{cat}</span>
            <span className="tabular-nums">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VoiceMock() {
  // Fixed heights, not random: a server component that renders different bars
  // on every request is a hydration mismatch waiting to happen.
  const bars = [8, 15, 26, 34, 22, 40, 30, 18, 27, 12, 20, 9];
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <div className="flex h-12 items-center gap-1" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full bg-muted-foreground/40"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <div className="rounded-lg border bg-background px-3 py-1.5 text-xs text-muted-foreground">
        &ldquo;Pang-grocery, three fifty&rdquo;
      </div>
    </div>
  );
}

export function BulkMock() {
  return (
    <div className="w-full max-w-xs overflow-hidden rounded-lg border bg-background">
      {[
        ["Rent", "18,000"],
        ["Gas", "1,150"],
        ["Wifi", "799"],
        ["Chai", "40"],
      ].map(([what, amt], i) => (
        <div
          key={what}
          className={cn(
            "flex items-center justify-between px-3 py-1.5 text-xs",
            i > 0 && "border-t",
          )}
        >
          <span>{what}</span>
          <span className="tabular-nums text-muted-foreground">{amt}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * An outlined glyph, for cells where the copy leads and the mark is a marker
 * rather than an illustration.
 *
 * `lg` is for Design A's panels, which are a good deal taller than a text-led
 * cell's mark slot — the default size floats in one looking like an oversight.
 */
export function GlyphMock({
  icon: Icon,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground",
        size === "lg" ? "size-24" : "size-16",
      )}
    >
      <Icon className={size === "lg" ? "size-10" : "size-7"} />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Mock panels for the prose sections.
 *
 * The bento only reads as a bento when its cells are *full*. An outlined icon
 * centred in a 180px panel is a card with a hole in it, whatever the grid does
 * around it — which is what these replaced. Each of these is an impression of
 * the surface the copy is describing, built from the same borders, muted fills
 * and tabular numerals the app uses, so the panel carries information rather
 * than decoration.
 *
 * Still CSS and type only: no images, no requests, no second asset for dark
 * mode, and nothing that goes stale when a padding value changes.
 * ------------------------------------------------------------------ */

/** A row of small pill-shaped chips, used by several panels below. */
function Chips({ items, active }: { items: string[]; active?: number }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {items.map((c, i) => (
        <span
          key={c}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px]",
            i === active
              ? "border-transparent bg-foreground text-background"
              : "bg-background text-muted-foreground",
          )}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export function FilterMock() {
  return (
    <div className="w-full max-w-sm space-y-2">
      <Chips items={["This month", "Expense", "Groceries"]} active={2} />
      <div className="overflow-hidden rounded-lg border bg-background">
        {[
          ["Big Bazaar", "2,410"],
          ["Farm store", "860"],
          ["Corner shop", "240"],
        ].map(([what, amt], i) => (
          <div
            key={what}
            className={cn(
              "flex items-center justify-between px-3 py-1.5 text-xs",
              i > 0 && "border-t",
            )}
          >
            <span>{what}</span>
            <span className="tabular-nums text-muted-foreground">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsMock() {
  const bars = [34, 52, 28, 61, 44, 70];
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex h-20 items-end justify-center gap-2" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-5 rounded-t-md",
              i === bars.length - 1 ? "bg-foreground/70" : "bg-muted-foreground/25",
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {[
          ["Housing", "42%"],
          ["Groceries", "18%"],
        ].map(([name, pct]) => (
          <div key={name} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{name}</span>
            <span className="tabular-nums">{pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilesMock() {
  // One row, not two. A 3×2 grid of tall cards made this panel 319px against
  // the 176px every other panel sits at, which dragged the whole second row of
  // the Understand bento taller than the first. Four across keeps the panel on
  // the shared floor so the rows match.
  return (
    <div className="grid w-full max-w-xs grid-cols-4 gap-2">
      {["PDF", "JPG", "CSV", "PNG"].map((kind) => (
        <div
          key={kind}
          className="flex aspect-[3/4] flex-col items-center justify-center rounded-md border bg-background text-[10px] text-muted-foreground"
        >
          <span className="mb-1 h-1.5 w-5 rounded-full bg-muted-foreground/25" />
          {kind}
        </div>
      ))}
    </div>
  );
}

export function ProfilesMock() {
  return (
    <div className="w-full max-w-xs space-y-1.5">
      {[
        ["Personal", true],
        ["Home", false],
        ["Business", false],
      ].map(([name, on]) => (
        <div
          key={String(name)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
            on ? "border-transparent bg-foreground text-background" : "bg-background",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              on ? "bg-background" : "bg-muted-foreground/40",
            )}
          />
          {name}
        </div>
      ))}
    </div>
  );
}

export function MembersMock() {
  return (
    <div className="w-full max-w-sm space-y-1.5">
      {[
        ["AK", "Admin"],
        ["RS", "Editor"],
        ["MP", "Viewer"],
      ].map(([initials, role]) => (
        <div
          key={initials}
          className="flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-1.5"
        >
          <span className="flex size-6 items-center justify-center rounded-full border bg-muted text-[10px] font-medium">
            {initials}
          </span>
          <span className="h-1.5 flex-1 rounded-full bg-muted-foreground/20" />
          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            {role}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CategoriesMock() {
  // The emoji is its own element rather than a character in the label: glued to
  // the first letter by a space it renders as one jammed word ("🏠Housing"),
  // and a thin space doesn't survive the font stack either.
  const chips: [string, string][] = [
    ["🏠", "Housing"],
    ["🛒", "Groceries"],
    ["🚆", "Transport"],
    ["🍽️", "Dining"],
    ["💡", "Bills"],
  ];
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-wrap justify-center gap-1.5">
        {chips.map(([emoji, label], i) => (
          <span
            key={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
              i === 1
                ? "border-transparent bg-foreground text-background"
                : "bg-background text-muted-foreground",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {label}
          </span>
        ))}
      </div>
      {/* A couple of rows under the chips: the panel is tall, and five small
          pills floating in the middle of it was the hole this set out to fix. */}
      <div className="overflow-hidden rounded-lg border bg-background">
        {[
          ["🛒", "Groceries", "12 this month"],
          ["🏠", "Housing", "1 this month"],
        ].map(([emoji, name, count], i) => (
          <div
            key={name}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs",
              i > 0 && "border-t",
            )}
          >
            <span aria-hidden>{emoji}</span>
            <span>{name}</span>
            <span className="ml-auto text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExportMock() {
  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
        <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium">CSV</span>
        <span className="text-muted-foreground">transactions-2026.csv</span>
      </div>
      <div className="overflow-hidden rounded-lg border bg-background font-mono text-[10px]">
        {["date,note,amount", "2026-09-02,Rent,-18000", "2026-09-04,Salary,82000"].map(
          (row, i) => (
            <div
              key={row}
              className={cn(
                "truncate px-2.5 py-1",
                i === 0 ? "text-muted-foreground" : "",
                i > 0 && "border-t",
              )}
            >
              {row}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function KeysMock() {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <div className="flex gap-1.5">
        {["Q", "T", "E", "F", "S"].map((k) => (
          <kbd
            key={k}
            className="flex size-8 items-center justify-center rounded-md border bg-background text-xs font-medium shadow-sm"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">Add · Filter · Export</span>
    </div>
  );
}

export function PrivacyMock() {
  return (
    <div className="w-full max-w-xs space-y-1.5">
      {[
        ["Bank credentials", false],
        ["Card numbers", false],
        ["Your email", true],
      ].map(([label, asked]) => (
        <div
          key={String(label)}
          className="flex items-center justify-between rounded-lg border bg-background px-3 py-1.5 text-xs"
        >
          <span className={asked ? "" : "text-muted-foreground"}>{label}</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              asked ? "" : "text-muted-foreground",
            )}
          >
            {asked ? "asked" : "never asked"}
          </span>
        </div>
      ))}
    </div>
  );
}
