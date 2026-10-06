"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptSplitInvitation, declineSplitInvitation } from "@/actions/split";
import type { SplitGroupSummary, SplitInvitation } from "@/services/split";
import { BalanceText } from "./balance-text";
import { NewGroupDialog } from "./new-group-dialog";

/** `/app/split`: invitations waiting for an answer, then the groups you're in. */
export function SplitHome({
  groups,
  invitations,
  defaultCurrency,
  locale,
}: {
  groups: SplitGroupSummary[];
  invitations: SplitInvitation[];
  defaultCurrency: string;
  locale: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function answer(inv: SplitInvitation, join: boolean) {
    setBusy(inv.memberId);
    const res = join
      ? await acceptSplitInvitation(inv.memberId)
      : await declineSplitInvitation(inv.memberId);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
      return;
    }
    if (join) {
      toast.success(`You joined ${inv.groupName}`);
      router.push(`/app/split/${inv.groupId}`);
    } else {
      toast.success("Invitation declined");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Split</h1>
          <p className="text-sm text-muted-foreground">
            Share costs with anyone — no workspace needed. Everyone sees who owes whom.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New group
        </Button>
      </div>

      {invitations.length > 0 && (
        <section aria-labelledby="split-invitations" className="space-y-2">
          <h2 id="split-invitations" className="text-sm font-medium">
            Invitations
          </h2>
          <ul className="divide-y rounded-xl border">
            {invitations.map((inv) => (
              <li key={inv.memberId} className="flex flex-wrap items-center gap-3 p-3">
                <span aria-hidden className="text-2xl">
                  {inv.groupIcon ?? "🧾"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.groupName}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.inviterName ?? "Someone"} invited you · {inv.peopleCount}{" "}
                    {inv.peopleCount === 1 ? "person" : "people"} · {inv.currency}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === inv.memberId}
                    onClick={() => answer(inv, false)}
                  >
                    Decline
                  </Button>
                  <Button size="sm" disabled={busy === inv.memberId} onClick={() => answer(inv, true)}>
                    Join
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="split-groups" className="space-y-2">
        <h2 id="split-groups" className="text-sm font-medium">
          Your groups
        </h2>
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Users className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No groups yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Start one for a trip, a flat or a dinner. Add what was spent, and SpendChat works out
              who pays whom.
            </p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus /> New group
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/app/split/${g.id}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/50"
                >
                  <span aria-hidden className="text-2xl">
                    {g.icon ?? "🧾"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.peopleCount} {g.peopleCount === 1 ? "person" : "people"} · {g.currency}
                    </p>
                  </div>
                  <BalanceText
                    netMinor={g.myNetMinor}
                    currency={g.currency}
                    locale={locale}
                    you
                    className="text-sm"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewGroupDialog open={creating} onOpenChange={setCreating} defaultCurrency={defaultCurrency} />
    </div>
  );
}
