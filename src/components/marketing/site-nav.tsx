"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { marketingNav, siteConfig } from "@/lib/site";

/**
 * Floating, capsule-style marketing navigation pinned to the top of the
 * viewport. Stays visible while scrolling, centred at a max width of 5xl, and
 * stays usable down to small phones (the brand mark collapses to its icon, and
 * secondary actions hide, so the links always fit).
 */
export function SiteNav() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 print:hidden sm:px-4 sm:pt-4">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 rounded-full border bg-background/80 px-2 shadow-lg shadow-black/5 backdrop-blur-md sm:gap-3 sm:px-3">
        <Link
          href="/"
          aria-label={`${"SpendChat"} home`}
          className="flex shrink-0 items-center pl-1.5"
        >
          <Logo showText={false} className="sm:hidden" />
          <Logo className="hidden sm:inline-flex" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3 sm:text-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="View SpendChat on GitHub"
            className="hidden rounded-full sm:inline-flex"
          >
            <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
              <GithubIcon className="size-[18px]" />
            </a>
          </Button>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <Button
            asChild
            variant="ghost"
            className="hidden h-10 rounded-full sm:inline-flex"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="h-10 rounded-full px-5">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </nav>
    </div>
  );
}
