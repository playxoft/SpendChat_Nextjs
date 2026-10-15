import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  invoiceClients,
  invoiceItems,
  invoiceSellers,
  invoices,
  profiles,
  type InvoiceClientRow,
  type InvoiceItemRow,
  type InvoiceRow,
  type InvoiceSellerRow,
} from "@/db/schema";
import type { InvoiceDTO, InvoiceItemDTO } from "@/lib/invoice-doc";
import { isInvoiceTemplateId, type InvoiceKind, type InvoiceStatus } from "@/lib/invoices";
import { accessibleProfileIds } from "@/lib/workspaces";

/**
 * Invoice reads, every one scoped to the profiles the caller can read in the
 * workspace (`accessibleProfileIds`, which also hides trashed profiles — and so
 * everything in them). An id outside that scope reads as not found. Writes
 * live in `services/invoices.ts`.
 */

export type InvoiceClientDTO = {
  id: string;
  profileId: string;
  name: string;
  email: string | null;
  address: string | null;
  taxId: string | null;
  phone: string | null;
  /** Printed as "Attn: …". */
  contactPerson: string | null;
  /** Private — never printed. */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceSellerDTO = {
  id: string;
  profileId: string;
  name: string;
  address: string | null;
  /** The email line (any contact line, for details saved before there was a phone). */
  contact: string | null;
  taxId: string | null;
  upiId: string | null;
  phone: string | null;
  website: string | null;
  registrationNumber: string | null;
  bankDetails: string | null;
  hasLogo: boolean;
  /** Changes whenever the logo does — a cache key for its URL. */
  logoVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A row of the invoices list — no lines. */
export type InvoiceSummaryDTO = {
  id: string;
  profileId: string;
  profileName: string | null;
  profileIcon: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  number: string | null;
  clientId: string | null;
  clientName: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  totalMinor: number;
  paidAmountMinor: number | null;
  sourceQuoteId: string | null;
  sentAt: string | null;
  /** The last edit after it was finalised, or null. */
  editedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const iso = (v: Date | string | null): string | null => (v === null ? null : v instanceof Date ? v.toISOString() : String(v));
const isoReq = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

export function serializeInvoiceClient(row: InvoiceClientRow): InvoiceClientDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    email: row.email,
    address: row.address,
    taxId: row.taxId,
    phone: row.phone,
    contactPerson: row.contactPerson,
    notes: row.notes,
    createdAt: isoReq(row.createdAt),
    updatedAt: isoReq(row.updatedAt),
  };
}

export function serializeInvoiceSeller(row: InvoiceSellerRow): InvoiceSellerDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    address: row.address,
    contact: row.contact,
    taxId: row.taxId,
    upiId: row.upiId,
    phone: row.phone,
    website: row.website,
    registrationNumber: row.registrationNumber,
    bankDetails: row.bankDetails,
    hasLogo: row.logoKey !== null,
    logoVersion: row.logoKey ? (row.logoKey.split("/").pop() ?? null) : null,
    createdAt: isoReq(row.createdAt),
    updatedAt: isoReq(row.updatedAt),
  };
}

export function serializeInvoiceItem(row: InvoiceItemRow): InvoiceItemDTO {
  return {
    id: row.id,
    position: row.position,
    description: row.description,
    quantity: Number(row.quantity),
    unitPriceMinor: row.unitPriceMinor,
    amountMinor: row.amountMinor,
  };
}

export function serializeInvoice(row: InvoiceRow, items: InvoiceItemRow[], hasLogo: boolean): InvoiceDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    kind: row.kind,
    status: row.status,
    number: row.number,
    quoteTitle: row.quoteTitle === "estimate" ? "estimate" : "quotation",
    clientId: row.clientId,
    client: {
      name: row.clientName,
      email: row.clientEmail,
      address: row.clientAddress,
      taxId: row.clientTaxId,
      phone: row.clientPhone,
      contactPerson: row.clientContactPerson,
    },
    sellerId: row.sellerId,
    seller: {
      name: row.sellerName,
      address: row.sellerAddress,
      contact: row.sellerContact,
      taxId: row.sellerTaxId,
      phone: row.sellerPhone,
      website: row.sellerWebsite,
      registrationNumber: row.sellerRegistrationNumber,
      bankDetails: row.sellerBankDetails,
    },
    upiId: row.upiId,
    hasLogo,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    currency: row.currency,
    discountType: row.discountType,
    discountRate: Number(row.discountRate),
    discountFixedMinor: row.discountFixedMinor,
    taxLabel: row.taxLabel,
    taxRate: Number(row.taxRate),
    subtotalMinor: row.subtotalMinor,
    discountMinor: row.discountMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    notes: row.notes,
    terms: row.terms,
    template: isInvoiceTemplateId(row.template) ? row.template : "classic",
    showCredit: row.showCredit,
    hasPdf: row.pdfKey !== null,
    sourceQuoteId: row.sourceQuoteId,
    sentAt: iso(row.sentAt),
    editedAt: iso(row.editedAt),
    paidAt: iso(row.paidAt),
    paidOn: row.paidOn,
    paidTransactionId: row.paidTransactionId,
    paidAmountMinor: row.paidAmountMinor,
    voidedAt: iso(row.voidedAt),
    createdBy: row.createdBy,
    createdAt: isoReq(row.createdAt),
    updatedAt: isoReq(row.updatedAt),
    items: [...items].sort((a, b) => a.position - b.position).map(serializeInvoiceItem),
  };
}

// ── Clients ────────────────────────────────────────────────────────────────

