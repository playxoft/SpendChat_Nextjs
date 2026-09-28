import type { DocKind, QuoteTitle } from "@/lib/tools/invoice";

/** The terms choice that means "I picked the date myself" (`dueDays: null`). */
export const CUSTOM_TERMS = "custom";

/** The words that differ between an invoice, a quotation and an estimate — everything else is shared. */
export type DocLabels = {
  /** Lowercase, mid-sentence: "invoice", "quotation", "estimate". */
  noun: string;
  /** On the paper, as the document's heading. */
  title: string;
  numberLabel: string;
  numberShort: string;
  issue: string;
  due: string;
  /** Legend of the payment-terms / validity quick picks. */
  termsPicker: string;
  termOptions: readonly { value: string; label: string }[];
  to: string;
  notes: string;
  notesPlaceholder: string;
  newDoc: string;
  slug: "invoice-generator" | "quotation-generator";
};

export function docLabels(kind: DocKind, quoteTitle: QuoteTitle): DocLabels {
  if (kind === "invoice") {
    return {
      noun: "invoice",
      title: "Invoice",
      numberLabel: "Invoice number",
      numberShort: "Invoice no.",
      issue: "Issue date",
      due: "Due date",
      termsPicker: "Payment terms",
      termOptions: [
        { value: "0", label: "On receipt" },
        { value: "7", label: "Net 7" },
        { value: "15", label: "Net 15" },
        { value: "30", label: "Net 30" },
        { value: CUSTOM_TERMS, label: "Custom" },
      ],
      to: "Bill to",
      notes: "Notes / payment details",
      notesPlaceholder: "Bank account, UPI ID or payment link — and a thank-you",
      newDoc: "New invoice",
      slug: "invoice-generator",
    };
  }
  const title = quoteTitle === "estimate" ? "Estimate" : "Quotation";
  return {
    noun: title.toLowerCase(),
    title,
    numberLabel: `${title} number`,
    numberShort: `${title} no.`,
    issue: "Date",
    due: "Valid until",
    termsPicker: "Valid for",
    termOptions: [
      { value: "15", label: "15 days" },
      { value: "30", label: "30 days" },
      { value: "60", label: "60 days" },
      { value: "90", label: "90 days" },
      { value: CUSTOM_TERMS, label: "Custom" },
    ],
    to: "Prepared for",
    notes: "Notes",
    notesPlaceholder: "What's included, timelines, anything the client should know",
    newDoc: `New ${title.toLowerCase()}`,
    slug: "quotation-generator",
  };
}
