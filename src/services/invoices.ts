import "server-only";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  categories,
  invoiceClients,
  invoiceCounters,
  invoiceItems,
  invoiceSellers,
  invoiceShares,
  invoices,
  profiles,
  type InvoiceRow,
  type InvoiceSellerRow,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { addDays } from "@/lib/tools/date-math";
import {
  assertCanAddInvoice,
  assertCanAddInvoiceClient,
  assertCanAddInvoiceSeller,
  assertInvoiceTemplateAllowed,
  getWorkspaceEntitlements,
  invoiceLimitsOf,
  type WorkspaceEntitlements,
} from "@/lib/entitlements";
import { ApiError, conflict, forbidden, isUniqueViolation, notFound, validationError } from "@/lib/errors";
import {
  computeInvoiceFigures,
  invoicePdfName,
  priceToMinor,
  roundQuantity,
  type InvoiceDTO,
} from "@/lib/invoice-doc";
import {
  getInvoiceClientRow,
  getInvoiceDTO,
  getInvoiceRow,
  getInvoiceSellerRow,
  listInvoiceClients,
  listInvoiceSellers,
  listInvoiceSummaries,
  serializeInvoice,
  serializeInvoiceClient,
  serializeInvoiceSeller,
  type InvoiceClientDTO,
  type InvoiceListFilters,
  type InvoiceSellerDTO,
  type InvoiceSummaryDTO,
} from "@/lib/invoice-queries";
import {
  DEFAULT_INVOICE_TEMPLATE,
  INVOICE_LOGO_MAX_BYTES,
  canConvert,
  canDelete,
  canMarkPaid,
  canShare,
  canVoid,
  formatInvoiceNumber,
  type InvoiceKind,
  type InvoiceLogoType,
} from "@/lib/invoices";
import { setLogContext } from "@/lib/log-context";
import { describeError, logger } from "@/lib/logger";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { deleteObject, isR2Configured, readObject, uploadObject } from "@/lib/r2";
import { rolesAtLeast } from "@/lib/rbac";
import { isShareTokenShape, mintShareToken } from "@/lib/share-token";
import { assertStorageQuota } from "@/lib/storage-quota";
import { notTrashed } from "@/lib/trash-scope";
import {
  createInvoiceSchema,
  createInvoiceShareSchema,
  importInvoiceDraftSchema,
  invoiceClientSchema,
  invoiceContentSchema,
  invoiceListQuerySchema,
  invoiceSellerSchema,
  markInvoicePaidSchema,
  updateInvoiceClientSchema,
  updateInvoiceSellerSchema,
  type InvoiceContent,
} from "@/lib/validation";
import {
  getEffectiveProfileRole,
  getWorkspaceMoneyFormat,
  readOnlyErrorFor,
  type ProfileAccessResult,
} from "@/lib/workspaces";
import { createTransactionId } from "@/services/transactions";

/**
 * Invoices and quotes, shared by the web server actions
 * (`src/actions/invoices.ts`) and the REST API (`/api/v1/invoices`,
 * `/api/v1/invoice-clients`, `/api/v1/invoice-sellers`). The rules a change
 * must keep (AGENTS.md § Invoices):
 *
 *  - **Access is the profile's.** Reading needs viewer on the invoice's
 *    profile, changing anything needs editor; an id in a profile the caller
 *    can't read — or in another workspace, or a trashed profile — is a 404.
 *  - **Numbers are given at finalise**, from `invoice_counters`, in the same
 *    database transaction as the status change: no duplicates, no gaps.
 *  - **A finalised document is never deleted** — it's voided, keeping its
 *    number. Only drafts are deleted, and only drafts change.
 *  - **Its PDF is stored once**, when finalised, in R2 under `invoices/` or
 *    `quotations/` — the workspace's hidden "Invoices" / "Quotations" storage,
 *    counted toward its plan and reached only through the invoice.
 *  - **Limits gate adding** (`INVOICE_LIMITS` for the workspace's invoice
 *    tier, checked in `entitlements.ts`): nothing that exists is ever removed.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const isUuid = (v: unknown): v is string => typeof v === "string" && z.string().uuid().safeParse(v).success;

/** What a PDF snapshot is assumed to weigh before it's drawn — for the storage check at finalise. */
const PDF_ESTIMATE_BYTES = 200 * 1024;

const INVOICE_NOT_FOUND = "Invoice not found";

// ── Access ─────────────────────────────────────────────────────────────────

/**
 * The caller's role on a profile of this workspace, at least `minRole`. A
 * profile they can't see (or that's elsewhere, or trashed) is a 404; one they
 * can only read is a 403 — or, in a view-only workspace, its read-only error.
 */
async function requireProfileIn(
  userId: string,
  workspaceId: string,
  profileId: string,
  minRole: "viewer" | "editor",
): Promise<ProfileAccessResult> {
  if (!isUuid(profileId)) throw notFound("Profile not found");
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access || access.workspaceId !== workspaceId) throw notFound("Profile not found");
  if (!rolesAtLeast(minRole).includes(access.role)) {
    if (access.readOnly && minRole === "editor") throw await readOnlyErrorFor(workspaceId);
    throw forbidden("You can only view invoices in this profile");
  }
  setLogContext({ profileId });
  return access;
}

/** An invoice the caller can change: readable (else 404) and editor on its profile (else 403). */
async function requireInvoiceForWrite(userId: string, workspaceId: string, id: unknown): Promise<InvoiceRow> {
  if (!isUuid(id)) throw notFound(INVOICE_NOT_FOUND);
  const row = await getInvoiceRow(userId, workspaceId, id);
  if (!row) throw notFound(INVOICE_NOT_FOUND);
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  return row;
}

// ── Clients ────────────────────────────────────────────────────────────────

export async function listClients(userId: string, workspaceId: string, profileId?: string | null) {
  if (profileId && !isUuid(profileId)) throw validationError("Invalid profile");
  return listInvoiceClients(userId, workspaceId, profileId);
}

export async function getClient(userId: string, workspaceId: string, id: unknown): Promise<InvoiceClientDTO | null> {
  if (!isUuid(id)) return null;
  const row = await getInvoiceClientRow(userId, workspaceId, id);
  return row ? serializeInvoiceClient(row) : null;
}

