import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { minorToInputString, toMinorUnits } from "@/lib/money";
import { formatAmountInput } from "@/lib/parse-amount";
import {
  MAX_MINOR,
  QTY_DECIMALS,
  calculateTotals,
  lineAmountMinor,
  type BusinessDoc,
  type DocEvaluation,
  type ItemResult,
  type Totals,
} from "@/lib/business-doc/invoice";
import { buildDocView } from "@/lib/business-doc/doc-view";
import type { DocPayment, DocView } from "@/lib/business-doc/invoice-pdf";
import { docLabels } from "@/lib/business-doc/labels";
import { qrMatrix } from "@/lib/business-doc/qr";
import { docTheme } from "@/lib/business-doc/templates";
import { daysBetween } from "@/lib/tools/date-math";
import { parseNumber } from "@/lib/tools/format";
import {
  upiPayLink,
  type InvoiceDiscountType,
  type InvoiceKind,
  type InvoiceStatus,
  type InvoiceTemplateId,
  type QuoteTitleChoice,
} from "@/lib/invoices";

/**
 * The bridge between an invoice as stored (integer minor units, exact
 * quantities) and the generator's document model (`BusinessDoc`: the fields
 * as typed, in the reader's number format) — so the app's editor, paper and
 * PDF are the free tool's own components rather than a copy. Pure and
 * client-safe.
 *
 * The server never trusts typed text: the editor turns its document into
 * plain numbers (`docToInvoiceInput`) and the server re-totals them with the
 * same engine (`computeInvoiceFigures`).
 */

/** One line as the client sends it: quantity and unit price as plain numbers (price in major units). */
export type InvoiceItemInput = { description: string; quantity: number; unitPrice: number };

/** A draft's editable content, as the editor and the API send it. */
export type InvoiceContentInput = {
  profileId?: string;
  clientId?: string | null;
  client: { name: string; email?: string | null; address?: string | null; taxId?: string | null };
  sellerId?: string | null;
  seller: { name: string; address?: string | null; contact?: string | null; taxId?: string | null };
  upiId?: string | null;
  quoteTitle?: QuoteTitleChoice;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  items: InvoiceItemInput[];
  discountType?: InvoiceDiscountType;
  /** Percent (0–100) or a fixed amount in major units, by `discountType`. */
  discount?: number;
  taxLabel?: string | null;
  taxRate?: number;
  notes?: string | null;
  terms?: string | null;
  template?: InvoiceTemplateId;
};

/** A line as stored and served. */
export type InvoiceItemDTO = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
};

/** An invoice or quote as the app and the API see it. */
export type InvoiceDTO = {
  id: string;
  profileId: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  /** Null until finalised. */
  number: string | null;
  quoteTitle: QuoteTitleChoice;
  clientId: string | null;
  client: { name: string; email: string | null; address: string | null; taxId: string | null };
  sellerId: string | null;
  seller: { name: string; address: string | null; contact: string | null; taxId: string | null };
  upiId: string | null;
  /** The seller has a logo (served from the seller). */
  hasLogo: boolean;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  discountType: InvoiceDiscountType;
  /** Percent when `discountType` is percent. */
  discountRate: number;
  discountFixedMinor: number;
  taxLabel: string | null;
  taxRate: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  terms: string | null;
  template: InvoiceTemplateId;
  showCredit: boolean;
  /** A PDF snapshot is stored (finalised documents). */
  hasPdf: boolean;
  sourceQuoteId: string | null;
  sentAt: string | null;
  paidAt: string | null;
  paidOn: string | null;
  paidTransactionId: string | null;
  /** In the workspace's currency. */
  paidAmountMinor: number | null;
  voidedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemDTO[];
};

/** The figures the server stores for a set of lines, discount and tax. */
export type InvoiceFigures = { lines: number[]; totals: Totals };

/**
 * Line amounts and totals, in minor units — the generator's engine, so the app
 * and the tool can't add up differently. Null when a figure would pass what a
 * document can hold exactly.
 */
export function computeInvoiceFigures({
  items,
  discountType,
  discountRate,
  discountFixedMinor,
  taxRate,
}: {
  items: { quantity: number; unitPriceMinor: number }[];
  discountType: InvoiceDiscountType;
  discountRate: number;
  discountFixedMinor: number;
  taxRate: number;
}): InvoiceFigures | null {
  const lines: number[] = [];
  for (const item of items) {
    const amount = lineAmountMinor(item.quantity, item.unitPriceMinor);
    if (amount === null) return null;
    lines.push(amount);
  }
  const totals = calculateTotals({
    lines,
    discount:
      discountType === "percent"
        ? { type: "percent", value: discountRate }
        : { type: "fixed", value: discountFixedMinor },
    taxRate,
  });
  return totals ? { lines, totals } : null;
}

