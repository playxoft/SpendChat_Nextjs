/**
 * Registry of the `/compare/*` pages — "SpendChat vs X", one per product
 * people are already using or searching for. Same idea as `features.ts`: the
 * hub, the sitemap and each page read one list, so a page can't ship without
 * its metadata or be listed before it exists.
 *
 * Every claim on these pages is checked against the competitor's own site or
 * store listing on `verifiedOn`, and the page shows that date. When a
 * competitor changes pricing or features, update the row *and* the date.
 */
export type Comparison = {
  /** Path segment under `/compare` — the competitor, lowercase. */
  slug: string;
  /** The competitor's name as its own site spells it. */
  competitor: string;
  /** `<title>` without the site name (the root template appends " — SpendChat"). */
  title: string;
  /** The page's single `<h1>`, a sentence. */
  h1: string;
  /** Meta description, 50–160 chars. */
  description: string;
  /** One line for the hub card. */
  blurb: string;
  /** ISO date the competitor facts were last checked. */
  verifiedOn: string;
  /** Flip in the same change that adds the page file (see the unit test). */
  published: boolean;
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "splitwise",
    competitor: "Splitwise",
    title: "SpendChat vs Splitwise: Splitting vs Tracking",
    h1: "SpendChat vs Splitwise",
    description:
      "Splitwise settles who owes whom. SpendChat records what you spent, shared or not, with no daily limit and no ads. Which one fits, and when you'd want both.",
    blurb: "Settling up with friends versus knowing where your own money went.",
    verifiedOn: "2026-09-08",
    published: false,
  },
  {
    slug: "walnut",
    competitor: "Walnut",
    title: "SpendChat vs Walnut: Manual vs SMS Tracking",
    h1: "SpendChat vs Walnut",
    description:
      "Walnut read your bank SMS to log spending automatically. SpendChat asks you to type it. What each catches, what each misses, and what happened to Walnut.",
    blurb: "Automatic SMS parsing versus typing it yourself, for Indian users.",
    verifiedOn: "2026-09-08",
    published: false,
  },
  {
    slug: "monefy",
    competitor: "Monefy",
    title: "SpendChat vs Monefy: Manual Trackers Compared",
    h1: "SpendChat vs Monefy",
    description:
      "Both are manual, both are fast. Monefy is a mobile app with a paid Pro tier; SpendChat runs in the browser, is free, open source, and shares a feed with family.",
    blurb: "Two manual trackers: a mobile app with a Pro tier versus a free web app.",
    verifiedOn: "2026-09-08",
    published: false,
  },
  {
    slug: "mint",
    competitor: "Mint",
    title: "SpendChat vs Mint: A Free Alternative",
    h1: "SpendChat vs Mint, and the apps that replaced it",
    description:
      "Mint closed in 2024. If you want free tracking without linking a bank, SpendChat is one option; here's how it compares with Mint and its paid successors.",
    blurb: "Free tracking after Mint, without handing over a bank login.",
    verifiedOn: "2026-09-08",
    published: false,
  },
  {
    slug: "ynab",
    competitor: "YNAB",
    title: "SpendChat vs YNAB: Budgeting vs Tracking",
    h1: "SpendChat vs YNAB",
    description:
      "YNAB is a budgeting method with a subscription. SpendChat is a free record of what you spent. How the two differ, where each wins, and who should pick which.",
    blurb: "A paid budgeting system versus a free record of spending.",
    verifiedOn: "2026-09-08",
    published: false,
  },
];

export function publishedComparisons(from: Comparison[] = COMPARISONS): Comparison[] {
  return from.filter((c) => c.published);
}

export function getComparison(
  slug: string,
  from: Comparison[] = COMPARISONS,
): Comparison | undefined {
  return from.find((c) => c.slug === slug && c.published);
}

export function comparePath(slug: string): string {
  return `/compare/${slug}`;
}
