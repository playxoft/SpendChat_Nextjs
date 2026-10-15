import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getCategories } from "@/lib/queries";
import { rolesAtLeast } from "@/lib/rbac";
import { getTimeZone } from "@/lib/timezone.server";
import { formatDate } from "@/lib/tools/date-math";
import { getEffectiveProfileRole } from "@/lib/workspaces";
import { sellerLogoUrl } from "@/lib/invoice-doc";
import { getInvoice, getSeller } from "@/services/invoices";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceActions } from "@/components/app/invoices/invoice-actions";
import { InvoiceStatusBadge } from "@/components/app/invoices/invoice-status";
import { InvoicePaper } from "@/components/app/invoices/invoice-paper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

/** One invoice or quote: the document as it will print, and what can be done with it. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await getAppContext();
  const invoice = await getInvoice(user.id, workspace.id, id);
  if (!invoice) notFound();
  const [access, categories, timeZone, seller] = await Promise.all([
    getEffectiveProfileRole(user.id, invoice.profileId),
    getCategories(workspace.id),
    getTimeZone(),
    invoice.sellerId ? getSeller(user.id, workspace.id, invoice.sellerId) : null,
  ]);
  const canEdit = Boolean(access && rolesAtLeast("editor").includes(access.role));
  const today = todayISO(timeZone);
  const noun = invoice.kind === "quote" ? "quote" : "invoice";
  const title = invoice.number ?? `Draft ${noun}`;
  const locale = workspace.locale;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            <InvoiceStatusBadge kind={invoice.kind} status={invoice.status} dueDate={invoice.dueDate} today={today} />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.client.name || "No client yet"} · {formatMoney(invoice.totalMinor, invoice.currency, locale)}
            {invoice.status === "draft" && " · numbered when you finalise"}
          </p>
        </div>
        <AccountControls />
      </div>

      <InvoiceActions
        doc={invoice}
        canEdit={canEdit}
        workspaceCurrency={workspace.currency}
        locale={locale}
        today={today}
        incomeCategories={categories.filter((c) => c.kind === "income").map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
      />

      {(invoice.status === "paid" || invoice.sourceQuoteId || invoice.status === "void") && (
        <div className="space-y-1 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          {invoice.status === "paid" && invoice.paidAmountMinor !== null && (
            <p>
              Paid{invoice.paidOn ? ` on ${formatDate(invoice.paidOn, locale, "medium")}` : ""} —{" "}
              {formatMoney(invoice.paidAmountMinor, workspace.currency, locale)} recorded as income
              {invoice.paidTransactionId ? (
                <>
                  {" "}
                  (<Link href="/app/transactions" className="underline underline-offset-2">see transactions</Link>)
                </>
              ) : (
                " (the entry has since been deleted)"
              )}
              .
            </p>
          )}
          {invoice.status === "void" && <p>Void — kept on record with its number.</p>}
          {invoice.sourceQuoteId && (
            <p>
              Made from a{" "}
              <Link href={`/app/invoices/${invoice.sourceQuoteId}`} className="underline underline-offset-2">
                quote
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <InvoicePaper invoice={invoice} locale={locale} logoUrl={seller ? sellerLogoUrl(seller) : null} />
    </div>
  );
}
