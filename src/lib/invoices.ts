// Relative imports only (none today): `src/db/schema.ts` reads the enums and
// widths below, and drizzle-kit's schema loader doesn't know the `@/` alias.

/**
 * Invoices and quotes — the rules, pure and client-safe. The server enforces
 * them (`services/invoices.ts`), the UI reads the same values, and the schema
 * takes its enums and column widths from here, so the three can't disagree.
 *
 * - An invoice or quote belongs to a **profile** (and so a workspace): the
 *   normal profile rules decide who reads it (viewer) and who changes it
 *   (editor). A trashed profile hides its invoices like everything else in it.
 * - It is a **draft** until it's finalised. Finalising gives it the next
 *   number in the workspace's series (`INV-0001`, quotes `QUO-0001`) and locks
 *   it. Drafts have no number, so deleting one leaves no gap; a finalised one
 *   is never deleted — it's voided, and keeps its number.
 * - **Money is integer minor units** in the document's own currency, which
 *   may differ from the workspace's. "Mark as paid" records the income in the
 *   workspace's currency, confirmed by the person.
 */

export const INVOICE_KINDS = ["invoice", "quote"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type InvoiceDiscountType = (typeof INVOICE_DISCOUNT_TYPES)[number];

/** What a quote calls itself on the paper. */
export const QUOTE_TITLES = ["quotation", "estimate"] as const;
export type QuoteTitleChoice = (typeof QUOTE_TITLES)[number];

/**
 * Field widths — the column widths and the Zod caps. The same numbers as the
 * free generator's `LIMITS` (`lib/business-doc/invoice.ts` reads them from
 * here), so a draft brought over from the tool always fits.
 */
export const DOC_FIELD_LIMITS = {
  number: 40,
  name: 120,
  address: 400,
  contact: 160,
  taxId: 60,
  email: 160,
  phone: 40,
  website: 200,
  registration: 60,
  bankDetails: 600,
  contactPerson: 120,
  clientNotes: 1000,
  description: 300,
  amount: 40,
  taxLabel: 24,
  notes: 2000,
  terms: 2000,
} as const;

/** A UPI id (`name@bank`) — the payee address a `upi://pay` link carries. */
export const UPI_ID_MAX = 100;
/** Lines on one document (the generator's `MAX_ITEMS`). */
export const INVOICE_ITEMS_MAX = 100;
/** A logo: PNG or JPEG, redrawn in the browser before upload. */
export const INVOICE_LOGO_MAX_BYTES = 300 * 1024;
export const INVOICE_LOGO_TYPES = ["image/png", "image/jpeg"] as const;
export type InvoiceLogoType = (typeof INVOICE_LOGO_TYPES)[number];

/** Number prefixes, one series per kind per workspace. */
export const NUMBER_PREFIX: Record<InvoiceKind, string> = { invoice: "INV-", quote: "QUO-" };

/** `INV-0001`, `QUO-0042`, `INV-12345` — four digits at least, more when the series needs them. */
export function formatInvoiceNumber(kind: InvoiceKind, seq: number): string {
  return `${NUMBER_PREFIX[kind]}${String(seq).padStart(4, "0")}`;
}

/**
 * The visual templates. Every one is free today; the paid add-on (phase 13)
 * adds its own with `tier: "addon"`, and `templatesFor` decides what a
 * workspace may pick. The look of each lives with the renderers
 * (`lib/business-doc/templates.ts`).
 */
export const INVOICE_TEMPLATES = [
  { id: "classic", name: "Classic", tier: "free" },
  { id: "modern", name: "Modern", tier: "free" },
  { id: "bold", name: "Bold", tier: "free" },
  { id: "minimal", name: "Minimal", tier: "free" },
  { id: "compact", name: "Compact", tier: "free" },
] as const satisfies readonly { id: string; name: string; tier: "free" | "addon" }[];
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATES)[number]["id"];
export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = "classic";
/** The widest template id — the column width. */
export const INVOICE_TEMPLATE_MAX = 24;

export function isInvoiceTemplateId(value: unknown): value is InvoiceTemplateId {
  return typeof value === "string" && INVOICE_TEMPLATES.some((t) => t.id === value);
}

/** The templates a workspace on `tier` may use, in catalogue order. */
export function templatesFor(tier: "free" | "addon"): (typeof INVOICE_TEMPLATES)[number][] {
  return INVOICE_TEMPLATES.filter((t) => tier === "addon" || t.tier === "free");
}

// ── What can be done in each state ─────────────────────────────────────────

/** Only a draft changes, and only a draft is deleted — a finalised document is a record. */
export function isEditable(status: InvoiceStatus): boolean {
  return status === "draft";
}

export function canDelete(status: InvoiceStatus): boolean {
  return status === "draft";
}

/** A sent document can be voided; a paid invoice can't (its income entry says it was paid). */
export function canVoid(status: InvoiceStatus): boolean {
  return status === "sent";
}

/**
 * A draft changes freely; a finalised document that isn't paid or void can be
 * edited too — it keeps its number, records when (`edited_at`) and its stored
 * PDF is drawn again. A paid invoice is locked (its income entry is booked),
 * and so is a void one.
 */
export function canEdit(status: InvoiceStatus): boolean {
  return status === "draft" || status === "sent";
}

export function canFinalise(status: InvoiceStatus): boolean {
  return status === "draft";
}

/** Only a sent invoice is paid — a quote never is. */
export function canMarkPaid(kind: InvoiceKind, status: InvoiceStatus): boolean {
  return kind === "invoice" && status === "sent";
}

/** A quote that isn't void becomes a new draft invoice. */
export function canConvert(kind: InvoiceKind, status: InvoiceStatus): boolean {
  return kind === "quote" && status !== "void";
}

/** A link goes out only for a finalised document — a draft can still change. */
export function canShare(status: InvoiceStatus): boolean {
  return status !== "draft";
}

export const KIND_NOUN: Record<InvoiceKind, string> = { invoice: "invoice", quote: "quote" };

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

/**
 * An invoice past its due date that nobody has marked paid. `today` is the
 * viewer's `YYYY-MM-DD`; plain string comparison works on ISO dates.
 */
export function isOverdue(
  doc: { kind: InvoiceKind; status: InvoiceStatus; dueDate: string | null },
  today: string,
): boolean {
  return doc.kind === "invoice" && doc.status === "sent" && doc.dueDate !== null && doc.dueDate < today;
}

/** The first instant of the calendar month (UTC) `now` falls in — the monthly allowance's start. */
export function invoiceMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ── UPI ────────────────────────────────────────────────────────────────────

/** `name@bank` — letters, digits, dots, dashes and underscores, one `@`. */
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return value.length <= UPI_ID_MAX && UPI_ID.test(value);
}

/**
 * The `upi://pay` link a UPI app opens: payee, name, the amount in rupees
 * with paise, and the document number as the note. Only for rupee documents —
 * UPI moves rupees — and only with an amount to pay.
 */
export function upiPayLink({
  upiId,
  payeeName,
  amountMinor,
  currency,
  note,
}: {
  upiId: string;
  payeeName: string;
  amountMinor: number;
  currency: string;
  note: string;
}): string | null {
  if (currency !== "INR" || !isValidUpiId(upiId) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return null;
  }
  const rupees = Math.floor(amountMinor / 100);
  const paise = String(amountMinor % 100).padStart(2, "0");
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName.trim()) params.set("pn", payeeName.trim().slice(0, 50));
  params.set("am", `${rupees}.${paise}`);
  params.set("cu", "INR");
  if (note.trim()) params.set("tn", note.trim().slice(0, 50));
  // URLSearchParams writes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
