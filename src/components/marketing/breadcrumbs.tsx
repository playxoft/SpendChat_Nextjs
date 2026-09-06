import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * The visible breadcrumb trail that accompanies `breadcrumbJsonLd()`.
 *
 * The last crumb is the current page: rendered as plain text with
 * `aria-current`, not a link, so a screen reader announces it as the
 * destination rather than offering a link to where the user already is.
 *
 * `align` follows the page the trail sits on. A blog post is a column of
 * left-aligned prose and the trail reads as its first line; a feature page
 * opens on a centred hero, where a trail pinned to the left edge is the one
 * thing on the screen that isn't on the centre line.
 */
export function Breadcrumbs({
  trail,
  align = "start",
}: {
  trail: Crumb[];
  align?: "start" | "center";
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol
        className={cn(
          "flex flex-wrap items-center gap-1 text-sm text-muted-foreground",
          align === "center" && "justify-center",
        )}
      >
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {isLast ? (
                <span aria-current="page" className="text-foreground">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={crumb.path}
                  className="transition-colors hover:text-foreground"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
