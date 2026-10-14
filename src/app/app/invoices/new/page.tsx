import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/auth";
import { defaultDoc } from "@/lib/business-doc/invoice";
import { todayISO } from "@/lib/dates";
import { getAddLimits } from "@/lib/entitlements";
import { sellerLogoUrl } from "@/lib/invoice-doc";
import { DEFAULT_INVOICE_TEMPLATE, type InvoiceKind } from "@/lib/invoices";
import { getTimeZone } from "@/lib/timezone.server";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceEditor } from "@/components/app/invoices/invoice-editor";
import { loadEditorData } from "../_lib/editor-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New invoice", robots: { index: false, follow: false } };

/** A new draft invoice (`?kind=invoice`) or quote (`?kind=quote`), optionally in `?profile=`. */
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; profile?: string }>;
}) {
  const sp = await searchParams;
  const kind: InvoiceKind = sp.kind === "quote" ? "quote" : "invoice";
  const { user, workspace } = await getAppContext();
  const [data, limits, timeZone] = await Promise.all([
    loadEditorData(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
    getTimeZone(),
  ]);
  const today = todayISO(timeZone);
  const title = kind === "quote" ? "New quote" : "New invoice";

  const blocked = data.readOnly
    ? "This workspace is view-only."
    : data.writable.length === 0
      ? "You can only view invoices here — ask an admin for edit access to a profile."
      : limits.invoices.reached
        ? `You've made ${limits.invoices.limit} invoices and quotes this month — you can make more next month.`
        : null;

  const profileId = data.writable.find((p) => p.id === sp.profile)?.id ?? data.writable[0]?.id ?? "";
  const seller = data.sellers.find((s) => s.profileId === profileId) ?? null;
  const doc = { ...defaultDoc(kind === "quote" ? "quotation" : "invoice"), number: "", issueDate: today, currency: workspace.currency };
  if (seller) {
    doc.from = { name: seller.name, address: seller.address ?? "", contact: seller.contact ?? "", taxId: seller.taxId ?? "" };
    doc.logo = sellerLogoUrl(seller);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        </div>
        <AccountControls />
      </div>
      {blocked ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{blocked}</p>
      ) : (
        <InvoiceEditor
          invoiceId={null}
          kind={kind}
          initialDoc={doc}
          initial={{
            profileId,
            clientId: null,
            sellerId: seller?.id ?? null,
            upiId: seller?.upiId ?? "",
            template: DEFAULT_INVOICE_TEMPLATE,
            currency: workspace.currency,
          }}
          profiles={data.writable}
          clients={data.clients}
          sellers={data.sellers}
          locale={workspace.locale}
          today={today}
          footer={data.footer}
        />
      )}
    </div>
  );
}
