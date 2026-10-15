import "server-only";
import { todayISO } from "@/lib/dates";
import { getCategories } from "@/lib/queries";
import { rolesAtLeast } from "@/lib/rbac";
import { getTimeZone } from "@/lib/timezone.server";
import { getEffectiveProfileRole } from "@/lib/workspaces";
import { getInvoice, getSeller } from "./invoices";
import type { InvoiceDetailData } from "@/components/app/invoices/invoice-detail";

/**
 * Everything one document's view needs — the invoice page and the invoices
 * list's side panel (`loadInvoicePanel`) — read as the caller, or null when
 * they can't see it.
 */
export async function loadInvoiceDetail(
  userId: string,
  workspace: { id: string; currency: string; locale: string },
  id: string,
): Promise<InvoiceDetailData | null> {
  const invoice = await getInvoice(userId, workspace.id, id);
  if (!invoice) return null;
  const [access, categories, timeZone, seller] = await Promise.all([
    getEffectiveProfileRole(userId, invoice.profileId),
    getCategories(workspace.id),
    getTimeZone(),
    invoice.sellerId ? getSeller(userId, workspace.id, invoice.sellerId) : null,
  ]);
  return {
    invoice,
    canEdit: Boolean(access && rolesAtLeast("editor").includes(access.role)),
    incomeCategories: categories
      .filter((c) => c.kind === "income")
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    seller,
    today: todayISO(timeZone),
    timeZone,
    locale: workspace.locale,
    workspaceCurrency: workspace.currency,
  };
}

