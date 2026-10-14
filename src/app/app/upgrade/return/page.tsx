import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth";
import { listUserWorkspaces } from "@/lib/workspaces";
import { DEFAULT_WORKSPACE_ICON } from "@/lib/validation";
import { AccountControls } from "@/components/app/account-controls";
import { ReturnPoller } from "./_components/return-poller";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activating your plan",
  robots: { index: false, follow: false },
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Where the payment provider sends a buyer back to (`return_url`), and where a
 * plan change lands. It shows "Activating…" and polls **our** database
 * (`checkoutReturnStatus`) until the provider's webhook has applied the
 * purchase — the plan never changes because someone reached this page, and the
 * query string the provider appends is never trusted for anything.
 */
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const workspaceId = first(params.workspace);
  const { user } = await getAppContext();
  const workspace = workspaceId ? (await listUserWorkspaces(user.id)).find((w) => w.id === workspaceId) : null;
  if (!workspace) redirect("/app/upgrade");

  const plan = first(params.plan);
  const period = first(params.period);
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex justify-end">
        <AccountControls />
      </div>
      <ReturnPoller
        workspace={{ id: workspace.id, name: workspace.name, icon: workspace.icon ?? DEFAULT_WORKSPACE_ICON }}
        expect={plan && period ? { plan, period } : undefined}
      />
    </div>
  );
}
