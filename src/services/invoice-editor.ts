import "server-only";
import { defaultDoc, type BusinessDoc } from "@/lib/business-doc/invoice";
import { todayISO } from "@/lib/dates";
import { getAddLimits, getWorkspaceEntitlements, invoiceLimitsOf } from "@/lib/entitlements";
import { invoiceToDoc, sellerLogoUrl, sellerToDocFrom } from "@/lib/invoice-doc";
import type { InvoiceClientDTO, InvoiceSellerDTO } from "@/lib/invoice-queries";
import { DEFAULT_INVOICE_TEMPLATE, canEdit, type InvoiceKind, type InvoiceTemplateId } from "@/lib/invoices";
import { getProfiles } from "@/lib/queries";
import { rolesAtLeast } from "@/lib/rbac";
import { getTimeZone } from "@/lib/timezone.server";
import { profileRolesFor } from "@/lib/workspaces";
import { getInvoice, listClients, listSellers } from "./invoices";

/** What the invoice editor needs besides the document: where it can go and what's saved there. */
export async function loadEditorData(userId: string, workspaceId: string) {
  const [profiles, roles, clients, sellers, ent] = await Promise.all([
    getProfiles(userId, workspaceId),
    profileRolesFor(userId, workspaceId),
    listClients(userId, workspaceId),
    listSellers(userId, workspaceId),
    getWorkspaceEntitlements(workspaceId),
  ]);
  const editors = rolesAtLeast("editor");
  const writable = profiles
    .filter((p) => editors.includes(roles.get(p.id) ?? "viewer"))
    .map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
  return { writable, clients, sellers, footer: invoiceLimitsOf(ent).footer, readOnly: ent.readOnly };
}

export type InvoiceEditorTarget =
  | { mode: "new"; kind: InvoiceKind; profile?: string | null }
  | { mode: "edit"; id: string };

/** Everything the editor is opened with — on its own page, or in the invoices list's panel. */
export type InvoiceEditorPayload = {
  /** null for a new document. */
  invoiceId: string | null;
  kind: InvoiceKind;
  /** The number of a finalised document being edited (it keeps it); null otherwise. */
  number: string | null;
  /** Why a new one can't be made here (view-only, no editable profile, the month's allowance), or null. */
  blocked: string | null;
  initialDoc: BusinessDoc;
  initial: {
    profileId: string;
    clientId: string | null;
    sellerId: string | null;
    upiId: string;
    template: InvoiceTemplateId;
    currency: string;
  };
  profiles: { id: string; name: string; icon: string | null }[];
  clients: InvoiceClientDTO[];
  sellers: InvoiceSellerDTO[];
  locale: string;
  today: string;
  footer: boolean;
};

/**
 * Open the editor on a new invoice or quote (`?profile=` picks where, when the
 * person can write there), or on one to edit — null when that one isn't there,
 * can't change any more (`canEdit`), or isn't in a profile the person edits.
 */
export async function loadInvoiceEditor(
  userId: string,
  workspace: { id: string; currency: string; locale: string },
  target: InvoiceEditorTarget,
): Promise<InvoiceEditorPayload | null> {
  const [data, timeZone] = await Promise.all([loadEditorData(userId, workspace.id), getTimeZone()]);
  const today = todayISO(timeZone);
  const base = {
    profiles: data.writable,
    clients: data.clients,
    sellers: data.sellers,
    locale: workspace.locale,
    today,
    footer: data.footer,
  };

  if (target.mode === "edit") {
    const invoice = await getInvoice(userId, workspace.id, target.id);
    if (!invoice || !canEdit(invoice.status) || !data.writable.some((p) => p.id === invoice.profileId)) return null;
    const seller = data.sellers.find((s) => s.id === invoice.sellerId) ?? null;
    return {
      ...base,
      invoiceId: invoice.id,
      kind: invoice.kind,
      number: invoice.status === "draft" ? null : invoice.number,
      blocked: null,
      initialDoc: invoiceToDoc(invoice, { locale: workspace.locale, logo: seller ? sellerLogoUrl(seller) : null }),
      initial: {
        profileId: invoice.profileId,
        clientId: invoice.clientId,
        sellerId: invoice.sellerId,
        upiId: invoice.upiId ?? "",
        template: invoice.template,
        currency: invoice.currency,
      },
    };
  }

  const limits = await getAddLimits(workspace.id, userId);
  const blocked = data.readOnly
    ? "This workspace is view-only."
    : data.writable.length === 0
      ? "You can only view invoices here — ask an admin for edit access to a profile."
      : limits.invoices.reached
        ? `You've made ${limits.invoices.limit} invoices and quotes this month — you can make more next month.`
        : null;
  const profileId = data.writable.find((p) => p.id === target.profile)?.id ?? data.writable[0]?.id ?? "";
  const seller = data.sellers.find((s) => s.profileId === profileId) ?? null;
  const doc = {
    ...defaultDoc(target.kind === "quote" ? "quotation" : "invoice"),
    number: "",
    issueDate: today,
    currency: workspace.currency,
  };
  if (seller) {
    doc.from = sellerToDocFrom(seller);
    doc.logo = sellerLogoUrl(seller);
  }
  return {
    ...base,
    invoiceId: null,
    kind: target.kind,
    number: null,
    blocked,
    initialDoc: doc,
    initial: {
      profileId,
      clientId: null,
      sellerId: seller?.id ?? null,
      upiId: seller?.upiId ?? "",
      template: DEFAULT_INVOICE_TEMPLATE,
      currency: workspace.currency,
    },
  };
}