/** A quantity, rounded to the four decimals a line keeps. */
export function roundQuantity(qty: number): number {
  const scale = 10 ** QTY_DECIMALS;
  return Math.round(qty * scale) / scale;
}

/** Major units → minor units of `currency`, or null when it isn't a usable amount. */
export function priceToMinor(major: number, currency: string): number | null {
  if (!Number.isFinite(major) || major < 0) return null;
  const minor = toMinorUnits(major, currency);
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

// ── Editor document → input ────────────────────────────────────────────────

export type DocInputResult = { ok: true; input: InvoiceContentInput } | { ok: false; error: string };

/**
 * The editor's document as the plain numbers the server takes — every typed
 * figure read in the editor's number format. A blank row (no description, no
 * price) is left out; a row with an unreadable figure stops the save with a
 * message rather than being dropped.
 */
export function docToInvoiceInput(
  doc: BusinessDoc,
  {
    currency,
    locale,
    dates,
    extra,
  }: {
    currency: string;
    locale: string;
    dates: { issue: string | null; due: string | null };
    extra: Pick<InvoiceContentInput, "profileId" | "clientId" | "sellerId" | "upiId" | "template">;
  },
): DocInputResult {
  const items: InvoiceItemInput[] = [];
  for (const [i, item] of doc.items.entries()) {
    if (!item.description.trim() && !item.price.trim()) continue;
    const qty = item.qty.trim() ? parseNumber(item.qty, locale) : 1;
    const price = item.price.trim() ? parseNumber(item.price, locale) : 0;
    if (qty === null || qty < 0) return { ok: false, error: `Check the quantity on line ${i + 1}.` };
    if (price === null || price < 0) return { ok: false, error: `Check the unit price on line ${i + 1}.` };
    items.push({ description: item.description.trim(), quantity: roundQuantity(qty), unitPrice: price });
  }
  const discount = doc.discount.trim() ? parseNumber(doc.discount, locale) : 0;
  if (discount === null || discount < 0) return { ok: false, error: "Check the discount." };
  const taxRate = doc.taxRate.trim() ? parseNumber(doc.taxRate, locale) : 0;
  if (taxRate === null || taxRate < 0 || taxRate > 100) return { ok: false, error: "Check the tax rate." };
  if (!dates.issue) return { ok: false, error: "Pick the issue date." };

  return {
    ok: true,
    input: {
      ...extra,
      client: {
        name: doc.to.name.trim(),
        email: doc.to.email.trim() || null,
        address: doc.to.address.trim() || null,
        taxId: doc.to.taxId?.trim() || null,
      },
      seller: {
        name: doc.from.name.trim(),
        address: doc.from.address.trim() || null,
        contact: doc.from.contact.trim() || null,
        taxId: doc.from.taxId.trim() || null,
      },
      quoteTitle: doc.quoteTitle,
      issueDate: dates.issue,
      dueDate: dates.due,
      currency,
      items,
      discountType: doc.discountType,
      discount,
      taxLabel: doc.taxLabel.trim() || null,
      taxRate,
      notes: doc.notes.trim() || null,
      terms: doc.kind === "quotation" ? doc.terms.trim() || null : null,
    },
  };
}

// ── Stored invoice → editor / paper ────────────────────────────────────────

/** The generator's word for each kind. */
export const DOC_KIND: Record<InvoiceKind, BusinessDoc["kind"]> = { invoice: "invoice", quote: "quotation" };

/** Payment-term picks the editor's chips offer, by kind (the generator's `labels`). */
const TERM_CHIPS: Record<InvoiceKind, number[]> = { invoice: [0, 7, 15, 30], quote: [15, 30, 60, 90] };

/**
 * An invoice as the generator's document, its figures written in `locale`'s
 * format so they read (and re-parse) the way the person types them. `logo` is
 * the URL the paper should draw, when there is one.
 */
export function invoiceToDoc(
  invoice: Omit<InvoiceDTO, "items"> & { items: Omit<InvoiceItemDTO, "position">[] },
  { locale, logo = null }: { locale: string; logo?: string | null },
): BusinessDoc {
  const currency = isSupportedCurrency(invoice.currency) ? invoice.currency : "USD";
  const decimals = getCurrency(currency).decimals;
  const gap = invoice.dueDate ? daysBetween(invoice.issueDate, invoice.dueDate) : null;
  const dueDays = gap !== null && TERM_CHIPS[invoice.kind].includes(gap) ? gap : null;
  return {
    kind: DOC_KIND[invoice.kind],
    quoteTitle: invoice.quoteTitle,
    number: invoice.number ?? "",
    issueDate: invoice.issueDate,
    dueDays: invoice.dueDate ? dueDays : null,
    dueDate: invoice.dueDate && dueDays === null ? invoice.dueDate : "",
    from: {
      name: invoice.seller.name,
      address: invoice.seller.address ?? "",
      contact: invoice.seller.contact ?? "",
      taxId: invoice.seller.taxId ?? "",
    },
    to: {
      name: invoice.client.name,
      address: invoice.client.address ?? "",
      email: invoice.client.email ?? "",
      taxId: invoice.client.taxId ?? "",
    },
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      qty: formatAmountInput(item.quantity, locale, QTY_DECIMALS),
      price: minorToInputString(item.unitPriceMinor, currency, locale),
    })),
    discountType: invoice.discountType,
    discount:
      invoice.discountType === "percent"
        ? invoice.discountRate > 0
          ? formatAmountInput(invoice.discountRate, locale, 4)
          : ""
        : invoice.discountFixedMinor > 0
          ? formatAmountInput(invoice.discountFixedMinor / 10 ** decimals, locale, decimals)
          : "",
    taxLabel: invoice.taxLabel ?? "",
    taxRate: invoice.taxRate > 0 ? formatAmountInput(invoice.taxRate, locale, 4) : "",
    notes: invoice.notes ?? "",
    terms: invoice.terms ?? "",
    logo,
    currency,
    credit: invoice.showCredit,
  };
}

