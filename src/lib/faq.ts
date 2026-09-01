export type Faq = { q: string; a: string };

/**
 * The shared FAQ, in priority order.
 *
 * Order matters: the homepage renders the first few and `/faq` renders all of
 * them, so the entries most likely to be a visitor's actual question — and the
 * ones worth surfacing as a rich result — belong at the top. Both surfaces also
 * emit `FAQPage` structured data from this same array, which is what keeps the
 * markup and the visible text in step; marking up an answer that isn't on the
 * page is a spam signal, not a shortcut.
 */
export const faqs: Faq[] = [
  {
    q: "Is SpendChat free to use?",
    a: "Yes. SpendChat is completely free for personal use — add unlimited income and expense transactions, filter them, and export or print whenever you like.",
  },
  {
    q: "How do I add a transaction?",
    a: "It works like a chat. Type the amount, pick a category, add an optional note, and send. Your transaction instantly appears in the feed and your balance updates.",
  },
  {
    q: "Can I add many transactions at once?",
    a: "Yes. Use Bulk add to paste multiple rows (for example, from a spreadsheet) in the format amount, note, category, type, date. You get a preview before anything is saved.",
  },
  {
    q: "Can I export, download, or print my transactions?",
    a: "Absolutely. Any filtered view can be downloaded as a CSV file or sent to your printer (or saved as a PDF) with a clean, print-friendly layout.",
  },
  {
    q: "Which currency does SpendChat support?",
    a: "You choose a single currency in Settings and the whole app uses it. Amounts are stored precisely as integer minor units, so there is never any rounding drift.",
  },
  {
    q: "Is my financial data private and secure?",
    a: "Your data is tied to your account and only ever shown to you. Sign-in is handled by Firebase Authentication (Google, or email and password), all input is validated, and the app ships with strict security headers.",
  },
  {
    q: "Do I need to install an app?",
    a: "No installation needed. SpendChat runs in any modern browser and is designed to work smoothly on mobile, tablet, and desktop.",
  },
  {
    q: "Can I filter and search my history?",
    a: "Yes. Filter by date range, type (income or expense), and category, or search your notes — then export exactly what you see.",
  },
  {
    q: "Do I have to connect my bank account?",
    a: "No — SpendChat has no bank integration at all and never asks for banking credentials. You enter transactions yourself, which is what makes it work for cash, for accounts no aggregator supports, and for anyone who would rather not hand a login to a third party.",
  },
  {
    q: "Can the AI add transactions for me?",
    a: "It can read a sentence like “coffee 4.50 and 62 on groceries” and turn it into categorised drafts, but it never saves them for you. Every parse lands in a review step where you can edit or delete any row, and nothing reaches your feed until you confirm.",
  },
  {
    q: "Can I add expenses by speaking?",
    a: "Yes. Hold M and say what you spent; the recording is transcribed and turned into drafts for you to check. You pick which languages to expect in Settings, and because several can be named at once, sentences that mix two languages are transcribed as spoken.",
  },
  {
    q: "Can I keep business and personal expenses separate?",
    a: "Yes, with profiles. Each profile has its own feed, balance and reports, and you switch between them with a click or Shift and a number. There is also an “All profiles” view when you want one combined number.",
  },
  {
    q: "Can I share my expenses with my partner or accountant?",
    a: "Yes. Invite them to a workspace and choose what they can do — view, edit, or administer. Access can be granted for a whole workspace or for a single profile, so an accountant can see your business books and nothing else.",
  },
  {
    q: "Can I attach receipts to a transaction?",
    a: "Yes. Attach receipts, bills or invoices to any transaction, or keep them in a Drive-style vault with folders, colour tags and share links. Every workspace gets 1 GB of storage.",
  },
  {
    q: "Does SpendChat work offline or as an installed app?",
    a: "It runs in any modern browser on phone, tablet and desktop, and you can add it to your home screen. There is no separate download and no app store account needed.",
  },
];
