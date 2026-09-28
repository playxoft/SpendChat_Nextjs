import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolIcon } from "@/components/tools/tool-icon";
import { toolPath, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** One tool in a directory — the `/tools` hub and each page's "Related tools". */
export function ToolCard({
  tool,
  location,
  heading: Heading = "h3",
}: {
  tool: Tool;
  /** Goes into the click event, so each directory's links can be told apart. */
  location: string;
  heading?: "h2" | "h3";
}) {
  return (
    <Link
      href={toolPath(tool.slug)}
      data-track-event="nav_link_click"
      data-track-params={JSON.stringify({ location, label: tool.slug })}
      className="group flex items-start gap-4 rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
        <ToolIcon name={tool.icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <Heading className="flex items-center gap-1.5 font-medium">
          {tool.label}
          <ArrowRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </Heading>
        <p className="mt-1 text-sm text-muted-foreground">{tool.blurb}</p>
      </div>
    </Link>
  );
}

export function ToolCardGrid({
  items,
  location,
  heading,
  className,
}: {
  items: Tool[];
  location: string;
  heading?: "h2" | "h3";
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} location={location} heading={heading} />
      ))}
    </div>
  );
}
