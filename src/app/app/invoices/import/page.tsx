import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getAddLimits } from "@/lib/entitlements";
import { getTimeZone } from "@/lib/timezone.server";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceImport } from "@/components/app/invoices/invoice-import";
import { loadEditorData } from "../_lib/editor-data";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Bring your invoice in", robots: { index: false, follow: false } };

/**
 * Where "Save to SpendChat" on the free invoice / quotation generator lands
 * after sign-up. The draft only exists in the browser, so the page is a client
 * component; the server lends the profiles and the limits.
 */
export default async function InvoiceImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "quote" ? "quote" : "invoice";
  const { user, workspace } = await getAppContext();
  const [data, limits, timeZone] = await Promise.all([
    loadEditorData(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
    getTimeZone(),
  ]);
  const blocked = data.readOnly
    ? "This workspace is view-only, so nothing can be added to it."
    : data.writable.length === 0
      ? "You can only view invoices in this workspace — switch to your own workspace to bring this in."
      : limits.invoices.reached
        ? `You've made ${limits.invoices.limit} invoices and quotes this month — bring this in next month, or keep it in the generator meanwhile.`
        : null;
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bring your {kind} in</h1>
          <p className="text-sm text-muted-foreground">
            Keep it with your money: numbered for you, with your clients, a pay link, and income when it&apos;s paid.
          </p>
        </div>
        <AccountControls />
      </div>
      <InvoiceImport kind={kind} profiles={data.writable} today={todayISO(timeZone)} blocked={blocked} />
    </div>
  );
}
