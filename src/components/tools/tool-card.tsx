import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolPreview } from "@/components/tools/tool-previews";
import { toolPath, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * One tool in a directory — the `/tools` hub and each page's "More free tools".
 *
 * Title first, then a worked example of what the tool makes (a tiny invoice,
 * a receipt, a cheque leaf — `tool-previews.tsx`), then a full-width button
 * naming the action ("Calculate GST"). Hovering lifts the card and brings the
 * picture to life. `index` staggers the entrance so a grid fades in card by
 * card.
 */
export function ToolCard({
  tool,
  location,
  heading: Heading = "h3",
  index = 0,
}: {
  tool: Tool;
  /** Goes into the click event, so each directory's links can be told apart. */
  location: string;
  heading?: "h2" | "h3";
  index?: number;
}) {
  return (
    <Link
      href={toolPath(tool.slug)}
      data-track-event="nav_link_click"
      data-track-params={JSON.stringify({ location, label: tool.slug })}
      style={{ animationDelay: `${index * 50}ms` }}
      className="group flex flex-col rounded-2xl border bg-card p-5 transition-all duration-300 hover:border-foreground/25 hover:shadow-lg motion-safe:animate-rise motion-safe:hover:-translate-y-1"
    >
      <Heading className="text-lg font-semibold tracking-tight">{tool.label}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">{tool.blurb}</p>
      {/* Decorative: the example repeats what the title and blurb say. */}
      <div className="mt-auto pt-5" aria-hidden>
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/40 transition-colors duration-300 group-hover:border-solid group-hover:bg-background">
          <ToolPreview slug={tool.slug} />
        </div>
      </div>
      {/* Looks like a button; the whole card is the link, so it isn't a second one. */}
      <span className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-colors group-hover:bg-foreground/85">
        {tool.action}
        <ArrowRight className="size-4 transition-transform duration-300 motion-safe:group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

const GRID = {
  2: "grid gap-4 sm:grid-cols-2",
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
} as const;

export function ToolCardGrid({
  items,
  location,
  heading,
  columns = 3,
  className,
}: {
  items: Tool[];
  location: string;
  heading?: "h2" | "h3";
  /** Columns at `lg`; always two at `sm`. Two suits the narrow column under a tool. */
  columns?: keyof typeof GRID;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn(GRID[columns], className)}>
      {items.map((tool, i) => (
        <ToolCard key={tool.slug} tool={tool} location={location} heading={heading} index={i} />
      ))}
    </div>
  );
}
