import Link from "next/link";
import { Download } from "lucide-react";
import { createMetadata } from "@/lib/seo";
import { formatDate } from "@/lib/tools/date-math";
import { resolveInvoiceShare } from "@/services/invoices";
import { InvoicePaper } from "@/components/app/invoices/invoice-paper";

export const dynamic = "force-dynamic";

// Public but secret-URL page: never indexed (and `/share/` is robots-disallowed).
export const metadata = createMetadata({
  title: "Shared invoice",
  description: "An invoice or quote shared with you from SpendChat — view it or download the PDF.",
  path: "/share",
  noIndex: true,
});

/**
 * The page behind an invoice or quote's share link. No session — the token is
 * the whole capability (resolved, expiry-checked and trash-checked in the
 * service). Shows the document as it was issued, says if it's been paid or
 * voided, and offers the PDF.
 */
export default async function SharedInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await resolveInvoiceShare(token);
  const base = `/share/invoice/${token}`;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          SpendChat
        </Link>
        <span className="text-xs text-muted-foreground">Shared with you</span>
      </header>

      {!shared ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-20 text-center">
          <h1 className="text-sm font-medium">This link doesn’t work anymore</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have expired or been revoked. Ask the person who sent it for a fresh link.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">
                {shared.invoice.kind === "quote" ? "Quote" : "Invoice"} {shared.invoice.number}
              </h1>
              <p className="text-sm text-muted-foreground">
                From {shared.invoice.seller.name || "the sender"}
                {shared.invoice.status === "paid" &&
                  ` · paid${shared.invoice.paidOn ? ` on ${formatDate(shared.invoice.paidOn, shared.locale, "medium")}` : ""}`}
                {shared.invoice.status === "void" && " · void — no longer valid"}
              </p>
            </div>
            <a
              href={`${base}/pdf?download=1`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              <Download className="size-4" /> Download PDF
            </a>
          </div>
          <InvoicePaper
            invoice={shared.invoice}
            locale={shared.locale}
            logoUrl={shared.hasLogo ? `${base}/logo` : null}
          />
        </>
      )}
    </main>
  );
}
