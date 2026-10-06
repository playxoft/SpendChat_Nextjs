import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import { getTimeZone } from "@/lib/timezone.server";
import { SPLIT_EXPENSES_PAGE, SPLIT_PAYMENTS_PAGE } from "@/lib/validation";
import { getCategories } from "@/lib/queries";
import { getGroupDetail } from "@/services/split";
import { listExpenses, listSettlements, writableProfiles } from "@/services/split-ledger";
import { SplitGroupView } from "@/components/app/split/split-group-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Split group" };

/**
 * One split group. Anyone who isn't a joined member gets the app's 404 — the
 * service refuses them the same way, so the page can't leak that it exists.
 */
export default async function SplitGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUser();
  const [workspace, timeZone] = await Promise.all([getCurrentWorkspace(user.id), getTimeZone()]);
  const data = await Promise.all([
    getGroupDetail(user.id, groupId),
    listExpenses(user.id, groupId, { limit: SPLIT_EXPENSES_PAGE, offset: 0 }),
    listSettlements(user.id, groupId, { limit: SPLIT_PAYMENTS_PAGE, offset: 0 }),
  ]).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const [detail, expenses, payments] = data;
  // Where "Add to my workspace" writes: the current workspace's writable
  // profiles and expense categories.
  const [profiles, categories] = await Promise.all([
    writableProfiles(user.id, workspace.id),
    getCategories(workspace.id),
  ]);
  return (
    <SplitGroupView
      detail={detail}
      expenses={expenses.items}
      expenseTotal={expenses.total}
      payments={payments.items}
      paymentTotal={payments.total}
      userId={user.id}
      locale={workspace.locale}
      today={todayISO(timeZone)}
      workspace={{
        name: workspace.name,
        currency: workspace.currency,
        locale: workspace.locale,
        profiles,
        categories: categories
          .filter((c) => c.kind === "expense")
          .map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
      }}
    />
  );
}
