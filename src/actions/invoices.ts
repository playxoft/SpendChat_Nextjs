"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { parseOrThrow } from "@/lib/api-response";
import { invoiceEditorTargetSchema } from "@/lib/validation";
import { notFound } from "@/lib/errors";
import type { InvoiceClientDTO, InvoiceSellerDTO } from "@/lib/invoice-queries";
import type {
  CreateInvoiceInput,
  ImportInvoiceDraftInput,
  InvoiceClientInput,
  InvoiceSellerInput,
  MarkInvoicePaidInput,
  UpdateInvoiceClientInput,
  UpdateInvoiceSellerInput,
} from "@/lib/validation";
import * as invoiceService from "@/services/invoices";
import { loadInvoiceDetail } from "@/services/invoice-detail";
import { loadInvoiceEditor, type InvoiceEditorPayload, type InvoiceEditorTarget } from "@/services/invoice-editor";
import type { InvoiceDetailData } from "@/components/app/invoices/invoice-detail";
import type { InvoiceShareDTO } from "@/services/invoices";

/**
 * Server actions for invoices and quotes — the web half of
 * `services/invoices.ts` (the REST API is the other). Every one writes except
 * `listInvoiceShareLinks`, which reads (`rateLimit: "read"`).
 */

function revalidateInvoices() {
  revalidatePath("/app/invoices", "layout");
  // The layout's add limits (this month's count) and the usage panel.
  revalidatePath("/app", "layout");
}

async function context() {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return { user, workspace };
}

/**
 * One document's view for the invoices list's side panel, read as the caller
 * (404 when they can't see it). A read, so it counts against the read bucket.
 */
export async function loadInvoicePanel(id: string): Promise<ActionResult<{ detail: InvoiceDetailData }>> {
  const { user, workspace } = await context();
  return runAction(
    "loadInvoicePanel",
    async () => {
      const detail = await loadInvoiceDetail(user.id, workspace, id);
      if (!detail) throw notFound("That document isn't here");
      return { detail };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id, rateLimit: "read" },
  );
}

/**
 * The editor's opening state for the invoices list's side panel: a new
 * invoice or quote, or one to edit (404 when it isn't there or can't change).
 */
export async function loadInvoiceEditorPanel(
  target: InvoiceEditorTarget,
): Promise<ActionResult<{ payload: InvoiceEditorPayload }>> {
  const { user, workspace } = await context();
  return runAction(
    "loadInvoiceEditorPanel",
    async () => {
      const payload = await loadInvoiceEditor(user.id, workspace, parseOrThrow(invoiceEditorTargetSchema, target));
      if (!payload) throw notFound("That document can't be edited");
      return { payload };
    },
    { userId: user.id, workspaceId: workspace.id, rateLimit: "read" },
  );
}

