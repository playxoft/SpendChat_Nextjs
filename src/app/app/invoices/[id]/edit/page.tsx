import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import { loadInvoiceEditor } from "@/services/invoice-editor";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceEditor, FinalisedEditNote } from "@/components/app/invoices/invoice-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit", robots: { index: false, follow: false } };

/**
 * Edit a draft, or a finalised document that isn't paid or void (`canEdit`) —
 * that one keeps its number and records the edit's date. Anything else (or
 * one the person can't edit) goes back to its page.
 */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await getAppContext();
  const payload = await loadInvoiceEditor(user.id, workspace, { mode: "edit", id });
  if (!payload) redirect(`/app/invoices/${id}`);
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/app/invoices/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {payload.number ? `Back to ${payload.number}` : "Back to the draft"}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {payload.number ? `Edit ${payload.kind} ${payload.number}` : `Edit draft ${payload.kind}`}
          </h1>
        </div>
        <AccountControls />
      </div>
      {payload.number && <FinalisedEditNote kind={payload.kind} number={payload.number} />}
      <InvoiceEditor payload={payload} />
    </div>
  );
}