/**
 * The paper's figures straight from what's stored — not re-worked from text —
 * so a finalised document shows exactly the amounts it was issued with.
 */
export function invoiceEvaluation(invoice: Pick<
  InvoiceDTO,
  | "items"
  | "discountType"
  | "discountRate"
  | "taxRate"
  | "subtotalMinor"
  | "discountMinor"
  | "taxMinor"
  | "totalMinor"
  | "discountFixedMinor"
>): DocEvaluation {
  const items: ItemResult[] = invoice.items.map((item) => ({
    qty: item.quantity,
    unitMinor: item.unitPriceMinor,
    amountMinor: item.amountMinor,
    qtyError: null,
    priceError: null,
    blank: false,
  }));
  return {
    items,
    discountError: null,
    taxError: null,
    discountPercent: invoice.discountType === "percent" ? invoice.discountRate : null,
    taxRate: invoice.taxRate,
    totals: {
      subtotal: invoice.subtotalMinor,
      discount: invoice.discountMinor,
      taxable: invoice.subtotalMinor - invoice.discountMinor,
      tax: invoice.taxMinor,
      total: invoice.totalMinor,
      discountCapped: false,
    },
  };
}

/** The document's dates as the paper reads them. */
export function invoiceDates(invoice: Pick<InvoiceDTO, "issueDate" | "dueDate">): {
  issue: string;
  due: string | null;
} {
  return { issue: invoice.issueDate, due: invoice.dueDate };
}

/**
 * The pay-by-UPI block for a rupee invoice with a UPI id and something to pay
 * — null for a quote, another currency, a paid or void invoice, or no UPI id.
 */
export function invoicePayment(
  invoice: Pick<InvoiceDTO, "kind" | "status" | "currency" | "upiId" | "seller" | "totalMinor" | "number">,
): DocPayment | null {
  if (invoice.kind !== "invoice" || invoice.status === "paid" || invoice.status === "void" || !invoice.upiId) {
    return null;
  }
  const link = upiPayLink({
    upiId: invoice.upiId,
    payeeName: invoice.seller.name,
    amountMinor: invoice.totalMinor,
    currency: invoice.currency,
    note: invoice.number ? `Invoice ${invoice.number}` : "Invoice",
  });
  if (!link) return null;
  return { label: "Pay by UPI", upiId: invoice.upiId, qr: qrMatrix(link) };
}

/** A safe download name: `INV-0007.pdf`, or `draft-invoice.pdf` before it has a number. */
export function invoicePdfName(invoice: Pick<InvoiceDTO, "number" | "kind">): string {
  const base = (invoice.number ?? "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 60);
  return `${base || `draft-${invoice.kind}`}.pdf`;
}

/**
 * Everything a stored document says, as display strings — what the PDF is
 * drawn from (`buildDocView`, the generator's own). A draft reads "Draft" where
 * its number will go.
 */
export function invoiceDocView(invoice: InvoiceDTO, locale: string): DocView {
  const doc = invoiceToDoc(invoice, { locale });
  const view = buildDocView({
    doc,
    labels: docLabels(DOC_KIND[invoice.kind], invoice.quoteTitle),
    evaluation: invoiceEvaluation(invoice),
    dates: invoiceDates(invoice),
    currency: doc.currency ?? invoice.currency,
    locale,
    theme: docTheme(invoice.template),
    payment: invoicePayment(invoice),
  });
  return {
    ...view,
    fileName: invoicePdfName(invoice),
    meta: invoice.number ? view.meta : view.meta.map((m, i) => (i === 0 ? { ...m, value: "Draft" } : m)),
  };
}
