import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { invoiceToDoc, sellerLogoUrl } from "@/lib/invoice-doc";
import { getTimeZone } from "@/lib/timezone.server";
import { getInvoice } from "@/services/invoices";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceEditor } from "@/components/app/invoices/invoice-editor";
import { loadEditorData } from "../../_lib/editor-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit draft", robots: { index: false, follow: false } };

/** Edit a draft. A finalised document doesn't change — it goes back to its page. */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await getAppContext();
  const [invoice, data, timeZone] = await Promise.all([
    getInvoice(user.id, workspace.id, id),
    loadEditorData(user.id, workspace.id),
    getTimeZone(),
  ]);
  if (!invoice) notFound();
  const writable = data.writable.some((p) => p.id === invoice.profileId);
  if (invoice.status !== "draft" || !writable) redirect(`/app/invoices/${invoice.id}`);

  const seller = data.sellers.find((s) => s.id === invoice.sellerId) ?? null;
  const doc = invoiceToDoc(invoice, { locale: workspace.locale, logo: seller ? sellerLogoUrl(seller) : null });

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/app/invoices/${invoice.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to the draft
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Edit draft {invoice.kind}</h1>
        </div>
        <AccountControls />
      </div>
      <InvoiceEditor
        invoiceId={invoice.id}
        kind={invoice.kind}
        initialDoc={doc}
        initial={{
          profileId: invoice.profileId,
          clientId: invoice.clientId,
          sellerId: invoice.sellerId,
          upiId: invoice.upiId ?? "",
          template: invoice.template,
          currency: invoice.currency,
        }}
        profiles={data.writable}
        clients={data.clients}
        sellers={data.sellers}
        locale={workspace.locale}
        today={todayISO(timeZone)}
        footer={data.footer}
      />
    </div>
  );
}
