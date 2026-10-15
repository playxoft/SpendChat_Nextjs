import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import type { InvoiceKind } from "@/lib/invoices";
import { loadInvoiceEditor } from "@/services/invoice-editor";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceEditor } from "@/components/app/invoices/invoice-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New invoice", robots: { index: false, follow: false } };

/**
 * A new draft invoice (`?kind=invoice`) or quote (`?kind=quote`), optionally in
 * `?profile=`, on its own page — the invoices list opens the same editor in its
 * side panel.
 */
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; profile?: string }>;
}) {
  const sp = await searchParams;
  const kind: InvoiceKind = sp.kind === "quote" ? "quote" : "invoice";
  const { user, workspace } = await getAppContext();
  const payload = (await loadInvoiceEditor(user.id, workspace, { mode: "new", kind, profile: sp.profile }))!;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{kind === "quote" ? "New quote" : "New invoice"}</h1>
        </div>
        <AccountControls />
      </div>
      {payload.blocked ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{payload.blocked}</p>
      ) : (
        <InvoiceEditor payload={payload} />
      )}
    </div>
  );
}
