/**
 * The situations SpendChat is built for — the "Who it's for" wall on the home
 * page, and the spotlight block at the foot of each `/features/*` page.
 *
 * **These are scenarios, not testimonials, and the distinction is load-bearing.**
 * Every entry describes a situation the product is for; none is attributed to a
 * person, because none came from one. We have no customer quotes yet, and
 * inventing them — a name, a face, a grateful sentence — is the same class of
 * mistake as inventing an `aggregateRating`, which the home page's JSON-LD
 * deliberately omits for exactly this reason. The FTC's 2024 Rule on Consumer
 * Reviews and Testimonials makes fabricated endorsements directly actionable,
 * stock-photo licences carve out implied endorsement, and a product whose pitch
 * is "private, open source, we don't guess at your data" cannot afford to be
 * caught having guessed at its own customers. The repo is public; the commit
 * would be too.
 *
 * So the copy never says "I love this". It says what the situation is. When
 * real quotes arrive, they belong in their own module with a name, a date and
 * written consent — not here.
 *
 * Deliberately dependency-free, matching `src/lib/features.ts`: icons are named
 * as strings and resolved in `scenario-icon.tsx`, so this file stays importable
 * from anywhere without pulling in React or `lucide-react`.
 */

export type Scenario = {
  /** Stable key — React list key, and the anchor for the deterministic accent. */
  id: string;
  /** Lucide icon name, resolved by `ScenarioIcon`. */
  icon: string;
  /** The situation, in two or three words. Doubles as the card's heading. */
  label: string;
  /** Where it's happening. Real places, because "Global" describes nobody. */
  place: string;
  /** The vignette. Length varies on purpose — see the note below. */
  body: string;
};

/**
 * The home-page wall.
 *
 * Lengths are deliberately uneven. A masonry column of identical blocks reads
 * as a table of contents; the ragged bottom edge is what makes it read as a
 * wall of distinct situations, and it's why these are laid out in CSS columns
 * rather than a grid with fixed rows. Ordering matters too — the flow is
 * column-major, so a long entry early in the list pushes its neighbours down
 * and stops the three columns from lining up like a 3×3.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "flatshare",
    icon: "Users",
    label: "Three flatmates, one kitty",
    place: "Bengaluru",
    body: "Rent, the gas cylinder, the internet bill, and the Sunday grocery run. Everyone pays for something and nobody writes it down, so the month ends in an argument about who owes what. A shared workspace means the ledger is the same ledger for all three of you.",
  },
  {
    id: "freelance-tax",
    icon: "Download",
    label: "Filing season",
    place: "Melbourne",
    body: "You've been mixing business and personal in one account all year because separating them felt like admin you'd do later. Later is now, and your accountant wants a CSV of just the business side. Keep them in separate profiles from the start and the export is one filter and a download, not a weekend.",
  },
  {
    id: "market-cash",
    icon: "ShieldCheck",
    label: "Cash all day",
    place: "Lagos",
    body: "Market stalls, transport, the woman who sells bread by the junction. None of it touches a card, so no bank-linked app can see any of it.",
  },
  {
    id: "two-incomes",
    icon: "Building2",
    label: "Shared, but not merged",
    place: "Toronto",
    body: "A joint profile for the household — rent, groceries, the car — and a private one each for everything that is nobody else's business. Same account, two different levels of together.",
  },
  {
    id: "code-mixed",
    icon: "Mic",
    label: "Two languages, one sentence",
    place: "Manila",
    body: "You don't think about money in one language. \"Pang-grocery, three fifty\" is how the sentence actually comes out, and most voice input either mangles it or transliterates half of it into nonsense. Naming both languages up front is what makes the transcript come back the way you said it.",
  },
  {
    id: "spreadsheet-years",
    icon: "Table2",
    label: "Four years of spreadsheet",
    place: "Berlin",
    body: "You don't want to start over. Paste the whole thing in, check the rows, keep the history.",
  },
  {
    id: "accountant-access",
    icon: "Users",
    label: "The accountant sees the books",
    place: "Austin",
    body: "Handing someone your login so they can do the quarterly is the sort of thing you only regret once. Invite them to the business profile instead: they get what they need to file, they don't get the personal account, and you can take the access back the day the work is done without changing a single password.",
  },
  {
    id: "small-amounts",
    icon: "Keyboard",
    label: "₹40, and it counts",
    place: "Nairobi",
    body: "If logging a coffee takes longer than buying it, you stop logging coffees — and the small stuff is exactly where the month disappears.",
  },
  {
    id: "parents-money",
    icon: "Building2",
    label: "Your money and theirs",
    place: "Kochi",
    body: "You handle your father's pharmacy bills and hospital trips alongside your own spending. One profile for his, one for yours, and the two totals never contaminate each other — which matters when somebody eventually asks you to account for his.",
  },
  {
    id: "per-trip",
    icon: "ChartColumn",
    label: "A profile per trip",
    place: "Singapore",
    body: "Ten days away smears across two monthly totals and both of them look wrong afterwards. Give the trip its own profile and the number is clean when you get home.",
  },
  {
    id: "warranty",
    icon: "Paperclip",
    label: "The receipt, eighteen months later",
    place: "Dublin",
    body: "The washing machine dies just inside warranty. The receipt is attached to the transaction, where you'd actually think to look for it.",
  },
  {
    id: "categories-honest",
    icon: "Tags",
    label: "\"Uncategorised: ₹18,400\"",
    place: "São Paulo",
    body: "Every tracker ends up with one bucket swallowing a third of the spending, and at that point the chart is decoration. Fewer categories that you'll actually pick beats a taxonomy you abandon in week three.",
  },
  {
    id: "fast-entry",
    icon: "Keyboard",
    label: "Between two meetings",
    place: "Leeds",
    body: "Hit a key, type it, it's in. No mouse, no modal, no six-field form.",
  },
  {
    id: "messy-sentence",
    icon: "Sparkles",
    label: "\"Lunch 320 and petrol 1100\"",
    place: "Jakarta",
    body: "One sentence, two transactions, and you shouldn't have to fill a form twice to record it. The model drafts both as editable rows; you glance, fix the one it got wrong, and confirm. Nothing saves until you say so, which is the part that stops a misheard merchant becoming a number you trust six months later.",
  },
  {
    id: "where-did-it-go",
    icon: "ChartColumn",
    label: "The end-of-month question",
    place: "Chicago",
    body: "You know roughly what came in and you know the balance is lower than it should be, and the gap between those two facts is the whole problem. A breakdown by category answers it in about four seconds — usually with something mildly embarrassing at the top.",
  },
  {
    id: "print-it",
    icon: "Download",
    label: "Somebody wants it on paper",
    place: "Wellington",
    body: "A landlord, a claim, a visa application. Filter to the range, print, done.",
  },
];

/**
 * The spotlight block at the foot of a feature page, keyed by feature slug.
 *
 * One to three per page, written against that specific feature so the block
 * earns its place instead of repeating the home page. A slug with no entry
 * simply renders nothing, so this can fill in page by page.
 */
