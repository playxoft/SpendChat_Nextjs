"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import { trackEvent } from "@/lib/analytics";
import {
  FEATURE_GROUPS,
  featurePath,
  featuresInGroup,
  publishedFeatures,
} from "@/lib/features";
import { cn } from "@/lib/utils";

/** Grace period before a hover-out closes the panel, in ms. */
const CLOSE_DELAY = 140;
/** Panel width, and the margin it keeps from the viewport edges. */
const PANEL_WIDTH = 736; // 46rem
const VIEWPORT_MARGIN = 16;
/** Gap between the nav capsule and the panel. */
const PANEL_OFFSET = 8;

type Anchor = { top: number; left: number };

/**
 * The desktop Features menu: a three-column directory of every feature page.
 *
 * It exists for crawl depth as much as for navigation. Feature pages are the
 * spokes of a topical cluster, and a spoke reachable only from the hub sits two
 * clicks from the homepage, which is where crawling gets thin and pages start
 * showing up in Search Console as "Discovered – currently not indexed". Linking
 * every one of them from the site-wide nav puts them all one click deep.
 *
 * **The trigger is a real link, not a button.** Hovering opens the panel;
 * clicking goes to `/features`. That's what people expect from a nav item that
 * also names a page, and it means the menu never traps someone who just wanted
 * the overview. It's also why this isn't a Radix dropdown: that component owns
 * the click in order to toggle itself, and the click is exactly what we need to
 * give back to the link.
 *
 * **The panel is portalled to `<body>`.** It has to be. The nav capsule carries
 * `backdrop-blur-md`, and an element with a backdrop-filter composites its
 * descendants into its own layer — a panel rendered inside it comes out looking
 * washed out, with the page showing through an opaque background. Rendering it
 * outside that layer and positioning it against the trigger's measured rect is
 * the fix.
 *
 * Hover alone would leave keyboard and touch users with no way in, so the panel
 * also opens on focus and closes on Escape. On touch there's no hover at all —
 * the tap just follows the link to the hub, which lists everything the panel
 * does.
 */
export function FeaturesMenu() {
  const spokes = publishedFeatures();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();

  const hasPanel = spokes.length > 0;

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // A short delay on close, so crossing the few pixels between the trigger and
  // the panel doesn't snap it shut mid-reach.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, [cancelClose]);

  /** Measure the trigger and place the panel under it, clamped to the viewport. */
  const openPanel = useCallback(() => {
    cancelClose();
    if (!hasPanel) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(centred, VIEWPORT_MARGIN),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    setAnchor({ top: rect.bottom + PANEL_OFFSET, left });
    setOpen(true);
  }, [cancelClose, hasPanel]);

  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Escape closes from anywhere, including from inside the portalled panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Closing on navigation is handled by each link's own `onClick` rather than
  // by watching `pathname`: a `setOpen` in an effect body triggers a cascading
  // render on every route change, which the lint rule rightly objects to, and
  // there is no path to a new route that doesn't go through one of those links.
  const isActive = pathname === "/features" || pathname.startsWith("/features/");

  const panel =
    open && anchor ? (
      <div
        // `pt` puts the gap *inside* the hoverable area, so the pointer never
        // crosses dead space on its way down from the trigger.
        style={{ top: anchor.top - PANEL_OFFSET, left: anchor.left }}
        className="fixed z-50 pt-2"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onFocusCapture={cancelClose}
      >
        {/* No entry animation. `animate-rise` leaves this element on its own
            composited layer, and Chrome keeps that layer's alpha from the
            animation's first frame even after it finishes — an opaque panel
            renders semi-transparent over whatever is behind it, which on a
            menu that overlays page content is very visible. The panel appears
            instantly instead, which for a hover menu is arguably better
            anyway. */}
        <div className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
          <div className="grid gap-x-2 gap-y-4 sm:grid-cols-3">
            {FEATURE_GROUPS.map((group) => {
              const items = featuresInGroup(group.id);
              if (items.length === 0) return null;
              return (
                <div key={group.id}>
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  {items.map((feature) => (
                    <Link
                      key={feature.slug}
                      href={featurePath(feature.slug)}
                      onClick={() => {
                        close();
                        trackEvent("nav_link_click", {
                          label: feature.slug,
                          location: "features_menu",
                        });
                      }}
                      className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <FeatureIcon
                        name={feature.icon}
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium">{feature.label}</span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {feature.blurb}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-2 border-t pt-2">
            <Link
              href="/features"
              onClick={() => {
                close();
                trackEvent("nav_link_click", {
                  label: "all_features",
                  location: "features_menu",
                });
              }}
              className="flex items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              See all features
            </Link>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <Link
        ref={triggerRef}
        href="/features"
        aria-haspopup={hasPanel ? "true" : undefined}
        aria-expanded={hasPanel ? open : undefined}
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        onFocus={openPanel}
        onClick={() => {
          close();
          trackEvent("nav_link_click", { label: "Features", location: "desktop" });
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
          open || isActive ? "bg-accent text-foreground" : "text-muted-foreground",
        )}
      >
        Features
        {hasPanel && (
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        )}
      </Link>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

/**
 * The mobile counterpart: an indented list of every feature page, under the
 * "Features" link in the sheet. Flat rather than collapsible — a sheet the user
 * already opened deliberately shouldn't ask for a second tap to reveal its
 * contents, and the links need to be in the DOM for the same crawl reason as
 * the desktop panel.
 */
export function FeaturesMenuMobile({ onNavigate }: { onNavigate?: () => void }) {
  const spokes = publishedFeatures();
  if (spokes.length === 0) return null;

  return (
    <div className="mt-0.5 mb-1 ml-3 flex flex-col border-l pl-3">
      {spokes.map((feature) => (
        <Link
          key={feature.slug}
          href={featurePath(feature.slug)}
          onClick={() => {
            trackEvent("nav_link_click", {
              label: feature.slug,
              location: "features_menu_mobile",
            });
            onNavigate?.();
          }}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {feature.label}
        </Link>
      ))}
    </div>
  );
}
