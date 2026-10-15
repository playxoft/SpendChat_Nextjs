import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceDetailBody } from "@/components/app/invoices/invoice-detail";
import { loadInvoiceDetail } from "@/services/invoice-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

/**
 * One invoice or quote on its own page: the document as it will print, and
 * what can be done with it. The invoices list shows the same in a side panel.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await getAppContext();
  const data = await loadInvoiceDetail(user.id, workspace, id);
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <InvoiceDetailBody
        data={data}
        leading={
          <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        }
        trailing={<AccountControls />}
      />
    </div>
  );
}
