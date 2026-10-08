import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { listGroups, listInvitations } from "@/services/split";
import { SplitHome } from "@/components/app/split/split-home";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Split" };

/**
 * Split home: invitations waiting for an answer, then every group the user has
 * joined with their balance in it. Split lives outside workspaces; the current
 * workspace only lends its currency (the new-group default) and number format.
 */
export default async function SplitPage() {
  const user = await requireUser();
  const [workspace, groups, invitations, timeZone] = await Promise.all([
    getCurrentWorkspace(user.id),
    listGroups(user.id),
    listInvitations(user),
    getTimeZone(),
  ]);
  return (
    <SplitHome
      groups={groups}
      invitations={invitations.items}
      invitationTotal={invitations.total}
      defaultCurrency={workspace.currency}
      locale={workspace.locale}
      today={todayISO(timeZone)}
      timeZone={timeZone}
    />
  );
}
