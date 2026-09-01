"use client";

import {
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
/**
 * The panel's geometry, in **rem** — the unit its CSS is written in.
 *
 * These used to be px constants (736 / 16 / 8) matching the Tailwind classes at
 * a 16px root font. That holds only while the root font *is* 16. A visitor who
 * raises their browser's default font to 20px gets a panel that is really
 * 46rem = 920px wide, positioned as though it were 736 — at a ~1100px viewport
 * the right edge lands ~170px off-screen, and the CSS `min()` cannot rescue a
 * `left` that was chosen from the wrong width. Since the whole menu is a
 * larger-font affordance as much as a pointer one, read the root size instead
 * of assuming it.
 */
const PANEL_WIDTH_REM = 46; // the panel's own w-[min(46rem,…)]
const VIEWPORT_MARGIN_REM = 1; // half of its calc(100vw - 2rem)

/** `value` rem in CSS pixels, read from the document rather than assumed. */
function rem(value: number): number {
  const root = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return value * (Number.isFinite(root) && root > 0 ? root : 16);
}

/**
 * The focus ring the panel's links wear.
 *
 * `focus-visible:bg-accent` used to be the whole indicator, and it's the same
 * tint hover paints — 1.1:1 against the popover in light mode, 1.2:1 in dark —
 * so "focused" and "hovered" looked identical and neither looked like much of
 * anything. The shape here is the one the rest of the app uses
 * (`focus-visible:ring-2 … focus-visible:outline-none`), but not its colour:
 * `--ring` is `oklch(0.708 0 0)` in light mode, which lands at 2.6:1 on a white
 * popover and misses the 3:1 WCAG 1.4.11 asks of a non-text indicator.
 * `--muted-foreground` is the same neutral family and clears it in both themes
 * — 4.3:1 light, 5.8:1 dark, measured against the focused row's accent tint.
 */
const FOCUS_RING =
  "focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-muted-foreground focus-visible:outline-none";

type Anchor = { top: number; left: number };

/**
 * The desktop Features menu: a three-column directory of every feature page.
 *
 * It exists for navigation, not for crawl depth — a distinction worth stating
 * because the opposite used to be claimed here. The panel renders only once it
 * is open, so none of these links are in the served HTML; a crawler sees the
 * `/features` trigger and nothing else. The spokes are reachable from the hub
 * and from `sitemap.ts`, which is what actually gets them indexed, and they sit
 * two clicks from the homepage rather than one.
 *
 * If that depth ever needs closing, the fix is real markup — the links in the
 * footer, or the panel rendered hidden rather than conditionally — not a
 * comment asserting a benefit this component doesn't provide.
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
 * **Focus doesn't open the panel; ArrowDown does.** Opening on focus was worse
 * than not opening at all: the portal appends the panel after every other
 * focusable element in the document, so the Tab that follows went to the next
 * nav link rather than into the panel — a keyboard user got a 46rem overlay
 * over the top of the page and none of the contents it was covering. ArrowDown
 * opens the panel and puts focus on the first item; Escape closes it and hands
 * focus back to the trigger. Focus leaving the trigger-and-panel pair closes it
 * too — *unless the pointer is resting on the panel*, which is the one case
 * where "focus left" doesn't mean "nobody is using this": clicking the panel's
 * own whitespace blurs the focused link to `<body>`, and closing on that would
 * pull the panel out from under a cursor that never moved. While the pointer is
 * inside, `mouseleave` owns the close. On touch there's no hover at all — the
 * tap just follows the link to the hub, which lists everything the panel does.
 *
 * **Nothing cancels a close except arriving somewhere that owns one.** The
 * trigger deliberately has no `onFocus` handler. It used to cancel the close
 * timer unconditionally, which stranded the panel open with the pointer gone:
 * hover it open, move the pointer away to arm the close, then Tab onto the
 * trigger within those 140ms and the timer died with nothing left to shut it.
 *
 * **Tab off either end comes back to the trigger.** That same portal order is
 * what sequential focus would otherwise follow: forward from the last item it
 * leaves the document for the browser's chrome, backward from the first it
 * lands on the footer's last link — either way the user is torn out of the nav
 * they were reading (WCAG 2.4.3). So both edges close the panel and return
 * focus to the trigger. That is deliberately not a focus trap: the panel is
 * already closed when focus lands, so the next Tab carries on to the next nav
 * link like any other.
 *
 * **It's announced as a disclosure, not a menu.** `aria-haspopup` is gone.
 * `"true"` is defined as `menu`, and this is a container of plain links with no
 * `role="menu"`, no `menuitem` and no roving arrow-key focus — a promise the
 * implementation never paid, since a second ArrowDown just scrolls the page.
 * `"dialog"` would be the same trade in another currency: it implies modality
 * and the focus trap the paragraph above rules out. What's left says exactly
 * what's here — `aria-expanded` and `aria-controls` on the trigger, and a named
 * `nav` landmark on the panel so a screen reader can say where focus went when
 * ArrowDown teleports it to the end of `<body>`. The cost is that ArrowDown
 * isn't announced any more; the trigger is still a link to the hub, which lists
 * the same pages, so nothing is unreachable without it.
 *
 * **The close timer defers to keyboard focus only.** A pointer wandering off
 * the panel mustn't unmount the links someone is tabbing through. But Chrome
 * and Firefox focus an `<a>` on mousedown, so a press that never becomes a
 * click — drag off the link before releasing, or middle-click — leaves DOM
 * focus inside the panel with no `click` to close it. A guard that asked only
 * whether `document.activeElement` sat inside would pin the panel open
 * indefinitely, `position: fixed` at an anchor measured once, with no pointer
 * route out. So it asks whether that focus arrived by *keyboard*: either
 * ArrowDown put it there, or the focused element matches `:focus-visible`.
 */
export function FeaturesMenu() {
  const spokes = publishedFeatures();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Set when the panel is opened from the keyboard, so focus follows it in on
  // the render that mounts the portal.
  const focusOnOpen = useRef(false);
  // Whether the pointer is currently over the panel. `handleBlur` needs this:
  // a blur can fire *while* the pointer sits on the panel (clicking its own
  // whitespace blurs the focused link to `<body>`), and closing then yanks the
  // panel out from under a stationary cursor with no `mouseleave` in sight.
  const pointerInside = useRef(false);
  // True while the focus inside the panel is focus we moved there from the
  // keyboard. A pointer press inside the panel clears it: from then on whatever
  // holds focus in there got it from the mouse, whoever put it there first.
  const keyboardFocus = useRef(false);
  const panelId = useId();
  const pathname = usePathname();

  const hasPanel = spokes.length > 0;

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  /**
   * Is the panel holding focus that arrived by keyboard rather than by mouse?
   * Only that kind of focus stops the close timer — see the header comment for
   * the mousedown-without-a-click case that mere containment leaves stuck open.
   */
  const panelHoldsKeyboardFocus = useCallback(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (!panelRef.current?.contains(active)) return false;
    if (keyboardFocus.current) return true;
    // Shift+Tab from the browser's chrome lands straight on the panel's last
    // link without passing the trigger, so the flag isn't the only way in.
    try {
      return active.matches(":focus-visible");
    } catch {
      // Fail closed on a browser that can't evaluate the selector: the flag
      // already covers the flow this guard exists for.
      return false;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    keyboardFocus.current = false;
    setOpen(false);
  }, [cancelClose]);

  // A short delay on close, so crossing the few pixels between the trigger and
  // the panel doesn't snap it shut mid-reach.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      // A pointer passing over and off the panel mustn't unmount the links
      // someone is tabbing through — that would drop focus to the top of the
      // document. Focus leaving is what closes a keyboard-opened panel, and
      // `handleBlur` schedules that.
      if (panelHoldsKeyboardFocus()) return;
      // `close()`, not a bare `setOpen(false)`: closing has to clear the
      // keyboard-focus flag too, or a panel that was once entered by ArrowDown
      // leaves it latched and the *next* pointer-opened panel refuses to close.
      close();
    }, CLOSE_DELAY);
  }, [cancelClose, close, panelHoldsKeyboardFocus]);

  /** Measure the trigger and place the panel under it, clamped to the viewport. */
  const openPanel = useCallback(() => {
    cancelClose();
    if (!hasPanel) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = rem(VIEWPORT_MARGIN_REM);
    const width = Math.min(rem(PANEL_WIDTH_REM), window.innerWidth - margin * 2);
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(centred, margin),
      window.innerWidth - width - margin,
    );
    setAnchor({ top: rect.bottom, left });
    setOpen(true);
  }, [cancelClose, hasPanel]);

  const panelLinks = useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
      ),
    [],
  );

  const focusFirstItem = useCallback(() => {
    const first = panelLinks()[0];
    if (!first) return;
    keyboardFocus.current = true;
    first.focus();
  }, [panelLinks]);

  /** Open from the keyboard, with focus following into the panel. */
  const openFromKeyboard = useCallback(() => {
    openPanel();
    // A pointer may have opened it already, in which case the links exist now;
    // otherwise the effect below focuses them once the portal has mounted.
    if (panelRef.current) focusFirstItem();
    else focusOnOpen.current = true;
  }, [openPanel, focusFirstItem]);

  /**
   * Focus leaving the trigger *and* the panel closes the menu; focus crossing
   * between the two doesn't. The pair is one React tree but two DOM trees — the
   * panel is portalled to `<body>` — so containment has to be asked of both
   * separately, and `relatedTarget` is the only thing that says where focus
   * went.
   */
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (
        next instanceof Node &&
        (triggerRef.current?.contains(next) || panelRef.current?.contains(next))
      ) {
        return;
      }
      keyboardFocus.current = false;
      // The pointer is the other way in, and it has its own way out. While it
      // rests on the panel, `mouseleave` owns the close; scheduling one here
      // would close the panel under a cursor that never moved — most easily by
      // clicking the panel's own whitespace, which blurs the focused link to
      // `<body>` without `relatedTarget` telling us the pointer stayed.
      if (pointerInside.current) return;
      scheduleClose();
    },
    [scheduleClose],
  );

  /**
   * Tab off either end of the panel goes back to the trigger and closes, rather
   * than following DOM order out of the document (forward) or into the footer
   * (backward). Nothing is trapped: the panel is closed by the time focus
   * lands, so the Tab after that continues into the rest of the nav.
   */
  const handlePanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== "Tab") return;
      const links = panelLinks();
      const edge = e.shiftKey ? links[0] : links[links.length - 1];
      if (!edge || e.target !== edge) return;
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    },
    [close, panelLinks],
  );

  useEffect(() => cancelClose, [cancelClose]);

  // Moving focus into the panel is the point of opening it from the keyboard,
  // and it can only happen once the portal has mounted.
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    focusFirstItem();
  }, [open, focusFirstItem]);

  // Escape closes from anywhere, including from inside the portalled panel.
  // Focus goes back to the trigger only when it was inside the panel — Escape
  // pressed while reading the page shouldn't drag focus up into the nav.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const hadFocus = panelRef.current?.contains(document.activeElement) ?? false;
      close();
      if (hadFocus) triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // Closing on navigation is handled by each link's own `onClick` rather than
  // by watching `pathname`: a `setOpen` in an effect body triggers a cascading
  // render on every route change, which the lint rule rightly objects to, and
  // there is no path to a new route that doesn't go through one of those links.
  const isActive = pathname === "/features" || pathname.startsWith("/features/");

  const panel =
    open && anchor ? (
      <nav
        ref={panelRef}
        id={panelId}
        // A landmark rather than a bare `aria-label`, which a `<div>` with no
        // role wouldn't expose at all: it's what lets a screen reader say where
        // focus has gone when ArrowDown moves it to the end of `<body>`.
        aria-label="Features"
        // The anchor is the trigger's bottom edge and the gap below it is this
        // element's own `pt-2`, which puts that gap *inside* the hoverable area
        // so the pointer never crosses dead space on its way down. (It used to
        // be a px constant added in `openPanel` and subtracted again here — a
        // round trip that computed to nothing, and one more px/rem mismatch.)
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 pt-2"
        onMouseEnter={() => {
          pointerInside.current = true;
          cancelClose();
        }}
        onMouseLeave={() => {
          pointerInside.current = false;
          scheduleClose();
        }}
        onFocusCapture={cancelClose}
        // React's `onBlur` is `focusout`, which bubbles, so this catches focus
        // leaving any of the links inside.
        onBlur={handleBlur}
        onKeyDown={handlePanelKeyDown}
        onPointerDown={() => {
          keyboardFocus.current = false;
        }}
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
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent",
                        FOCUS_RING,
                      )}
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
              className={cn(
                "flex items-center justify-center rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent",
                FOCUS_RING,
              )}
            >
              See all features
            </Link>
          </div>
        </div>
      </nav>
    ) : null;

  return (
    <>
      <Link
        ref={triggerRef}
        href="/features"
        // No `aria-haspopup`: "true" means `menu`, and this is a disclosure of
        // plain links, not a menu widget. See the header comment.
        aria-expanded={hasPanel ? open : undefined}
        // Only while the panel exists: the portal is unmounted when closed, so
        // an unconditional `aria-controls` would point at nothing most of the
        // time. `aria-expanded` carries the "there is a panel" half.
        aria-controls={hasPanel && open ? panelId : undefined}
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        // Deliberately no `onFocus`. Cancelling the close here used to strand
        // the panel: hover it open, move the pointer away (arming the close),
        // then Tab onto the trigger inside those 140ms and the timer died with
        // the panel still open, the pointer gone and nothing left to shut it.
        // Focus arriving from *inside* the panel is already handled — the
        // panel's `focusout` sees `relatedTarget` is the trigger and never
        // schedules anything — so there is nothing left for this to cancel.
        onBlur={handleBlur}
        onKeyDown={(e) => {
          // Enter belongs to the link — it goes to the hub. ArrowDown is the
          // one key that opens the panel, and it has to beat the page scroll.
          if (!hasPanel || e.key !== "ArrowDown") return;
          e.preventDefault();
          openFromKeyboard();
        }}
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
 * contents. Like the desktop panel this is behind an interaction — a Radix
 * portal with no `forceMount` — so it is for people, not for crawlers.
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