/** Save a draft: a new one (no `id`) or the whole content of an existing draft. */
export async function saveInvoiceDraft(
  id: string | null,
  input: CreateInvoiceInput,
): Promise<ActionResult<{ id: string }>> {
  const { user, workspace } = await context();
  return runAction(
    "saveInvoiceDraft",
    async () => {
      const saved = id
        ? await invoiceService.updateInvoice(user.id, workspace.id, id, input)
        : await invoiceService.createInvoice(user.id, workspace.id, input);
      revalidateInvoices();
      return { id: saved.id };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

export async function deleteInvoiceDraft(id: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "deleteInvoiceDraft",
    async () => {
      if (!(await invoiceService.deleteInvoice(user.id, workspace.id, id))) throw notFound("Invoice not found");
      revalidateInvoices();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

/** Give a draft its number and lock it (its PDF is stored). */
export async function finaliseInvoice(id: string): Promise<ActionResult<{ number: string | null }>> {
  const { user, workspace } = await context();
  return runAction(
    "finaliseInvoice",
    async () => {
      const invoice = await invoiceService.finaliseInvoice(user.id, workspace.id, id);
      revalidateInvoices();
      return { number: invoice.number };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

export async function voidInvoice(id: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "voidInvoice",
    async () => {
      await invoiceService.voidInvoice(user.id, workspace.id, id);
      revalidateInvoices();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

export async function markInvoicePaid(
  id: string,
  input: MarkInvoicePaidInput,
): Promise<ActionResult<{ transactionId: string | null; alreadyPaid: boolean }>> {
  const { user, workspace } = await context();
  return runAction(
    "markInvoicePaid",
    async () => {
      const result = await invoiceService.markInvoicePaid(user.id, workspace, id, input);
      revalidateInvoices();
      // The income entry shows up in the tracker, the list and analytics.
      revalidatePath("/app");
      revalidatePath("/app/transactions");
      return { transactionId: result.transactionId, alreadyPaid: result.alreadyPaid };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

/** A quote becomes a new draft invoice. */
export async function convertQuoteToInvoice(id: string): Promise<ActionResult<{ id: string }>> {
  const { user, workspace } = await context();
  return runAction(
    "convertQuoteToInvoice",
    async () => {
      const invoice = await invoiceService.convertQuote(user.id, workspace.id, id);
      revalidateInvoices();
      return { id: invoice.id };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

/** "Send as link": finalise a draft first, then a link to send (the newest live one, or a new one). */
export async function sendInvoiceLink(id: string): Promise<ActionResult<{ share: InvoiceShareDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "sendInvoiceLink",
    async () => {
      const { share } = await invoiceService.sendInvoiceAsLink(user.id, workspace.id, id);
      revalidateInvoices();
      return { share };
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

export async function createInvoiceShareLink(
  id: string,
  expiresInDays: number | null,
): Promise<ActionResult<{ share: InvoiceShareDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "createInvoiceShareLink",
    async () => ({ share: await invoiceService.createInvoiceShare(user.id, workspace.id, id, { expiresInDays }) }),
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

export async function listInvoiceShareLinks(id: string): Promise<ActionResult<{ shares: InvoiceShareDTO[] }>> {
  const { user, workspace } = await context();
  return runAction(
    "listInvoiceShareLinks",
    async () => ({ shares: await invoiceService.listInvoiceShares(user.id, workspace.id, id) }),
    { userId: user.id, workspaceId: workspace.id, invoiceId: id, rateLimit: "read" },
  );
}

export async function revokeInvoiceShareLink(id: string, shareId: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "revokeInvoiceShareLink",
    async () => {
      if (!(await invoiceService.revokeInvoiceShare(user.id, workspace.id, id, shareId))) {
        throw notFound("Link not found");
      }
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, invoiceId: id },
  );
}

// ── Clients ────────────────────────────────────────────────────────────────

export async function saveInvoiceClient(input: InvoiceClientInput): Promise<ActionResult<{ client: InvoiceClientDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "saveInvoiceClient",
    async () => {
      const client = await invoiceService.createClient(user.id, workspace.id, input);
      revalidateInvoices();
      return { client };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function updateInvoiceClient(
  id: string,
  input: UpdateInvoiceClientInput,
): Promise<ActionResult<{ client: InvoiceClientDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "updateInvoiceClient",
    async () => {
      const client = await invoiceService.updateClient(user.id, workspace.id, id, input);
      if (!client) throw notFound("Client not found");
      revalidateInvoices();
      return { client };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function deleteInvoiceClient(id: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "deleteInvoiceClient",
    async () => {
      if (!(await invoiceService.deleteClient(user.id, workspace.id, id))) throw notFound("Client not found");
      revalidateInvoices();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

// ── Business details ───────────────────────────────────────────────────────

export async function saveInvoiceSeller(input: InvoiceSellerInput): Promise<ActionResult<{ seller: InvoiceSellerDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "saveInvoiceSeller",
    async () => {
      const seller = await invoiceService.createSeller(user.id, workspace.id, input);
      revalidateInvoices();
      return { seller };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function updateInvoiceSeller(
  id: string,
  input: UpdateInvoiceSellerInput,
): Promise<ActionResult<{ seller: InvoiceSellerDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "updateInvoiceSeller",
    async () => {
      const seller = await invoiceService.updateSeller(user.id, workspace.id, id, input);
      if (!seller) throw notFound("Business details not found");
      revalidateInvoices();
      return { seller };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function deleteInvoiceSeller(id: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "deleteInvoiceSeller",
    async () => {
      if (!(await invoiceService.deleteSeller(user.id, workspace.id, id))) throw notFound("Business details not found");
      revalidateInvoices();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** A logo, already redrawn as a PNG or JPEG by the browser, as base64 (no `data:` prefix). */
export async function setInvoiceSellerLogo(
  id: string,
  base64: string,
): Promise<ActionResult<{ seller: InvoiceSellerDTO }>> {
  const { user, workspace } = await context();
  return runAction(
    "setInvoiceSellerLogo",
    async () => {
      const bytes = invoiceService.decodeLogoBase64(base64);
      const seller = await invoiceService.setSellerLogo(user.id, workspace.id, id, bytes);
      revalidateInvoices();
      return { seller };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function removeInvoiceSellerLogo(id: string): Promise<ActionResult> {
  const { user, workspace } = await context();
  return runAction(
    "removeInvoiceSellerLogo",
    async () => {
      if (!(await invoiceService.removeSellerLogo(user.id, workspace.id, id))) throw notFound("Business details not found");
      revalidateInvoices();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

// ── From the free generator ────────────────────────────────────────────────

export async function importInvoiceDraft(
  input: ImportInvoiceDraftInput,
): Promise<ActionResult<{ id: string; created: boolean; sellerSaved: boolean }>> {
  const { user, workspace } = await context();
  return runAction(
    "importInvoiceDraft",
    async () => {
      const { invoice, created, sellerSaved } = await invoiceService.importInvoiceDraft(user.id, workspace.id, input);
      revalidateInvoices();
      return { id: invoice.id, created, sellerSaved };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
