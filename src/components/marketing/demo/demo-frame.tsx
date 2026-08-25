import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { navItems } from "@/components/app/nav-items";
import { cn } from "@/lib/utils";

/**
 * The window every marketing demo sits inside — a faithful, inert replica of
 * the `/app` shell (`src/app/app/layout.tsx`): a 224px sidebar with the brand
 * mark, the section nav and its shortcut chips, then the content pane.
 *
 * Why a replica and not `<AppSidebar>` itself: the real sidebar needs
 * `usePathname`/`useSearchParams`, a workspace list, a profile list and a
 * signed-in user. What it renders that a visitor can actually *read*, though,
 * is the section nav — and that comes from `navItems`, which this imports
 * directly. So the labels, icons, order and keyboard shortcuts can't drift from
 * the app even though the chrome around them is separate. The rest of the real
 * sidebar (workspace switcher, profile list, user menu) is represented by the
 * `sidebarTop` / `sidebarBottom` slots, which individual demos fill with
 * whatever their story needs.
 *
 * Server component on purpose: the seeded state renders into the HTML, so a
 * crawler reads real transactions rather than an empty shell that only fills in
 * after hydration. Demos supply their own `"use client"` islands as children.
 */
export function DemoFrame({
  label,
  active = "/app",
  sidebar = true,
  sidebarTop,
  sidebarBottom,
  header,
  footer,
  overlay,
  children,
  className,
  bodyClassName,
}: {
  /** Names the demo for assistive tech, e.g. "Interactive tracker demo". */
  label: string;
  /** Which `navItems` href renders as the current section. */
  active?: string;
  /** Hide the sidebar for narrow demos that only need the content pane. */
  sidebar?: boolean;
  /** Slot above the section nav — where the real app puts workspace + profiles. */
  sidebarTop?: ReactNode;
  /** Slot pinned to the sidebar's bottom — the real app puts theme + account there. */
  sidebarBottom?: ReactNode;
  /** Sticky header inside the content pane (balance bar, profile picker, …). */
  header?: ReactNode;
  /** Pinned to the bottom of the content pane — usually the composer. */
  footer?: ReactNode;
  /**
   * Covers the whole frame, sidebar included — for a demo whose story is a
   * dialog. The app's dialogs cover the app, so one drawn inside the content
   * pane would be a smaller claim than the real thing makes.
   */
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Applied to the scrolling body between `header` and `footer`. */
  bodyClassName?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "relative flex w-full overflow-hidden rounded-2xl border bg-background shadow-xl",
        className,
      )}
    >
      {sidebar && (
        // Below `lg` the demo is too narrow to carry a sidebar and still leave
        // the content pane readable, so it drops out entirely — the same
        // trade-off the real app makes at `md`, one breakpoint later because a
        // demo never gets the full viewport width.
        <aside className="hidden w-56 shrink-0 flex-col border-r bg-background lg:flex">
          <div className="flex h-14 shrink-0 items-center px-5">
            <Logo />
          </div>

          {sidebarTop}

          <Separator className="my-1" />
          <nav className="shrink-0 space-y-1 px-3 py-2">
            {navItems.map((item) => {
              const isCurrent = item.href === active;
              return (
                <span
                  key={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                    isCurrent
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  <Kbd combo={item.shortcut} className="ml-auto opacity-70" />
                </span>
              );
            })}
          </nav>

          {sidebarBottom ? (
            <div className="mt-auto">{sidebarBottom}</div>
          ) : (
            <div className="mt-auto" />
          )}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        {/* `min-h-0` is what lets a demo pin the frame to a fixed height and
            have the body absorb the difference. Without it a flex child refuses
            to shrink below its content, so a footer that grows between stages
            (an empty note box becoming three review rows) pushes the frame
            taller and everything below it on the page jumps — the layout shift
            these demos are built to avoid. */}
        <div className={cn("min-h-0 min-w-0 flex-1", bodyClassName)}>{children}</div>
        {footer}
      </div>

      {overlay}
    </section>
  );
}
