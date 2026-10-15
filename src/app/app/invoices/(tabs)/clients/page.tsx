import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { AccountControls } from "@/components/app/account-controls";
import { ClientManager } from "@/components/app/invoices/client-manager";
import { InvoicesTabs } from "@/components/app/invoices/invoices-tabs";
import { loadEditorData } from "../_lib/editor-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clients", robots: { index: false, follow: false } };

/** Saved clients for invoices and quotes. */
export default async function InvoiceClientsPage() {
  const { user, workspace } = await getAppContext();
  const [data, profiles, limits] = await Promise.all([
    loadEditorData(user.id, workspace.id),
    getProfiles(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
  ]);
  const meter = limits.invoiceClients;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">The people and companies you bill.</p>
        </div>
        <AccountControls />
      </div>
      <InvoicesTabs active="clients" />
      <ClientManager
        clients={data.clients}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        writable={data.readOnly ? [] : data.writable.map((p) => p.id)}
        limit={{ used: meter.used, max: meter.limit, reached: meter.reached }}
      />
    </div>
  );
}
