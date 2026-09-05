"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GithubIcon } from "@/components/icons/github";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeaturesMenu, FeaturesMenuMobile } from "@/components/marketing/features-menu";
import { useShortcut } from "@/hooks/use-shortcut";
import { trackEvent } from "@/lib/analytics";
import {
  getHandoffServerSnapshot,
  getHandoffSnapshot,
  subscribeHandoff,
} from "@/lib/app-redirect";
import { marketingNav, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The key that opens the CTA: press `s` anywhere on the marketing site and you
 * land wherever "Get started" points.
 *
 * Deliberately **not** an entry in `src/lib/shortcuts.ts`. That registry is the
 * *app's* keyboard: the app binds every entry, `ShortcutList` renders all of
 * them as its cheat sheet, and the marketing demos replay them key for key. A
 * marketing-only binding listed there would show up in the app's cheat sheet as
 * a shortcut the app doesn't have — and `s` is already `nav.settings` in there,
 * so the same key would appear twice. The two surfaces never render together
 * (`(marketing)` and `(app)` are separate layouts), so the collision only
 * exists on paper.
 */
const CTA_SHORTCUT = "s";

/**
 * Is `href` the section being viewed? Exact match plus its sub-pages, so a post
 * at `/blog/keyboard-first` keeps "Blog" lit and `/features/voice` keeps
 * "Features" lit. `marketingNav` holds no `/` entry, which is the one href a
 * prefix test would light up on every page.
 */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Floating, capsule-style marketing navigation pinned to the top of the
 * viewport. Stays visible while scrolling, centred at a max width of 6xl.
 *
 * Responsive: the full inline nav (brand + links + secondary actions) shows on
 * desktop (`lg`+). Below that — phones and tablets — the links and secondary
 * actions collapse into a hamburger sheet, so the capsule never overflows; the
 * brand mark and the primary "Get started" CTA stay visible at every width.
 *
 * **The sheet is a three-part column, and only the middle part scrolls.**
 * `SheetContent` is `fixed inset-y-0 h-full flex flex-col` with no overflow of
 * its own, and Radix locks body scroll while it's open — so anything taller
 * than the viewport is simply unreachable, with no scrollbar and no rubber
 * band to hint that there's more. That's not hypothetical here: the link list
 * carries all thirteen feature pages inline (`FeaturesMenuMobile`), which on a
 * 700px-tall phone runs well past the fold and used to push the footer — Theme,
 * Get started free — off the bottom of the screen entirely. So the
 * header and the footer are pinned (`shrink-0`) and the link list between them
 * takes the free space and scrolls inside it (`min-h-0 flex-1 overflow-y-auto`,
 * the same shape `profile-list.tsx` uses in the app shell). `min-h-0` is the
 * load-bearing half: a flex item's default `min-height: auto` refuses to shrink
 * below its content, so `flex-1` alone would grow the list rather than scroll
 * it, and the footer would still be pushed off. The footer needs no `mt-auto`
 * once the list is `flex-1` — the list absorbs the slack when the content is
 * short.
 *
 * **One CTA, at every width.** "Sign in" used to sit beside "Get started" on
 * desktop and again in the sheet's footer, which asked every visitor to
 * classify themselves before they had a reason to. The nav now carries the
 * single primary action and nothing else. Returning users are not stranded:
 * `/sign-up` links to the sign-in form, so the route in is one link past the
 * button they already pressed — and `/sign-in` itself is untouched, so a
 * bookmark or a password manager still lands where it always did.
 *
 * **The CTA has a key.** `s` goes where the button goes — `/app` when the
 * browser carries a session hint, `/sign-up` otherwise — and the button wears a
 * chip advertising it. See `CTA_SHORTCUT`.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Whether this browser holds a session, read from the client-side hint cookie
  // (`lib/app-redirect.ts`). It has to be a cookie read in the browser: the
  // marketing layout is statically rendered, and asking the server would cost
  // that page its caching and its indexability. A hint for UI only — `/app`
  // does the real check on arrival — and it reads "signed out" during hydration,
  // which is the safe way round (see `openCta`).
  const { signedIn } = useSyncExternalStore(
    subscribeHandoff,
    getHandoffSnapshot,
    getHandoffServerSnapshot,
  );

  const openCta = useCallback(() => {
    // Stand down while focus is inside a widget that has claimed the keyboard.
    // The marketing keyboard demos take `role="application"` while focused for
    // exactly that reason, and `s` is one of the keys they answer for (it's
    // `nav.settings` in the app they're demonstrating) — navigating away
    // mid-demo would be the site fighting its own page. `useShortcut` can't see
    // this: the demos `preventDefault` rather than stopping propagation, and by
    // the time a handler runs the hook has called `preventDefault` itself, so
    // `defaultPrevented` no longer distinguishes the two.
    const active = document.activeElement;
    if (active instanceof Element && active.closest('[role="application"]')) return;

    trackEvent("cta_click", { location: "nav_shortcut", label: "get_started" });
    // `/sign-up` already redirects a signed-in visitor to `/app`, so this only
    // skips a round-trip through a page they'd never see. Falling back to
    // `/sign-up` when the hint is absent is the safe direction: that page can
    // redirect onwards, whereas `/app` would bounce a stranger to sign-in.
    router.push(signedIn ? "/app" : "/sign-up");
  }, [router, signedIn]);

  // `requireNoOverlay` because it's a bare letter: it stays quiet while the
  // mobile sheet — or any dialog, menu or listbox — is open, and `useShortcut`
  // already keeps it quiet while a field has focus.
  useShortcut(CTA_SHORTCUT, openCta, { requireNoOverlay: true });

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 print:hidden sm:px-4 sm:pt-4">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 rounded-full border bg-background/80 px-2 shadow-lg shadow-black/5 backdrop-blur-md sm:px-3">
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="flex shrink-0 items-center pl-1.5"
        >
          <Logo />
        </Link>

        {/* Desktop links — centred, absorbing the free space. */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="hidden items-center gap-1 lg:flex">
            {marketingNav.map((item) => {
              // Features opens the directory of feature pages instead of going
              // straight to the hub; every other entry stays a plain link.
              // (It also marks itself active — see `FeaturesMenu`.)
              if (item.href === "/features") return <FeaturesMenu key={item.href} />;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // The tint is the visible half; `aria-current` is the half a
                  // screen reader gets, and neither stands in for the other.
                  aria-current={active ? "page" : undefined}
                  onClick={() =>
                    trackEvent("nav_link_click", { label: item.label, location: "desktop" })
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
                    active ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right cluster. Secondary actions are desktop-only; the CTA is always
            visible; the hamburger takes over below `lg`. */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={`View ${siteConfig.name} on GitHub`}
            className="hidden rounded-full lg:inline-flex"
          >
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackEvent("outbound_click", { destination: "github", location: "nav_desktop" })
              }
            >
              <GithubIcon className="size-[18px]" />
            </a>
          </Button>
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          {/* The bar's one action — see the header comment on why "Sign in" no
              longer sits beside it. */}
          <Button asChild className="h-10 gap-2 rounded-full px-4 sm:px-5">
            <Link
              href="/sign-up"
              aria-keyshortcuts={CTA_SHORTCUT}
              onClick={() =>
                trackEvent("cta_click", { location: "nav_desktop", label: "get_started" })
              }
            >
              Get started
              {/* Desktop only: the chip advertises a key, and a phone has none
                  to press. The binding itself is unconditional — it costs
                  nothing on a device that can't fire it. The `[&_kbd]` overrides
                  are because `Kbd` is drawn for a neutral surface (`bg-muted`,
                  a border-coloured drop shadow) and this one sits on the
                  primary fill. */}
              <Kbd
                combo={CTA_SHORTCUT}
                className="hidden lg:inline-flex [&_kbd]:h-5 [&_kbd]:min-w-5 [&_kbd]:border-primary-foreground/40 [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground [&_kbd]:shadow-none"
              />
            </Link>
          </Button>

          {/* Mobile / tablet menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="rounded-full lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 gap-0 p-0">
              <SheetHeader className="shrink-0 border-b px-5 py-4 text-left">
                <SheetTitle asChild>
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    aria-label={`${siteConfig.name} home`}
                  >
                    <Logo />
                  </Link>
                </SheetTitle>
              </SheetHeader>

              {/* The only scroller in the sheet — see the header comment. */}
              <nav className="scrollbar-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
                {marketingNav.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <div key={item.href} className="contents">
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() =>
                            trackEvent("nav_link_click", { label: item.label, location: "mobile" })
                          }
                          className={cn(
                            "rounded-lg px-3 py-2.5 text-base font-medium transition-colors hover:bg-accent hover:text-foreground",
                            active ? "bg-accent text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                      {/* Feature pages listed inline under Features, so they're
                          one tap away on mobile. Inside the sheet's portal, so
                          this renders only once the menu is open — see
                          `FeaturesMenuMobile`. */}
                      {item.href === "/features" && (
                        <FeaturesMenuMobile onNavigate={() => setOpen(false)} />
                      )}
                    </div>
                  );
                })}
                <SheetClose asChild>
                  <a
                    href={siteConfig.links.github}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      trackEvent("outbound_click", { destination: "github", location: "nav_mobile" })
                    }
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <GithubIcon className="size-[18px] shrink-0" />
                    <span className="flex min-w-0 flex-col leading-tight">
                      View repo on GitHub
                      <span className="text-xs font-normal text-muted-foreground">
                        Open source
                      </span>
                    </span>
                  </a>
                </SheetClose>
              </nav>

              <div className="flex shrink-0 flex-col gap-3 border-t px-5 py-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
                <SheetClose asChild>
                  <Button asChild className="h-11 rounded-full">
                    <Link
                      href="/sign-up"
                      onClick={() =>
                        trackEvent("cta_click", { location: "nav_mobile", label: "get_started" })
                      }
                    >
                      Get started free
                    </Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
