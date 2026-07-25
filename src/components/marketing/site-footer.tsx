"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { GithubIcon } from "@/components/icons/github";
import { Logo } from "@/components/logo";
import { trackEvent } from "@/lib/analytics";
import { reopenConsentBanner } from "@/lib/consent";
import { siteConfig } from "@/lib/site";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/blog", label: "Blog" },
      { href: "/app", label: "Open app" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/sign-up", label: "Get started" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookie-policy", label: "Cookie Policy" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{siteConfig.tagline}</p>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackEvent("outbound_click", { destination: "github", location: "footer" })
            }
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-4" /> Open source on GitHub
          </a>
          <p className="text-sm text-muted-foreground">
            A product by{" "}
            <a
              href={siteConfig.links.playxoft}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackEvent("outbound_click", { destination: "playxoft", location: "footer" })
              }
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {siteConfig.author}
            </a>
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-3 text-sm font-medium">{g.title}</h3>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() =>
                      trackEvent("footer_link_click", { label: l.label, group: g.title })
                    }
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              {g.title === "Legal" && (
                <li>
                  <button
                    type="button"
                    onClick={reopenConsentBanner}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cookie settings
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>
            © {year} {siteConfig.name}. Open source under {siteConfig.license}.
          </p>
          <p className="inline-flex items-center gap-1.5">
            Made with <Heart className="size-3.5 fill-current text-foreground" /> for the
            modern web
          </p>
        </div>
      </div>
    </footer>
  );
}
