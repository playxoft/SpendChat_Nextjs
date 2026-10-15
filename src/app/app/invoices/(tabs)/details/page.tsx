import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { SellerManager } from "@/components/app/invoices/seller-manager";
import { loadEditorData } from "@/services/invoice-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your business details", robots: { index: false, follow: false } };

/** "Your details" — the businesses invoices are from, each with its logo. */
export default async function InvoiceDetailsPage() {
  const { user, workspace } = await getAppContext();
  const [data, profiles, limits] = await Promise.all([
    loadEditorData(user.id, workspace.id),
    getProfiles(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
  ]);
  const meter = limits.invoiceSellers;
  return (
    <SellerManager
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
      sellers={data.sellers}
      writable={data.readOnly ? [] : data.writable.map((p) => p.id)}
      limit={{ used: meter.used, max: meter.limit, reached: meter.reached }}
    />
  );
}
