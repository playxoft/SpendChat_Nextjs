"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { trackEvent } from "@/lib/analytics";
import { marketingNav, siteConfig } from "@/lib/site";

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
 * Sign in, Get started free — off the bottom of the screen entirely. So the
 * header and the footer are pinned (`shrink-0`) and the link list between them
 * takes the free space and scrolls inside it (`min-h-0 flex-1 overflow-y-auto`,
 * the same shape `profile-list.tsx` uses in the app shell). `min-h-0` is the
 * load-bearing half: a flex item's default `min-height: auto` refuses to shrink
 * below its content, so `flex-1` alone would grow the list rather than scroll
 * it, and the footer would still be pushed off. The footer needs no `mt-auto`
 * once the list is `flex-1` — the list absorbs the slack when the content is
 * short.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);

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
            {marketingNav.map((item) =>
              // Features opens the directory of feature pages instead of going
              // straight to the hub; every other entry stays a plain link.
              item.href === "/features" ? (
                <FeaturesMenu key={item.href} />
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() =>
                    trackEvent("nav_link_click", { label: item.label, location: "desktop" })
                  }
                  className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              ),
            )}
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
          <Button
            asChild
            variant="ghost"
            className="hidden h-10 rounded-full lg:inline-flex"
          >
            <Link
              href="/sign-in"
              onClick={() => trackEvent("nav_signin_click", { location: "desktop" })}
            >
              Sign in
            </Link>
          </Button>
          <Button asChild className="h-10 rounded-full px-4 sm:px-5">
            <Link
              href="/sign-up"
              onClick={() =>
                trackEvent("cta_click", { location: "nav_desktop", label: "get_started" })
              }
            >
              Get started
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
                {marketingNav.map((item) => (
                  <div key={item.href} className="contents">
                    <SheetClose asChild>
                      <Link
                        href={item.href}
                        onClick={() =>
                          trackEvent("nav_link_click", { label: item.label, location: "mobile" })
                        }
                        className="rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                ))}
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
                  <Button asChild variant="outline" className="h-10 w-full rounded-full">
                    <Link
                      href="/sign-in"
                      onClick={() => trackEvent("nav_signin_click", { location: "mobile" })}
                    >
                      Sign in
                    </Link>
                  </Button>
                </SheetClose>
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
