import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext, requireUser } from "@/lib/auth";
import { canAddAnyBudget, monthKeyOf, monthName } from "@/lib/budgets";
import { todayISO } from "@/lib/dates";
import { OPEN_WORKSPACE_PARAM } from "@/lib/invite-links";
import { getCategories, getProfiles } from "@/lib/queries";
import { getTimeZone } from "@/lib/timezone.server";
import { getBudgetManagement, listBudgets } from "@/services/budgets";
import { openWorkspaceIfAccessible } from "@/services/workspaces";
import { BudgetManager } from "@/components/app/budgets/budget-manager";
import type { BudgetItem } from "@/components/app/budgets/budget-parts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Budgets",
  robots: { index: false, follow: false },
};

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `/app/budgets?workspace=<id>` — a budget alert email's link. Switch to that
  // workspace if the person can open it, then drop the param (like `/app`).
  const sp = await searchParams;
  const openParam = sp[OPEN_WORKSPACE_PARAM];
  const openWorkspaceId = Array.isArray(openParam) ? openParam[0] : openParam;
  if (openWorkspaceId) {
    const user = await requireUser();
    await openWorkspaceIfAccessible(user.id, openWorkspaceId);
    redirect("/app/budgets");
  }

  const { user, workspace } = await getAppContext();
  // "This month" is the viewer's calendar month, the same one analytics shows.
  const today = todayISO(await getTimeZone());
  const month = monthKeyOf(today);
  const [budgets, management, profiles, categories] = await Promise.all([
    listBudgets(user.id, workspace.id, month),
    getBudgetManagement(user.id, workspace.id),
    getProfiles(user.id, workspace.id),
    getCategories(workspace.id),
  ]);

  const items: BudgetItem[] = budgets.map((b) => ({
    id: b.id,
    scope: b.scope,
    profileId: b.profileId,
    categoryId: b.categoryId,
    label: b.label,
    icon: b.icon,
    amountMinor: b.amountMinor,
    spentMinor: b.spentMinor,
    percent: b.percent,
    status: b.status,
    emailAlerts: b.emailAlerts,
    canManage: b.canManage,
    canDelete: b.canDelete,
  }));

  // What the form may still offer: the scopes this person manages that don't
  // have a budget yet (one per scope). A view-only workspace offers nothing.
  const { scopes, readOnly } = management;
  const takenProfiles = new Set(items.map((b) => b.profileId));
  const takenCategories = new Set(items.map((b) => b.categoryId));
  const manageable = new Set(scopes.profileIds);
  const choices = readOnly
    ? { workspace: false, profiles: [], categories: [] }
    : {
        workspace: scopes.workspace && !items.some((b) => b.scope === "workspace"),
        profiles: profiles
          .filter((p) => manageable.has(p.id) && !takenProfiles.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, icon: p.icon })),
        categories: scopes.category
          ? categories
              .filter((c) => c.kind === "expense" && !takenCategories.has(c.id))
              .map((c) => ({ id: c.id, name: c.name, icon: c.icon }))
          : [],
      };

  const monthLabel = monthName(month, workspace.locale);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Monthly limits on spending. Each one starts again on the 1st.
        </p>
      </div>
      <BudgetManager
        budgets={items}
        choices={choices}
        canAdd={!readOnly && canAddAnyBudget(scopes)}
        currency={workspace.currency}
        locale={workspace.locale}
        monthLabel={monthLabel}
      />
    </div>
  );
}