/** Saved clients the caller can read, by name; `profileId` narrows to one profile. */
export async function listInvoiceClients(
  userId: string,
  workspaceId: string,
  profileId?: string | null,
): Promise<InvoiceClientDTO[]> {
  const rows = await getDb()
    .select()
    .from(invoiceClients)
    .where(
      and(
        inArray(invoiceClients.profileId, accessibleProfileIds(userId, workspaceId)),
        profileId ? eq(invoiceClients.profileId, profileId) : undefined,
      ),
    )
    .orderBy(asc(invoiceClients.name), asc(invoiceClients.id))
    .limit(1000);
  return rows.map(serializeInvoiceClient);
}

/** One client the caller can read, or null. */
export async function getInvoiceClientRow(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<InvoiceClientRow | null> {
  const [row] = await getDb()
    .select()
    .from(invoiceClients)
    .where(
      and(eq(invoiceClients.id, id), inArray(invoiceClients.profileId, accessibleProfileIds(userId, workspaceId))),
    )
    .limit(1);
  return row ?? null;
}

// ── Sellers (business details) ─────────────────────────────────────────────

export async function listInvoiceSellers(
  userId: string,
  workspaceId: string,
  profileId?: string | null,
): Promise<InvoiceSellerDTO[]> {
  const rows = await getDb()
    .select()
    .from(invoiceSellers)
    .where(
      and(
        inArray(invoiceSellers.profileId, accessibleProfileIds(userId, workspaceId)),
        profileId ? eq(invoiceSellers.profileId, profileId) : undefined,
      ),
    )
    .orderBy(asc(invoiceSellers.createdAt), asc(invoiceSellers.id));
  return rows.map(serializeInvoiceSeller);
}

export async function getInvoiceSellerRow(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<InvoiceSellerRow | null> {
  const [row] = await getDb()
    .select()
    .from(invoiceSellers)
    .where(
      and(eq(invoiceSellers.id, id), inArray(invoiceSellers.profileId, accessibleProfileIds(userId, workspaceId))),
    )
    .limit(1);
  return row ?? null;
}

// ── Invoices ───────────────────────────────────────────────────────────────

export type InvoiceListFilters = {
  kind?: InvoiceKind;
  status?: InvoiceStatus;
  profileId?: string;
  clientId?: string;
};

/** Newest first. A page is at most `INVOICE_LIST_MAX` rows. */
export const INVOICE_LIST_MAX = 200;

export async function listInvoiceSummaries(
  userId: string,
  workspaceId: string,
  filters: InvoiceListFilters = {},
  { limit = INVOICE_LIST_MAX, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<InvoiceSummaryDTO[]> {
  const rows = await getDb()
    .select({
      invoice: invoices,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(invoices)
    // trash: a display join onto rows already scoped to live profiles below.
    .leftJoin(profiles, eq(profiles.id, invoices.profileId))
    .where(
      and(
        inArray(invoices.profileId, accessibleProfileIds(userId, workspaceId)),
        filters.kind ? eq(invoices.kind, filters.kind) : undefined,
        filters.status ? eq(invoices.status, filters.status) : undefined,
        filters.profileId ? eq(invoices.profileId, filters.profileId) : undefined,
        filters.clientId ? eq(invoices.clientId, filters.clientId) : undefined,
      ),
    )
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(Math.min(Math.max(limit, 1), INVOICE_LIST_MAX))
    .offset(Math.max(offset, 0));
  return rows.map(({ invoice: r, profileName, profileIcon }) => ({
    id: r.id,
    profileId: r.profileId,
    profileName,
    profileIcon,
    kind: r.kind,
    status: r.status,
    number: r.number,
    clientId: r.clientId,
    clientName: r.clientName,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    currency: r.currency,
    totalMinor: r.totalMinor,
    paidAmountMinor: r.paidAmountMinor,
    sourceQuoteId: r.sourceQuoteId,
    sentAt: iso(r.sentAt),
    editedAt: iso(r.editedAt),
    paidAt: iso(r.paidAt),
    voidedAt: iso(r.voidedAt),
    createdAt: isoReq(r.createdAt),
    updatedAt: isoReq(r.updatedAt),
  }));
}

/** The invoice row the caller can read (no lines), or null. */
export async function getInvoiceRow(userId: string, workspaceId: string, id: string): Promise<InvoiceRow | null> {
  const [row] = await getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), inArray(invoices.profileId, accessibleProfileIds(userId, workspaceId))))
    .limit(1);
  return row ?? null;
}

/** A row's lines (read through its invoice, which the caller has already been allowed). */
export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItemRow[]> {
  return getDb()
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position));
}

/** Whether a seller has a logo — for an invoice's `hasLogo`. */
export async function sellerHasLogo(sellerId: string | null): Promise<boolean> {
  if (!sellerId) return false;
  const [row] = await getDb()
    .select({ has: sql<boolean>`${invoiceSellers.logoKey} is not null` })
    .from(invoiceSellers)
    .where(eq(invoiceSellers.id, sellerId))
    .limit(1);
  return Boolean(row?.has);
}

/** The full invoice the caller can read — lines included — or null. */
export async function getInvoiceDTO(userId: string, workspaceId: string, id: string): Promise<InvoiceDTO | null> {
  const row = await getInvoiceRow(userId, workspaceId, id);
  if (!row) return null;
  const [items, hasLogo] = await Promise.all([getInvoiceItems(row.id), sellerHasLogo(row.sellerId)]);
  return serializeInvoice(row, items, hasLogo);
}