/** A new saved client in a profile the caller can edit (403 `plan_limit` past the tier's cap). */
export async function createClient(userId: string, workspaceId: string, input: unknown): Promise<InvoiceClientDTO> {
  const data = parseOrThrow(invoiceClientSchema, input);
  await requireProfileIn(userId, workspaceId, data.profileId, "editor");
  await assertCanAddInvoiceClient(await getWorkspaceEntitlements(workspaceId));
  const [row] = await getDb()
    .insert(invoiceClients)
    .values({
      workspaceId,
      profileId: data.profileId,
      name: data.name,
      email: data.email,
      address: data.address,
      taxId: data.taxId,
      createdBy: userId,
    })
    .returning();
  logger.info("Invoice client saved", { event: "invoice.client_created", clientId: row!.id });
  return serializeInvoiceClient(row!);
}

export async function updateClient(
  userId: string,
  workspaceId: string,
  id: unknown,
  input: unknown,
): Promise<InvoiceClientDTO | null> {
  const data = parseOrThrow(updateInvoiceClientSchema, input);
  if (!isUuid(id)) return null;
  const row = await getInvoiceClientRow(userId, workspaceId, id);
  if (!row) return null;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  const [updated] = await getDb()
    .update(invoiceClients)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(invoiceClients.id, row.id))
    .returning();
  return updated ? serializeInvoiceClient(updated) : null;
}

/**
 * Delete a saved client. Documents already written keep their copy of its
 * details (only their link to it is cleared), so nothing that went out changes.
 */
export async function deleteClient(userId: string, workspaceId: string, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false;
  const row = await getInvoiceClientRow(userId, workspaceId, id);
  if (!row) return false;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  const gone = await getDb().delete(invoiceClients).where(eq(invoiceClients.id, row.id)).returning({ id: invoiceClients.id });
  return gone.length > 0;
}

// ── Sellers (your business details) ────────────────────────────────────────

export async function listSellers(userId: string, workspaceId: string, profileId?: string | null) {
  if (profileId && !isUuid(profileId)) throw validationError("Invalid profile");
  return listInvoiceSellers(userId, workspaceId, profileId);
}

export async function getSeller(userId: string, workspaceId: string, id: unknown): Promise<InvoiceSellerDTO | null> {
  if (!isUuid(id)) return null;
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  return row ? serializeInvoiceSeller(row) : null;
}

export async function createSeller(userId: string, workspaceId: string, input: unknown): Promise<InvoiceSellerDTO> {
  const data = parseOrThrow(invoiceSellerSchema, input);
  await requireProfileIn(userId, workspaceId, data.profileId, "editor");
  await assertCanAddInvoiceSeller(await getWorkspaceEntitlements(workspaceId));
  const [row] = await getDb()
    .insert(invoiceSellers)
    .values({
      workspaceId,
      profileId: data.profileId,
      name: data.name,
      address: data.address,
      contact: data.contact,
      taxId: data.taxId,
      upiId: data.upiId,
      createdBy: userId,
    })
    .returning();
  logger.info("Invoice business details saved", { event: "invoice.seller_created", sellerId: row!.id });
  return serializeInvoiceSeller(row!);
}

export async function updateSeller(
  userId: string,
  workspaceId: string,
  id: unknown,
  input: unknown,
): Promise<InvoiceSellerDTO | null> {
  const data = parseOrThrow(updateInvoiceSellerSchema, input);
  if (!isUuid(id)) return null;
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  if (!row) return null;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  const [updated] = await getDb()
    .update(invoiceSellers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(invoiceSellers.id, row.id))
    .returning();
  return updated ? serializeInvoiceSeller(updated) : null;
}

/** Delete business details and their logo. Documents keep their own copy of the text. */
export async function deleteSeller(userId: string, workspaceId: string, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false;
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  if (!row) return false;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  const gone = await getDb()
    .delete(invoiceSellers)
    .where(eq(invoiceSellers.id, row.id))
    .returning({ logoKey: invoiceSellers.logoKey });
  if (gone[0]?.logoKey) await deleteObject(gone[0].logoKey);
  return gone.length > 0;
}

