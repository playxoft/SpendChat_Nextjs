import Link from "next/link";
import type { ReactNode } from "react";
import { dateISOIn } from "@/lib/dates";
import { sellerLogoUrl, type InvoiceDTO } from "@/lib/invoice-doc";
import type { InvoiceSellerDTO } from "@/lib/invoice-queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import { InvoiceActions } from "./invoice-actions";
import { InvoicePaper } from "./invoice-paper";
import { InvoiceKindBadge, InvoiceStatusBadge } from "./invoice-status";

export type InvoiceDetailData = {
  invoice: InvoiceDTO;
  canEdit: boolean;
  incomeCategories: { id: string; name: string; icon: string | null }[];
  seller: InvoiceSellerDTO | null;
  today: string;
  timeZone: string;
  locale: string;
  workspaceCurrency: string;
};

/**
 * One invoice or quote: its heading, what can be done with it, how it ended
 * (paid, void, made from a quote) and the document as it will print. The full
 * page and the invoices list's side panel both draw it; they differ only in
 * what sits above the title (`leading`) and beside it (`trailing`). Plain
 * (no server-only imports), so the side panel can draw it in the browser.
 */
export function InvoiceDetailBody({
  data,
  leading,
  trailing,
  onEdit,
  onDeleted,
}: {
  data: InvoiceDetailData;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Edit in place (the list's panel) — see `InvoiceActions`. */
  onEdit?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const { invoice, locale, today, workspaceCurrency } = data;
  const noun = invoice.kind === "quote" ? "quote" : "invoice";
  const title = invoice.number ?? `Draft ${noun}`;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {leading}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <InvoiceKindBadge kind={invoice.kind} />
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            <InvoiceStatusBadge kind={invoice.kind} status={invoice.status} dueDate={invoice.dueDate} today={today} />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.client.name || "No client yet"} · {formatMoney(invoice.totalMinor, invoice.currency, locale)}
            {invoice.status === "draft" && " · numbered when you finalise"}
            {invoice.editedAt &&
              ` · edited ${formatDate(dateISOIn(new Date(invoice.editedAt), data.timeZone), locale, "medium")}`}
          </p>
        </div>
        {trailing}
      </div>

      <InvoiceActions
        doc={invoice}
        canEdit={data.canEdit}
        workspaceCurrency={workspaceCurrency}
        locale={locale}
        today={today}
        incomeCategories={data.incomeCategories}
        onEdit={onEdit}
        onDeleted={onDeleted}
      />

      {(invoice.status === "paid" || invoice.sourceQuoteId || invoice.status === "void") && (
        <div className="space-y-1 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          {invoice.status === "paid" && invoice.paidAmountMinor !== null && (
            <p>
              Paid{invoice.paidOn ? ` on ${formatDate(invoice.paidOn, locale, "medium")}` : ""} —{" "}
              {formatMoney(invoice.paidAmountMinor, workspaceCurrency, locale)} recorded as income
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

      <InvoicePaper invoice={invoice} locale={locale} logoUrl={data.seller ? sellerLogoUrl(data.seller) : null} />
    </div>
  );
}