export const FEATURE_SCENARIOS: Record<string, Scenario[]> = {
  "chat-expense-tracker": [
    {
      id: "chat-habit",
      icon: "MessageSquare",
      label: "The habit survives the week",
      place: "Pune",
      body: "Most tracking apps die in week two, and it's almost never the reporting that kills them — it's the six-field form standing between you and a ₹60 auto ride. Typing it the way you'd text it keeps the entry cheap enough that you still do it on a bad day.",
    },
    {
      id: "chat-backlog",
      icon: "MessageSquare",
      label: "Catching up on Sunday",
      place: "Manchester",
      body: "Four days of spending, remembered in one sitting. A line each, in the order it comes back to you, with the dates fixed afterwards.",
    },
  ],
  "ai-expense-tracker": [
    {
      id: "ai-review",
      icon: "Sparkles",
      label: "Drafts, not decisions",
      place: "Hyderabad",
      body: "The useful question about an AI tracker isn't whether it categorises correctly — it usually does. It's what happens the time it doesn't. A draft you confirm costs five seconds to correct; a transaction filed silently into the wrong category becomes a total you won't question for months.",
    },
    {
      id: "ai-bulk-sentence",
      icon: "Sparkles",
      label: "A whole afternoon in one line",
      place: "Rotterdam",
      body: "\"Groceries 2400, chemist 310, parking 80.\" Three rows come back editable, and the two that are right need no attention at all.",
    },
  ],
  "voice-expense-tracker": [
    {
      id: "voice-hands-full",
      icon: "Mic",
      label: "Hands full, still logging",
      place: "Chennai",
      body: "Bags in both hands on the walk back from the shop is exactly when the amount is freshest and typing is least possible. Hold the key, say it, let the text land in the note for you to check before anything is saved.",
    },
    {
      id: "voice-mixed",
      icon: "Mic",
      label: "Nobody speaks one language about money",
      place: "Kuala Lumpur",
      body: "Half the sentence in English, the number in another language, a merchant name that belongs to neither. Naming the languages you actually speak is what keeps the transcript from transliterating the rest into confident nonsense.",
    },
  ],
  "bulk-add": [
    {
      id: "bulk-migration",
      icon: "ListPlus",
      label: "Bringing the history with you",
      place: "Warsaw",
      body: "Six years of a spreadsheet you've maintained by hand is not something you abandon to try a new app. Paste it in, check what parsed, and keep the history that made the spreadsheet worth maintaining in the first place.",
    },
  ],
  transactions: [
    {
      id: "txn-find",
      icon: "Table2",
      label: "\"When did we pay the plumber?\"",
      place: "Valencia",
      body: "Somewhere in eleven hundred rows is the one you need, and you remember roughly the month and roughly the amount. Filter, sort, done — without scrolling.",
    },
  ],
  analytics: [
    {
      id: "analytics-gap",
      icon: "ChartColumn",
      label: "Where the month went",
      place: "Cape Town",
      body: "The balance says one thing and your memory of the month says another. A category breakdown closes that gap quickly, and it tends to close it with one line item you'd rather it hadn't.",
    },
  ],
  "receipts-and-files": [
    {
      id: "files-warranty",
      icon: "Paperclip",
      label: "Proof, eighteen months on",
      place: "Oslo",
      body: "A warranty claim needs the receipt for a purchase you barely remember making. Attached to the transaction, it's where you'd think to look — rather than in a photo roll with four thousand other pictures.",
    },
    {
      id: "files-claim",
      icon: "Paperclip",
      label: "The expense claim",
      place: "Vancouver",
      body: "Bills, invoices and the one crumpled receipt from the taxi, all hanging off the rows they belong to instead of a folder called \"scans final v2\".",
    },
  ],
  "export-and-print": [
    {
      id: "export-accountant",
      icon: "Download",
      label: "What the accountant asked for",
      place: "Brisbane",
      body: "Not everything — just the business profile, just this financial year, as a file that opens in whatever they use. Filter first and the export needs no trimming afterwards, which is the step people usually do by hand at 11pm.",
    },
  ],
  "multiple-profiles": [
    {
      id: "profiles-separate",
      icon: "Building2",
      label: "Two lives, one login",
      place: "Lisbon",
      body: "Freelance work on one side, the household on the other, and a total each that stays honest because the two never mix.",
    },
    {
      id: "profiles-trip",
      icon: "Building2",
      label: "The trip, on its own",
      place: "Reykjavík",
      body: "Ten days abroad distorts two monthly totals and leaves both of them useless for comparison. Its own profile keeps the holiday out of the baseline.",
    },
  ],
  workspaces: [
    {
      id: "ws-revoke",
      icon: "Users",
      label: "Access you can take back",
      place: "Dubai",
      body: "Sharing a login means sharing everything and changing a password to undo it. A per-profile invite means the bookkeeper sees the books, never the personal account, and removing them is one click rather than a security exercise.",
    },
    {
      id: "ws-household",
      icon: "Users",
      label: "The household ledger",
      place: "Auckland",
      body: "Two people entering into the same shared set of books, each from their own account, with no spreadsheet being emailed back and forth.",
    },
  ],
  categories: [
    {
      id: "cat-fewer",
      icon: "Tags",
      label: "The Uncategorised pile",
      place: "Bogotá",
      body: "Forty categories feels thorough right up until the point where the biggest one is the one you never chose. Fewer, blunter buckets you'll actually pick beat a taxonomy that quietly stops being used in week three.",
    },
  ],
  "keyboard-shortcuts": [
    {
      id: "keys-speed",
      icon: "Keyboard",
      label: "Faster than reaching for the mouse",
      place: "Tallinn",
      body: "One key opens it, one key sends it. Logging a coffee shouldn't cost more attention than drinking it.",
    },
  ],
  "privacy-and-security": [
    {
      id: "privacy-nobank",
      icon: "ShieldCheck",
      label: "No bank login, by design",
      place: "Munich",
      body: "Handing a third party read access to your account is a permanent risk taken for a convenience you may not need. Nothing here asks for it — and the cash spending a bank feed can't see is recorded either way.",
    },
    {
      id: "privacy-open",
      icon: "ShieldCheck",
      label: "Readable by anyone who cares to",
      place: "Helsinki",
      body: "The whole application is AGPL-3.0 and public, so \"we don't sell your data\" is a claim you can check against the source rather than take on trust.",
    },
  ],
};

/** The spotlight entries for a feature page, or `[]` when none are written yet. */
export function scenariosForFeature(slug: string): Scenario[] {
  return FEATURE_SCENARIOS[slug] ?? [];
}