/** A logo sent as base64 (no `data:` prefix), decoded — a 422 for anything that isn't base64 or is too big. */
export function decodeLogoBase64(base64: unknown): Uint8Array {
  const limit = Math.ceil(INVOICE_LOGO_MAX_BYTES / 3) * 4 + 4;
  if (typeof base64 !== "string" || base64.length === 0 || base64.length > limit || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw validationError("A logo can be a PNG or JPEG of at most 300 KB");
  }
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** PNG or JPEG by their first bytes — the type a logo claims has to be the type it is. */
export function sniffLogoType(bytes: Uint8Array): InvoiceLogoType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Store a seller's logo — once, here; every document from this seller draws
 * it from this one object. PNG or JPEG (checked by content, not by the name
 * it came with), at most 300 KB, and it counts toward the workspace's storage.
 * The logo it replaces is deleted after the new one is recorded.
 */
export async function setSellerLogo(
  userId: string,
  workspaceId: string,
  id: unknown,
  bytes: Uint8Array,
): Promise<InvoiceSellerDTO> {
  if (!isUuid(id)) throw notFound("Business details not found");
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  if (!row) throw notFound("Business details not found");
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  return storeSellerLogo(row, workspaceId, bytes);
}

async function storeSellerLogo(row: InvoiceSellerRow, workspaceId: string, bytes: Uint8Array): Promise<InvoiceSellerDTO> {
  if (bytes.byteLength === 0) throw validationError("The logo is empty");
  if (bytes.byteLength > INVOICE_LOGO_MAX_BYTES) throw validationError("A logo can be at most 300 KB");
  const type = sniffLogoType(bytes);
  if (!type) throw validationError("A logo has to be a PNG or JPEG image");
  if (!isR2Configured()) throw new ApiError(503, "storage_unavailable", "File storage isn't configured on this server.");
  // The old logo leaves when this one arrives, so only the difference is new.
  await assertStorageQuota(workspaceId, Math.max(0, bytes.byteLength - (row.logoSizeBytes ?? 0)));

  const key = `invoice-logos/${workspaceId}/${row.id}/${crypto.randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  await uploadObject(key, bytes.slice().buffer as ArrayBuffer, type);
  const [updated] = await getDb()
    .update(invoiceSellers)
    .set({ logoKey: key, logoContentType: type, logoSizeBytes: bytes.byteLength, updatedAt: new Date() })
    .where(eq(invoiceSellers.id, row.id))
    .returning();
  if (!updated) {
    // Deleted while the upload ran — nothing points at the new object.
    await deleteObject(key);
    throw notFound("Business details not found");
  }
  if (row.logoKey) await deleteObject(row.logoKey);
  return serializeInvoiceSeller(updated);
}

export async function removeSellerLogo(userId: string, workspaceId: string, id: unknown): Promise<InvoiceSellerDTO | null> {
  if (!isUuid(id)) return null;
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  if (!row) return null;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  const [updated] = await getDb()
    .update(invoiceSellers)
    .set({ logoKey: null, logoContentType: null, logoSizeBytes: null, updatedAt: new Date() })
    .where(eq(invoiceSellers.id, row.id))
    .returning();
  if (row.logoKey) await deleteObject(row.logoKey);
  return updated ? serializeInvoiceSeller(updated) : null;
}

/** A seller's logo object for a reader of its profile — key and type, or null. */
export async function getSellerLogo(
  userId: string,
  workspaceId: string,
  id: unknown,
): Promise<{ key: string; contentType: string } | null> {
  if (!isUuid(id)) return null;
  const row = await getInvoiceSellerRow(userId, workspaceId, id);
  if (!row?.logoKey) return null;
  return { key: row.logoKey, contentType: row.logoContentType ?? "image/png" };
}

// ── Invoices: reading ──────────────────────────────────────────────────────

export async function listInvoices(
  userId: string,
  workspaceId: string,
  filters: unknown = {},
  page: { limit?: number; offset?: number } = {},
): Promise<InvoiceSummaryDTO[]> {
  const parsed: InvoiceListFilters = parseOrThrow(invoiceListQuerySchema, filters);
  return listInvoiceSummaries(userId, workspaceId, parsed, page);
}

export async function getInvoice(userId: string, workspaceId: string, id: unknown): Promise<InvoiceDTO | null> {
  if (!isUuid(id)) return null;
  return getInvoiceDTO(userId, workspaceId, id);
}

// ── Invoices: writing a draft ──────────────────────────────────────────────

/** The stored form of a draft's content, worked out on the server. */
type DraftColumns = Omit<
  typeof invoices.$inferInsert,
  "id" | "workspaceId" | "profileId" | "kind" | "status" | "createdBy" | "createdAt"
>;
type DraftLine = { description: string; quantity: string; unitPriceMinor: number; amountMinor: number };

/**
 * Turn validated content into columns and lines: links checked (a client or
 * seller must be in the invoice's own profile), the snapshot filled from
 * them where the content left it blank, prices in minor units, and every
 * line and total worked out with the generator's engine.
 */
async function draftColumns(
  data: InvoiceContent,
  profileId: string,
  ent: WorkspaceEntitlements,
): Promise<{ columns: DraftColumns; lines: DraftLine[] }> {
  const db = getDb();
  const template = data.template ?? DEFAULT_INVOICE_TEMPLATE;
  assertInvoiceTemplateAllowed(ent, template);

  let client = data.client;
  if (data.clientId) {
    const [row] = await db
      .select()
      .from(invoiceClients)
      .where(and(eq(invoiceClients.id, data.clientId), eq(invoiceClients.profileId, profileId)))
      .limit(1);
    if (!row) throw validationError("Pick a client from this profile");
    if (!client.name) client = { name: row.name, email: row.email, address: row.address, taxId: row.taxId };
  }

  let seller = data.seller;
  let upiId = data.upiId;
  if (data.sellerId) {
    const [row] = await db
      .select()
      .from(invoiceSellers)
      .where(and(eq(invoiceSellers.id, data.sellerId), eq(invoiceSellers.profileId, profileId)))
      .limit(1);
    if (!row) throw validationError("Pick business details from this profile");
    if (!seller.name) {
      seller = { name: row.name, address: row.address, contact: row.contact, taxId: row.taxId };
      upiId ??= row.upiId;
    }
  }

  const lines: DraftLine[] = [];
  const priced: { quantity: number; unitPriceMinor: number }[] = [];
  for (const item of data.items) {
    const unitPriceMinor = priceToMinor(item.unitPrice, data.currency);
    if (unitPriceMinor === null) throw validationError("A price is too large");
    const quantity = roundQuantity(item.quantity);
    priced.push({ quantity, unitPriceMinor });
    lines.push({ description: item.description, quantity: String(quantity), unitPriceMinor, amountMinor: 0 });
  }
  const discountFixedMinor = data.discountType === "fixed" ? priceToMinor(data.discount, data.currency) : 0;
  if (discountFixedMinor === null) throw validationError("The discount is too large");
  const figures = computeInvoiceFigures({
    items: priced,
    discountType: data.discountType,
    discountRate: data.discountType === "percent" ? data.discount : 0,
    discountFixedMinor,
    taxRate: data.taxRate,
  });
  if (!figures) throw validationError("These amounts are too large to total exactly");
  figures.lines.forEach((amount, i) => (lines[i]!.amountMinor = amount));

  return {
    lines,
    columns: {
      quoteTitle: data.quoteTitle,
      clientId: data.clientId ?? null,
      clientName: client.name,
      clientEmail: client.email,
      clientAddress: client.address,
      clientTaxId: client.taxId,
      sellerId: data.sellerId ?? null,
      sellerName: seller.name,
      sellerAddress: seller.address,
      sellerContact: seller.contact,
      sellerTaxId: seller.taxId,
      upiId: upiId ?? null,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      currency: data.currency,
      discountType: data.discountType,
      discountRate: String(data.discountType === "percent" ? data.discount : 0),
      discountFixedMinor: Math.min(discountFixedMinor, figures.totals.subtotal),
      taxLabel: data.taxLabel,
      taxRate: String(data.taxRate),
      subtotalMinor: figures.totals.subtotal,
      discountMinor: figures.totals.discount,
      taxMinor: figures.totals.tax,
      totalMinor: figures.totals.total,
      notes: data.notes,
      terms: data.terms,
      template,
      // The footer the tier puts on its documents (fixed again at finalise).
      showCredit: invoiceLimitsOf(ent).footer,
      updatedAt: new Date(),
    },
  };
}

async function insertLines(tx: Tx, invoice: { id: string; workspaceId: string; profileId: string }, lines: DraftLine[]) {
  if (lines.length === 0) return;
  await tx.insert(invoiceItems).values(
    lines.map((line, position) => ({
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      profileId: invoice.profileId,
      position,
      ...line,
    })),
  );
}

/**
 * Write a new draft in the caller's transaction, after the monthly allowance
 * check under its lock — the one place every new invoice or quote is made
 * (new, converted from a quote, imported from the generator).
 */
async function insertDraft(
  userId: string,
  ent: WorkspaceEntitlements,
  { kind, profileId, columns, lines, extra = {} }: {
    kind: InvoiceKind;
    profileId: string;
    columns: DraftColumns;
    lines: DraftLine[];
    extra?: Pick<typeof invoices.$inferInsert, "sourceQuoteId" | "importKey">;
  },
): Promise<string> {
  return getDb().transaction(async (tx) => {
    await assertCanAddInvoice(tx, ent);
    const [row] = await tx
      .insert(invoices)
      .values({ ...columns, ...extra, workspaceId: ent.workspaceId, profileId, kind, status: "draft", createdBy: userId })
      .returning({ id: invoices.id });
    await insertLines(tx, { id: row!.id, workspaceId: ent.workspaceId, profileId }, lines);
    return row!.id;
  });
}

/** A new draft invoice or quote in a profile the caller can edit. */
export async function createInvoice(userId: string, workspaceId: string, input: unknown): Promise<InvoiceDTO> {
  const data = parseOrThrow(createInvoiceSchema, input);
  await requireProfileIn(userId, workspaceId, data.profileId, "editor");
  const ent = await getWorkspaceEntitlements(workspaceId);
  const { columns, lines } = await draftColumns(data, data.profileId, ent);
  const id = await insertDraft(userId, ent, { kind: data.kind, profileId: data.profileId, columns, lines });
  logger.info(`Draft ${data.kind} created with ${lines.length} line(s)`, {
    event: "invoice.created",
    invoiceId: id,
    kind: data.kind,
  });
  return (await getInvoiceDTO(userId, workspaceId, id))!;
}

/** Replace a draft's content (the whole document, every save). Finalised documents don't change. */
export async function updateInvoice(
  userId: string,
  workspaceId: string,
  id: unknown,
  input: unknown,
): Promise<InvoiceDTO> {
  const data = parseOrThrow(invoiceContentSchema, input);
  const row = await requireInvoiceForWrite(userId, workspaceId, id);
  if (row.status !== "draft") throw conflict(lockedMessage(row));
  const ent = await getWorkspaceEntitlements(workspaceId);
  const { columns, lines } = await draftColumns(data, row.profileId, ent);
  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(invoices)
      .set(columns)
      .where(and(eq(invoices.id, row.id), eq(invoices.status, "draft")))
      .returning({ id: invoices.id });
    if (!updated) throw conflict(lockedMessage(row));
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, row.id));
    await insertLines(tx, row, lines);
  });
  return (await getInvoiceDTO(userId, workspaceId, row.id))!;
}

function lockedMessage(row: Pick<InvoiceRow, "kind">): string {
  return `This ${row.kind} is finalised, so it can't change — void it and make a new one`;
}

/**
 * Delete a draft. A finalised invoice or quote is never deleted — it's a
 * record with a number — so that's a 409 asking to void it instead.
 */
export async function deleteInvoice(userId: string, workspaceId: string, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false;
  const row = await getInvoiceRow(userId, workspaceId, id);
  if (!row) return false;
  await requireProfileIn(userId, workspaceId, row.profileId, "editor");
  if (!canDelete(row.status)) {
    throw conflict(`A finalised ${row.kind} is never deleted — void it instead, so its number stays on record`);
  }
  const gone = await getDb()
    .delete(invoices)
    .where(and(eq(invoices.id, row.id), eq(invoices.status, "draft")))
    .returning({ id: invoices.id });
  if (gone.length === 0) throw conflict(`This ${row.kind} was finalised a moment ago — void it instead`);
  logger.info(`Draft ${row.kind} deleted`, { event: "invoice.draft_deleted", invoiceId: row.id });
  return true;
}

// ── Finalise, void ─────────────────────────────────────────────────────────

/**
 * Finalise a draft: give it the next number in the workspace's series, lock
 * it, and store its PDF. The number comes from the counter row in the same
 * database transaction as the status change — the row lock makes concurrent
 * finalises wait their turn (no duplicates), and a rollback gives the number
 * back (no gaps). The PDF is drawn and stored after that commits; if storing
 * fails it's drawn again on the first download.
 */
export async function finaliseInvoice(userId: string, workspaceId: string, id: unknown): Promise<InvoiceDTO> {
  const row = await requireInvoiceForWrite(userId, workspaceId, id);
  if (row.status !== "draft") throw conflict(`This ${row.kind} is already finalised`);
  if (!row.clientName.trim()) throw validationError(`Add who the ${row.kind} is for before finalising`);
  if (!row.sellerName.trim()) throw validationError("Add your business name before finalising");
  const ent = await getWorkspaceEntitlements(workspaceId);
  assertInvoiceTemplateAllowed(ent, row.template);
  const [lineCount] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, row.id));
  if (!lineCount?.n) throw validationError(`Add at least one line before finalising`);
  // The PDF counts toward storage, so a full workspace can't finalise more.
  await assertStorageQuota(workspaceId, PDF_ESTIMATE_BYTES);

  const number = await getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, row.id))
      .for("update");
    if (!locked) throw notFound(INVOICE_NOT_FOUND);
    if (locked.status !== "draft") throw conflict(`This ${row.kind} is already finalised`);
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ workspaceId: row.workspaceId, kind: row.kind, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [invoiceCounters.workspaceId, invoiceCounters.kind],
        set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` },
      })
      .returning({ n: invoiceCounters.lastNumber });
    const seq = counter!.n;
    const formatted = formatInvoiceNumber(row.kind, seq);
    await tx
      .update(invoices)
      .set({
        status: "sent",
        number: formatted,
        numberSeq: seq,
        sentAt: new Date(),
        showCredit: invoiceLimitsOf(ent).footer,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, row.id));
    return formatted;
  });
  logger.info(`Finalised ${row.kind} ${number}`, { event: "invoice.finalised", invoiceId: row.id, kind: row.kind });

  const dto = (await getInvoiceDTO(userId, workspaceId, row.id))!;
  await storeSnapshot(dto, workspaceId);
  return (await getInvoiceDTO(userId, workspaceId, row.id))!;
}

/** Void a finalised document: it stays, with its number, marked void. */
export async function voidInvoice(userId: string, workspaceId: string, id: unknown): Promise<InvoiceDTO> {
  const row = await requireInvoiceForWrite(userId, workspaceId, id);
  if (!canVoid(row.status)) throw conflict(voidRefusal(row));
  const [done] = await getDb()
    .update(invoices)
    .set({ status: "void", voidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.id, row.id), eq(invoices.status, "sent")))
    .returning({ id: invoices.id });
  if (!done) {
    const now = await getInvoiceRow(userId, workspaceId, row.id);
    throw conflict(voidRefusal(now ?? row));
  }
  logger.info(`Voided ${row.kind} ${row.number ?? ""}`.trim(), { event: "invoice.voided", invoiceId: row.id });
  return (await getInvoiceDTO(userId, workspaceId, row.id))!;
}

function voidRefusal(row: Pick<InvoiceRow, "kind" | "status">): string {
  if (row.status === "draft") return `A draft isn't on record yet — delete it instead`;
  if (row.status === "paid") return "This invoice is paid, so it can't be voided";
  return `This ${row.kind} is already void`;
}

