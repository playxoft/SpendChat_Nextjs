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

/** Authenticated app navigation. */
export const appNav = [
  { href: "/app", label: "Tracker", icon: "MessageSquare" },
  { href: "/app/transactions", label: "Transactions", icon: "Table2" },
  { href: "/app/analytics", label: "Analytics", icon: "ChartColumn" },
  { href: "/app/settings", label: "Settings", icon: "Settings" },
] as const;
