import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { AccountControls } from "@/components/app/account-controls";
import { InvoicesTabs } from "@/components/app/invoices/invoices-tabs";
import { SellerManager } from "@/components/app/invoices/seller-manager";
import { loadEditorData } from "../_lib/editor-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your business details", robots: { index: false, follow: false } };

/** "Your details" — the business invoices are from, per profile, with its logo. */
export default async function InvoiceDetailsPage() {
  const { user, workspace } = await getAppContext();
  const [data, profiles, limits] = await Promise.all([
    loadEditorData(user.id, workspace.id),
    getProfiles(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Who your invoices and quotes are from.</p>
        </div>
        <AccountControls />
      </div>
      <InvoicesTabs active="details" />
      <SellerManager
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        sellers={data.sellers}
        writable={data.readOnly ? [] : data.writable.map((p) => p.id)}
        limitReached={limits.invoiceSellers.reached}
      />
    </div>
  );
}