// ── Mark as paid ───────────────────────────────────────────────────────────

class AlreadySettled extends Error {}

export type MarkPaidResult = { invoice: InvoiceDTO; transactionId: string | null; alreadyPaid: boolean };

/**
 * "Mark as paid": one **income** transaction in the invoice's profile, through
 * `createTransactionId` (so it's an ordinary entry and the budget checks run),
 * in the **workspace's** currency. Same currency → the invoice total unless
 * the person says otherwise; another currency → they must say what arrived
 * (422 `amount_required`).
 *
 * **Exactly once.** The invoice is claimed (`status = 'sent'` → `paid`, with
 * the new transaction's id) inside the same database transaction as the
 * insert; a second call — a double click, the app and the web at once — finds
 * it taken, rolls its own insert back, and answers with the first one.
 */
export async function markInvoicePaid(
  userId: string,
  workspace: { id: string; currency: string; locale: string },
  id: unknown,
  input: unknown,
): Promise<MarkPaidResult> {
  const data = parseOrThrow(markInvoicePaidSchema, input);
  const row = await requireInvoiceForWrite(userId, workspace.id, id);
  if (row.status === "paid") {
    return { invoice: (await getInvoiceDTO(userId, workspace.id, row.id))!, transactionId: row.paidTransactionId, alreadyPaid: true };
  }
  if (!canMarkPaid(row.kind, row.status)) {
    throw conflict(
      row.kind === "quote"
        ? "A quote isn't paid — turn it into an invoice first"
        : row.status === "draft"
          ? "Finalise the invoice before marking it paid"
          : "A void invoice can't be paid",
    );
  }
  const sameCurrency = row.currency === workspace.currency;
  if (!sameCurrency && data.amount === undefined) {
    throw new ApiError(
      422,
      "amount_required",
      `Enter what you received in ${workspace.currency} — this workspace keeps its books in ${workspace.currency}`,
    );
  }
  const amount = data.amount ?? fromMinorUnits(row.totalMinor, workspace.currency);
  if (amount <= 0) throw validationError("Enter the amount you received");
  if (data.categoryId) {
    const [cat] = await getDb()
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.workspaceId, workspace.id)))
      .limit(1);
    if (!cat || cat.kind !== "income") throw validationError("Pick an income category");
  }
  const paidOn = data.paidOn ?? new Date().toISOString().slice(0, 10);
  const paidAmountMinor = toMinorUnits(amount, workspace.currency);

  try {
    const { id: transactionId } = await createTransactionId(
      userId,
      workspace.id,
      {
        type: "income",
        amount,
        profileId: row.profileId,
        categoryId: data.categoryId ?? null,
        title: `Invoice ${row.number}`.slice(0, 40),
        description: row.clientName ? `From ${row.clientName}`.slice(0, 150) : undefined,
        occurredOn: paidOn,
      },
      { currency: workspace.currency, locale: workspace.locale },
      {
        strictProfile: true,
        withinInsert: async (tx, txnId) => {
          const [claimed] = await tx
            .update(invoices)
            .set({
              status: "paid",
              paidAt: new Date(),
              paidOn,
              paidTransactionId: txnId,
              paidAmountMinor,
              updatedAt: new Date(),
            })
            .where(and(eq(invoices.id, row.id), eq(invoices.status, "sent")))
            .returning({ id: invoices.id });
          if (!claimed) throw new AlreadySettled();
        },
      },
    );
    logger.info(`Invoice ${row.number} marked paid`, {
      event: "invoice.paid",
      invoiceId: row.id,
      transactionId,
      sameCurrency,
    });
    return { invoice: (await getInvoiceDTO(userId, workspace.id, row.id))!, transactionId, alreadyPaid: false };
  } catch (err) {
    if (!(err instanceof AlreadySettled)) throw err;
    const now = await getInvoiceRow(userId, workspace.id, row.id);
    if (now?.status === "paid") {
      return { invoice: (await getInvoiceDTO(userId, workspace.id, row.id))!, transactionId: now.paidTransactionId, alreadyPaid: true };
    }
    throw conflict("This invoice was voided a moment ago");
  }
}

