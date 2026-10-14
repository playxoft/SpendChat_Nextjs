import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { billingAvailable } from "@/lib/billing-config";
import { getBillingOverview } from "@/services/billing";
import { BillingSettings } from "@/components/app/billing-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

/** Settings → Billing: every workspace this person administers, with its plan, billing and invoices. */
export default async function BillingSettingsPage() {
  const { user, workspace } = await getAppContext();
  const data = await getBillingOverview(user.id);
  return <BillingSettings data={data} currentWorkspaceId={workspace.id} billingReady={billingAvailable()} />;
}
