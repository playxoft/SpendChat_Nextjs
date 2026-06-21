export const siteConfig = {
  name: "MoneyTracker",
  domain: "moneytracker.playxoft.com",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://moneytracker.playxoft.com").replace(
    /\/$/,
    "",
  ),
  tagline: "Track your money like a conversation.",
  description:
    "A minimal, fast, and private money tracker. Add income and expenses in seconds with a chat-style tracker, then filter, download, and print whenever you need. Free to use.",
  author: "Playxoft",
  ogImage: "/opengraph-image.png",
  keywords: [
    "money tracker",
    "expense tracker",
    "budget app",
    "personal finance",
    "income and expense tracker",
    "spending tracker",
    "free expense tracker",
    "finance app",
  ],
  /** AGPL-3.0; source is public. */
  license: "AGPL-3.0",
  links: {
    twitter: "https://twitter.com/",
    github: "https://github.com/rnithin133/MoneyTracker_Nextjs",
  },
} as const;

/** Marketing site navigation. Kept short so the capsule nav stays mobile-friendly. */
export const marketingNav = [
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
] as const;

/** Authenticated app navigation. */
export const appNav = [
  { href: "/app", label: "Tracker", icon: "MessageSquare" },
  { href: "/transactions", label: "Transactions", icon: "Table2" },
  { href: "/analytics", label: "Analytics", icon: "ChartColumn" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;
