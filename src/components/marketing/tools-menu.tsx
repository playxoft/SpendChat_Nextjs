"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FOCUS_RING, NavMenu } from "@/components/marketing/nav-menu";
import { ToolIconTile } from "@/components/tools/tool-icon";
import { trackEvent } from "@/lib/analytics";
import { publishedTools, toolMenuColumns, toolPath, TOOL_GROUPS } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * The desktop Tools menu: every free tool, each on its group's coloured tile,
 * in three columns of whole groups balanced by height (`toolMenuColumns`), with
 * "All tools" at the foot. Labels only — the hub carries the blurbs — so 20-odd
 * tools fit without the panel outgrowing a laptop screen; past that it scrolls.
 *
 * The hover, keyboard and positioning behaviour is `NavMenu`'s, shared with the
 * Features menu: centred on the trigger, so the middle column sits under it.
 */
export function ToolsMenu({
  markActive = true,
}: {
  /** See `NavMenu`'s `markActive` — `false` on the 404. */
  markActive?: boolean;
} = {}) {
  const columns = toolMenuColumns(3);
  const count = publishedTools().length;
  return (
    <NavMenu
      href="/tools"
      label="Tools"
      panelLabel="Free tools"
      panelWidthRem={48}
      hasPanel={count > 0}
      markActive={markActive}
    >
      {(close) => (
        <>
          <div className="scrollbar-slim grid max-h-[min(34rem,calc(100dvh-8rem))] grid-cols-3 gap-x-2 overflow-y-auto">
            {columns.map((column, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-3">
                {column.map((group) => (
                  <div key={group.id}>
                    <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((tool) => (
                      <Link
                        key={tool.slug}
                        href={toolPath(tool.slug)}
                        onClick={() => {
                          close();
                          trackEvent("nav_link_click", { label: tool.slug, location: "tools_menu" });
                        }}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent",
                          FOCUS_RING,
                        )}
                      >
                        <ToolIconTile name={tool.icon} tint={group.tint} />
                        <span className="min-w-0 text-sm leading-snug font-medium">{tool.label}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 border-t pt-2">
            <Link
              href="/tools"
              onClick={() => {
                close();
                trackEvent("nav_link_click", { label: "all_tools", location: "tools_menu" });
              }}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent",
                FOCUS_RING,
              )}
            >
              All {count} free tools <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </NavMenu>
  );
}

/**
 * The mobile counterpart, under "Tools" in the sheet — the same shape as
 * `FeaturesMenuMobile`: an indented, flat list (no second tap to expand), each
 * tool with its small tile so the two menus read the same. Inside the sheet's
 * portal, so it renders only once the sheet is open.
 */
export function ToolsMenuMobile({ onNavigate }: { onNavigate?: () => void }) {
  const tools = publishedTools();
  if (tools.length === 0) return null;
  const tintOf = new Map(TOOL_GROUPS.map((g) => [g.id, g.tint]));

  return (
    <div className="mt-0.5 mb-1 ml-3 flex flex-col border-l pl-3">
      {TOOL_GROUPS.flatMap((group) => tools.filter((t) => t.group === group.id)).map((tool) => (
        <Link
          key={tool.slug}
          href={toolPath(tool.slug)}
          onClick={() => {
            trackEvent("nav_link_click", { label: tool.slug, location: "tools_menu_mobile" });
            onNavigate?.();
          }}
          className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ToolIconTile name={tool.icon} tint={tintOf.get(tool.group) ?? "sky"} className="size-6 [&_svg]:size-3.5" />
          {tool.label}
        </Link>
      ))}
    </div>
  );
}