// ── Quote → invoice ────────────────────────────────────────────────────────

/**
 * Turn a quote into a new **draft** invoice in the same profile: the client,
 * seller, lines, discount, tax, notes and template carry over; the quote's
 * terms don't (validity and deposits aren't a bill's). Dated today, due in 30
 * days, linked back to the quote. Counts toward the month like any new invoice.
 */
export async function convertQuote(userId: string, workspaceId: string, id: unknown, today?: string): Promise<InvoiceDTO> {
  const quote = await requireInvoiceForWrite(userId, workspaceId, id);
  if (!canConvert(quote.kind, quote.status)) {
    throw conflict(quote.kind === "invoice" ? "This is already an invoice" : "A void quote can't become an invoice");
  }
  const ent = await getWorkspaceEntitlements(workspaceId);
  const items = await getDb()
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, quote.id))
    .orderBy(invoiceItems.position);
  const issueDate = today ?? new Date().toISOString().slice(0, 10);
  const columns: DraftColumns = {
    quoteTitle: "quotation",
    clientId: quote.clientId,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientAddress: quote.clientAddress,
    clientTaxId: quote.clientTaxId,
    sellerId: quote.sellerId,
    sellerName: quote.sellerName,
    sellerAddress: quote.sellerAddress,
    sellerContact: quote.sellerContact,
    sellerTaxId: quote.sellerTaxId,
    upiId: quote.upiId,
    issueDate,
    dueDate: addDays(issueDate, 30),
    currency: quote.currency,
    discountType: quote.discountType,
    discountRate: quote.discountRate,
    discountFixedMinor: quote.discountFixedMinor,
    taxLabel: quote.taxLabel,
    taxRate: quote.taxRate,
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
    notes: quote.notes,
    terms: null,
    template: quote.template,
    showCredit: invoiceLimitsOf(ent).footer,
    updatedAt: new Date(),
  };
  const lines = items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPriceMinor: i.unitPriceMinor,
    amountMinor: i.amountMinor,
  }));
  const newId = await insertDraft(userId, ent, {
    kind: "invoice",
    profileId: quote.profileId,
    columns,
    lines,
    extra: { sourceQuoteId: quote.id },
  });
  logger.info(`Quote ${quote.number ?? "draft"} turned into a draft invoice`, {
    event: "invoice.converted",
    quoteId: quote.id,
    invoiceId: newId,
  });
  return (await getInvoiceDTO(userId, workspaceId, newId))!;
}

