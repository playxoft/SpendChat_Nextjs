import { DocPaper } from "@/components/business-doc/doc-paper";
import { docLabels } from "@/lib/business-doc/labels";
import { docTheme } from "@/lib/business-doc/templates";
import {
  DOC_KIND,
  invoiceDates,
  invoiceEvaluation,
  invoicePayment,
  invoiceToDoc,
  type InvoiceDTO,
  type InvoiceDocSource,
} from "@/lib/invoice-doc";

/**
 * A stored invoice or quote on paper — the generator's `DocPaper` with the
 * figures exactly as stored, the template, the UPI code and the logo. For the
 * app's document page and the public share page (`logoUrl` differs).
 */
export function InvoicePaper({
  invoice,
  locale,
  logoUrl,
}: {
  invoice: InvoiceDocSource &
    Pick<InvoiceDTO, "status" | "upiId" | "totalMinor" | "subtotalMinor" | "discountMinor" | "taxMinor" | "template"> & {
      items: InvoiceDTO["items"];
    };
  locale: string;
  /** Where the seller's logo is served for this viewer, or null for none. */
  logoUrl: string | null;
}) {
  const doc = invoiceToDoc(invoice, { locale, logo: logoUrl });
  if (!invoice.number) doc.number = "Draft";
  return (
    <div className="@container mx-auto w-full max-w-[860px]">
      <DocPaper
        doc={doc}
        labels={docLabels(DOC_KIND[invoice.kind], invoice.quoteTitle)}
        evaluation={invoiceEvaluation(invoice)}
        dates={invoiceDates(invoice)}
        currency={doc.currency ?? invoice.currency}
        locale={locale}
        printable={false}
        theme={docTheme(invoice.template)}
        payment={invoicePayment(invoice)}
        creditHref="/"
      />
    </div>
  );
}
