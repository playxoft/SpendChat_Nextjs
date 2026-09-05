export const siteConfig = {
  name: "SpendChat",
  domain: "spendchat.app",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://spendchat.app")
    // Tolerate a bare hostname in the env (e.g. "spendchat.app"):
    // new URL() requires a scheme, so default to https:// when none is given.
    .replace(/^(?!https?:\/\/)/i, "https://")
    .replace(/\/$/, ""),
  tagline: "Track your money like a conversation.",
  description:
    "A minimal, fast, and private money tracker. Add income and expenses in seconds with a chat-style tracker, then filter, download, and print whenever you need. Free to use.",
  author: "Playxoft",
  supportEmail: "support@spendchat.app",
  /** Shared social/chat preview card: `public/opengraph-image.png`, 1200×630. */
  ogImage: "/opengraph-image.png",
  /**
   * Editorial reference only — the themes the marketing site is written around.
   * Deliberately **not** emitted as a `<meta name="keywords">` tag: Google
   * dropped that signal in 2009 and Bing treats stuffing it as a spam marker.
   * Keywords earn their place in titles, headings, body copy, anchor text, and
   * slugs. If you find yourself wiring this array into `metadata`, don't.
   */
  topics: [
    "money tracker",
    "expense tracker",
    "chat expense tracker",
    "AI expense tracker",
    "voice expense tracker",
    "income and expense tracker",
    "expense tracker without bank connection",
    "open source expense tracker",
    "free expense tracker",
  ],
  /** AGPL-3.0; source is public. */
  license: "AGPL-3.0",
  links: {
    github: "https://github.com/playxoft/SpendChat_Nextjs",
    playxoft: "https://playxoft.com",
  },
} as const;

/** Marketing site navigation. Kept short so the capsule nav stays mobile-friendly. */
export const marketingNav = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
] as const;

/**
 * `aria-current` for a marketing nav item, or `undefined` when the item isn't
 * the section being viewed.
 *
 * The two values are not interchangeable. `"page"` is reserved for the link to
 * the page you are actually on — telling a screen-reader user that following it
 * is a no-op. A section link on one of its sub-pages is a different claim: on
 * `/blog/keyboard-first` the "Blog" item is an ancestor, not this page, and
 * activating it really does navigate somewhere. `"true"` says "you're within
 * this" without the promise `"page"` makes. Both light the item up; only the
 * exact match calls itself the page.
 *
 * `marketingNav` holds no `/` entry, which is the one href a prefix test would
 * match on every page.
 */
export function navCurrent(
  pathname: string,
  href: string,
): "page" | "true" | undefined {
  if (pathname === href) return "page";
  return pathname.startsWith(`${href}/`) ? "true" : undefined;
}

/** Authenticated app navigation. */
export const appNav = [
  { href: "/app", label: "Tracker", icon: "MessageSquare" },
  { href: "/app/transactions", label: "Transactions", icon: "Table2" },
  { href: "/app/analytics", label: "Analytics", icon: "ChartColumn" },
  { href: "/app/settings", label: "Settings", icon: "Settings" },
] as const;