// ── PDF ────────────────────────────────────────────────────────────────────

/** Where a document's PDF lives: the hidden "Invoices" / "Quotations" storage. */
function pdfKeyFor(dto: Pick<InvoiceDTO, "kind" | "id">, workspaceId: string): string {
  const folder = dto.kind === "quote" ? "quotations" : "invoices";
  return `${folder}/${workspaceId}/${dto.id}/${crypto.randomUUID()}.pdf`;
}

/** The seller's logo as bytes a PDF can embed, or null (none, or storage unreachable). */
async function logoForPdf(sellerId: string | null): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  if (!sellerId || !isR2Configured()) return null;
  const [seller] = await getDb()
    .select({ key: invoiceSellers.logoKey, type: invoiceSellers.logoContentType })
    .from(invoiceSellers)
    .where(eq(invoiceSellers.id, sellerId))
    .limit(1);
  if (!seller?.key) return null;
  try {
    const bytes = await readObject(seller.key);
    if (!bytes) return null;
    const type = sniffLogoType(bytes);
    return type ? { bytes, kind: type === "image/png" ? "png" : "jpg" } : null;
  } catch (err) {
    logger.warn(`Invoice logo couldn't be read for a PDF: ${describeError(err)}`, { event: "invoice.logo_read_failed" });
    return null;
  }
}

/** Draw a document's PDF (see `lib/invoice-pdf.server.ts`). */
async function drawPdf(dto: InvoiceDTO, locale: string): Promise<Uint8Array> {
  const { renderInvoicePdf } = await import("@/lib/invoice-pdf.server");
  return renderInvoicePdf(dto, { locale, logo: await logoForPdf(dto.sellerId) });
}

/**
 * Store a finalised document's PDF once. Best-effort: the document is already
 * finalised and stays so; a failure is logged and the next download draws and
 * stores it instead.
 */
async function storeSnapshot(dto: InvoiceDTO, workspaceId: string): Promise<Uint8Array | null> {
  try {
    const { locale } = await getWorkspaceMoneyFormat(workspaceId);
    const bytes = await drawPdf(dto, locale);
    if (!isR2Configured()) return bytes;
    const key = pdfKeyFor(dto, workspaceId);
    await uploadObject(key, bytes.slice().buffer as ArrayBuffer, "application/pdf");
    const [stored] = await getDb()
      .update(invoices)
      .set({ pdfKey: key, pdfSizeBytes: bytes.byteLength })
      .where(and(eq(invoices.id, dto.id), isNull(invoices.pdfKey)))
      .returning({ id: invoices.id });
    // Someone else stored one first (or the row is gone): don't strand this copy.
    if (!stored) await deleteObject(key);
    return bytes;
  } catch (err) {
    logger.warn(`PDF for ${dto.kind} ${dto.number ?? dto.id} couldn't be stored: ${describeError(err)}`, {
      event: "invoice.pdf_store_failed",
      invoiceId: dto.id,
    });
    return null;
  }
}

export type InvoicePdf = { bytes: Uint8Array; fileName: string };

/** A finalised document's stored PDF (stored now if it's missing), or a draft's drawn on the spot. */
async function pdfOf(dto: InvoiceDTO, workspaceId: string, pdfKey: string | null): Promise<InvoicePdf> {
  const fileName = invoicePdfName(dto);
  if (dto.status !== "draft") {
    if (pdfKey && isR2Configured()) {
      const stored = await readObject(pdfKey);
      if (stored) return { bytes: stored, fileName };
    }
    const fresh = await storeSnapshot(dto, workspaceId);
    if (fresh) return { bytes: fresh, fileName };
  }
  const { locale } = await getWorkspaceMoneyFormat(workspaceId);
  return { bytes: await drawPdf(dto, locale), fileName };
}

