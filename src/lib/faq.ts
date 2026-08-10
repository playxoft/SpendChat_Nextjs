export type Faq = { q: string; a: string };

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
];
