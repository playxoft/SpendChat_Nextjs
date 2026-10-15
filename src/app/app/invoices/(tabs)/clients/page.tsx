import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { ClientManager } from "@/components/app/invoices/client-manager";
import { loadEditorData } from "@/services/invoice-editor";

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
    <ClientManager
      clients={data.clients}
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
      writable={data.readOnly ? [] : data.writable.map((p) => p.id)}
      limit={{ used: meter.used, max: meter.limit, reached: meter.reached }}
    />
  );
}