export async function getInvoicePdf(userId: string, workspaceId: string, id: unknown): Promise<InvoicePdf> {
  if (!isUuid(id)) throw notFound(INVOICE_NOT_FOUND);
  const row = await getInvoiceRow(userId, workspaceId, id);
  if (!row) throw notFound(INVOICE_NOT_FOUND);
  const dto = (await getInvoiceDTO(userId, workspaceId, row.id))!;
  return pdfOf(dto, workspaceId, row.pdfKey);
}

// ── Share links ────────────────────────────────────────────────────────────

export type InvoiceShareDTO = {
  id: string;
  invoiceId: string;
  token: string;
  /** The public page's path — prefix the site origin. */
  path: string;
  expiresAt: string | null;
  createdAt: string;
};

export const invoiceSharePath = (token: string) => `/share/invoice/${token}`;

function serializeShare(row: typeof invoiceShares.$inferSelect): InvoiceShareDTO {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    token: row.token,
    path: invoiceSharePath(row.token),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A public link to a finalised invoice or quote (editor on its profile — a
 * link shows it outside the workspace). Drafts can't be shared: they can still
 * change.
 */
export async function createInvoiceShare(
  userId: string,
  workspaceId: string,
  id: unknown,
  input: unknown = {},
): Promise<InvoiceShareDTO> {
  const data = parseOrThrow(createInvoiceShareSchema, input ?? {});
  const row = await requireInvoiceForWrite(userId, workspaceId, id);
  if (!canShare(row.status)) throw conflict(`Finalise the ${row.kind} before sharing it`);
  const expiresAt = data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null;
  const [share] = await getDb()
    .insert(invoiceShares)
    .values({ workspaceId, profileId: row.profileId, invoiceId: row.id, userId, token: mintShareToken(), expiresAt })
    .returning();
  logger.info(`Share link made for ${row.kind} ${row.number}`, { event: "invoice.shared", invoiceId: row.id });
  return serializeShare(share!);
}

/** The document's live links, newest first (editors only — a token is access). */
export async function listInvoiceShares(userId: string, workspaceId: string, id: unknown): Promise<InvoiceShareDTO[]> {
  const row = await requireInvoiceForWrite(userId, workspaceId, id);
  const rows = await getDb()
    .select()
    .from(invoiceShares)
    .where(
      and(
        eq(invoiceShares.invoiceId, row.id),
        or(isNull(invoiceShares.expiresAt), gt(invoiceShares.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(invoiceShares.createdAt));
  return rows.map(serializeShare);
}

/** Revoke a link (delete it). False when it isn't one of this invoice's. */
export async function revokeInvoiceShare(
  userId: string,
  workspaceId: string,
  invoiceId: unknown,
  shareId: unknown,
): Promise<boolean> {
  const row = await requireInvoiceForWrite(userId, workspaceId, invoiceId);
  if (!isUuid(shareId)) return false;
  const gone = await getDb()
    .delete(invoiceShares)
    .where(and(eq(invoiceShares.id, shareId), eq(invoiceShares.invoiceId, row.id)))
    .returning({ id: invoiceShares.id });
  return gone.length > 0;
}

/**
 * "Send as link": finalise a draft if it is one, then hand back a link to
 * send — the newest live one, or a new one.
 */
export async function sendInvoiceAsLink(
  userId: string,
  workspaceId: string,
  id: unknown,
): Promise<{ invoice: InvoiceDTO; share: InvoiceShareDTO }> {
  let row = await requireInvoiceForWrite(userId, workspaceId, id);
  if (row.status === "draft") {
    await finaliseInvoice(userId, workspaceId, row.id);
    row = (await getInvoiceRow(userId, workspaceId, row.id))!;
  }
  const [existing] = await listInvoiceShares(userId, workspaceId, row.id);
  const share = existing ?? (await createInvoiceShare(userId, workspaceId, row.id));
  return { invoice: (await getInvoiceDTO(userId, workspaceId, row.id))!, share };
}

/** What the public page may show: the document, nothing about who made it or the workspace. */
export type SharedInvoice = {
  invoice: Omit<InvoiceDTO, "createdBy" | "paidTransactionId" | "paidAmountMinor" | "profileId" | "clientId" | "sellerId" | "sourceQuoteId">;
  locale: string;
  /** The seller's logo can be fetched at `<share path>/logo`. */
  hasLogo: boolean;
};

/**
 * The live share row for a token, its invoice and the invoice's profile —
 * null when the token is unknown, expired, the profile is in the trash (a link
 * stops while its document is in the trash, and works again once restored),
 * or the document is a draft.
 */
async function activeShare(token: unknown) {
  if (!isShareTokenShape(token)) return null;
  const [found] = await getDb()
    .select({ share: invoiceShares, invoice: invoices })
    .from(invoiceShares)
    .innerJoin(invoices, eq(invoices.id, invoiceShares.invoiceId))
    .innerJoin(profiles, and(eq(profiles.id, invoiceShares.profileId), notTrashed(profiles)))
    .where(eq(invoiceShares.token, token))
    .limit(1);
  if (!found) return null;
  if (found.share.expiresAt && found.share.expiresAt.getTime() < Date.now()) return null;
  if (found.invoice.status === "draft") return null;
  return found;
}

export async function resolveInvoiceShare(token: unknown): Promise<SharedInvoice | null> {
  const found = await activeShare(token);
  if (!found) return null;
  const db = getDb();
  const [items, money, seller] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, found.invoice.id)),
    getWorkspaceMoneyFormat(found.invoice.workspaceId),
    found.invoice.sellerId
      ? db
          .select({ logoKey: invoiceSellers.logoKey })
          .from(invoiceSellers)
          .where(eq(invoiceSellers.id, found.invoice.sellerId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const hasLogo = Boolean(seller[0]?.logoKey);
  const dto = serializeInvoice(found.invoice, items, hasLogo);
  const invoice: SharedInvoice["invoice"] = {
    id: dto.id,
    kind: dto.kind,
    status: dto.status,
    number: dto.number,
    quoteTitle: dto.quoteTitle,
    client: dto.client,
    seller: dto.seller,
    upiId: dto.upiId,
    hasLogo: dto.hasLogo,
    issueDate: dto.issueDate,
    dueDate: dto.dueDate,
    currency: dto.currency,
    discountType: dto.discountType,
    discountRate: dto.discountRate,
    discountFixedMinor: dto.discountFixedMinor,
    taxLabel: dto.taxLabel,
    taxRate: dto.taxRate,
    subtotalMinor: dto.subtotalMinor,
    discountMinor: dto.discountMinor,
    taxMinor: dto.taxMinor,
    totalMinor: dto.totalMinor,
    notes: dto.notes,
    terms: dto.terms,
    template: dto.template,
    showCredit: dto.showCredit,
    hasPdf: dto.hasPdf,
    sentAt: dto.sentAt,
    paidAt: dto.paidAt,
    paidOn: dto.paidOn,
    voidedAt: dto.voidedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    items: dto.items,
  };
  return { invoice, locale: money.locale, hasLogo };
}

/** The PDF behind a share link. */
export async function getSharedInvoicePdf(token: unknown): Promise<InvoicePdf | null> {
  const found = await activeShare(token);
  if (!found) return null;
  const items = await getDb().select().from(invoiceItems).where(eq(invoiceItems.invoiceId, found.invoice.id));
  const dto = serializeInvoice(found.invoice, items, false);
  return pdfOf(dto, found.invoice.workspaceId, found.invoice.pdfKey);
}

/** The seller logo behind a share link — key and type, or null. */
export async function getSharedInvoiceLogo(token: unknown): Promise<{ key: string; contentType: string } | null> {
  const found = await activeShare(token);
  if (!found?.invoice.sellerId) return null;
  const [seller] = await getDb()
    .select({ key: invoiceSellers.logoKey, type: invoiceSellers.logoContentType })
    .from(invoiceSellers)
    .where(eq(invoiceSellers.id, found.invoice.sellerId))
    .limit(1);
  return seller?.key ? { key: seller.key, contentType: seller.type ?? "image/png" } : null;
}

// ── From the free generator ────────────────────────────────────────────────

/** A content hash, hex — the import's idempotency key. */
async function contentKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bring a draft from the free generator (`/tools/invoice-generator`) in after
 * sign-up: it becomes a **draft** in the chosen profile, the same as one typed
 * here. When the profile has no business details yet and the workspace has
 * room, the draft's "from" details (and logo) are saved as them. The same
 * draft brought in twice — a double click, a reload — is the one invoice
 * (`import_key`, a hash of the content).
 */
export async function importInvoiceDraft(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ invoice: InvoiceDTO; created: boolean; sellerSaved: boolean }> {
  const data = parseOrThrow(importInvoiceDraftSchema, input);
  await requireProfileIn(userId, workspaceId, data.profileId, "editor");
  const { logo, saveSeller, ...content } = data;
  const importKey = await contentKey(content);

  const db = getDb();
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.profileId, data.profileId), eq(invoices.importKey, importKey)))
    .limit(1);
  if (existing) return { invoice: (await getInvoiceDTO(userId, workspaceId, existing.id))!, created: false, sellerSaved: false };

  const ent = await getWorkspaceEntitlements(workspaceId);
  let sellerId: string | null = null;
  let sellerSaved = false;
  const [own] = await db
    .select()
    .from(invoiceSellers)
    .where(eq(invoiceSellers.profileId, data.profileId))
    .limit(1);
  if (own) {
    sellerId = own.id;
  } else if (saveSeller && content.seller.name) {
    try {
      const seller = await createSeller(userId, workspaceId, {
        profileId: data.profileId,
        name: content.seller.name,
        address: content.seller.address,
        contact: content.seller.contact,
        taxId: content.seller.taxId,
        upiId: content.upiId,
      });
      sellerId = seller.id;
      sellerSaved = true;
      if (logo) {
        const [row] = await db.select().from(invoiceSellers).where(eq(invoiceSellers.id, seller.id)).limit(1);
        await Promise.resolve()
          .then(() => storeSellerLogo(row!, workspaceId, decodeLogoBase64(logo.base64)))
          .catch(
          (err: unknown) => {
            // The draft still comes in; the logo can be added later.
            logger.warn(`Imported logo wasn't stored: ${describeError(err)}`, { event: "invoice.import_logo_skipped" });
          },
        );
      }
    } catch (err) {
      // No room for business details on this plan: the draft still comes in.
      if (!(err instanceof ApiError) || err.code !== "plan_limit") throw err;
    }
  }

  const { columns, lines } = await draftColumns({ ...content, sellerId: content.sellerId ?? sellerId }, data.profileId, ent);
  try {
    const id = await insertDraft(userId, ent, {
      kind: data.kind,
      profileId: data.profileId,
      columns,
      lines,
      extra: { importKey },
    });
    logger.info(`Draft ${data.kind} brought in from the free generator`, { event: "invoice.imported", invoiceId: id });
    return { invoice: (await getInvoiceDTO(userId, workspaceId, id))!, created: true, sellerSaved };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // The same draft, imported at the same moment by another tab.
    const [raced] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.profileId, data.profileId), eq(invoices.importKey, importKey)))
      .limit(1);
    return { invoice: (await getInvoiceDTO(userId, workspaceId, raced!.id))!, created: false, sellerSaved };
  }
}

// ── Moving a profile's invoices ────────────────────────────────────────────

/**
 * Re-file every invoice, line, client, seller and share link of one profile
 * under another of the same workspace — "delete profile, move its
 * transactions" takes the invoices along (`services/profiles.ts`). Inside the
 * caller's transaction.
 */
export async function reprofileInvoices(tx: Tx, fromProfileId: string, toProfileId: string): Promise<void> {
  const to = { profileId: toProfileId };
  await tx.update(invoices).set(to).where(eq(invoices.profileId, fromProfileId));
  await tx.update(invoiceItems).set(to).where(eq(invoiceItems.profileId, fromProfileId));
  await tx.update(invoiceClients).set(to).where(eq(invoiceClients.profileId, fromProfileId));
  await tx.update(invoiceSellers).set(to).where(eq(invoiceSellers.profileId, fromProfileId));
  await tx.update(invoiceShares).set(to).where(eq(invoiceShares.profileId, fromProfileId));
}
