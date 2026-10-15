import { AccountControls } from "@/components/app/account-controls";
import { InvoicesShell, InvoicesTabs } from "@/components/app/invoices/invoices-tabs";

/**
 * The heading and tabs shared by "Invoices & quotes", "Clients" and "Your
 * details" — the title, the tabs under it, and the screen's remaining height
 * for the tab's list and panel.
 * Being a layout, it stays mounted across the tabs: a tab switch shows only
 * that tab's content skeleton (each tab's own `loading.tsx`), not a whole-page
 * one. There's deliberately no `loading.tsx` above this, so a prefetch renders
 * the heading for real down to the tab's boundary.
 */
export default function InvoicesTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <InvoicesShell>
      <div className="shrink-0">
        <div className="flex h-8 items-center gap-3">
          <h1 className="text-lg font-semibold">Invoices</h1>
          <AccountControls className="ml-auto" />
        </div>
        <div className="border-b">
          <InvoicesTabs />
        </div>
      </div>
      {/* The rest of the screen's height, for the tab's list and panel. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </InvoicesShell>
  );
}
