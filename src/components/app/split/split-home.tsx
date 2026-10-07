"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptSplitInvitation, declineSplitInvitation, loadSplitInvitations } from "@/actions/split";
import type { SplitActivity, SplitGroupSummary, SplitInvitation } from "@/services/split";
import { formatDateShort } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { BalanceChip } from "./balance-text";
import { NewGroupDialog } from "./new-group-dialog";

/** The preview line under a group's name — what happened last. */
function activityLine(a: SplitActivity | null, currency: string, locale: string): string {
  if (!a) return "No expenses yet — add the first one";
  const amount = formatMoney(a.amountMinor, currency, locale);
  if (a.kind === "expense") return `${a.payerIsYou ? "You" : a.payerName} paid ${amount} · ${a.title}`;
  return `${a.fromIsYou ? "You" : a.fromName} paid ${a.toIsYou ? "you" : a.toName} ${amount}`;
}

/** "14:05" today, "3 Oct" before — in the viewer's timezone, the chat-list way. */
function whenLabel(at: Date, today: string, locale: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  if (day === today) return at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
  return formatDateShort(day, locale);
}

/** `/app/split`: invitations waiting for an answer, then the groups you're in. */
export function SplitHome({
  groups,
  invitations: firstPage,
  invitationTotal,
  defaultCurrency,
  locale,
  today,
  timeZone,
}: {
  groups: SplitGroupSummary[];
  invitations: SplitInvitation[];
  invitationTotal: number;
  defaultCurrency: string;
  locale: string;
  today: string;
  timeZone: string;
}) {
  // A chat list: the group with the latest activity first.
  const ordered = [...groups].sort(
    (a, b) => (b.lastActivity?.at ?? b.createdAt).getTime() - (a.lastActivity?.at ?? a.createdAt).getTime(),
  );
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [invitations, setInvitations] = React.useState(firstPage);
  const [total, setTotal] = React.useState(invitationTotal);
  const [seen, setSeen] = React.useState(firstPage);
  if (firstPage !== seen) {
    setSeen(firstPage);
    setInvitations(firstPage);
    setTotal(invitationTotal);
  }
  const [loadingMore, setLoadingMore] = React.useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await loadSplitInvitations(invitations.length);
      if (!res.ok) return toast.error(res.error);
      setInvitations([...invitations, ...res.items.filter((i) => !invitations.some((x) => x.memberId === i.memberId))]);
      setTotal(res.total);
    } finally {
      setLoadingMore(false);
    }
  }

  async function answer(inv: SplitInvitation, join: boolean) {
    setBusy(inv.memberId);
    const res = await (join
      ? acceptSplitInvitation(inv.memberId)
      : declineSplitInvitation(inv.memberId)
    ).finally(() => setBusy(null));
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
          {invitations.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? "Loading…" : `Show more (${total - invitations.length})`}
              </Button>
            </div>
          )}
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
            {ordered.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/app/split/${g.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-xl"
                  >
                    {g.icon ?? "🧾"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate font-medium">{g.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {whenLabel(g.lastActivity?.at ?? g.createdAt, today, locale, timeZone)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {activityLine(g.lastActivity, g.currency, locale)}
                      </p>
                      <BalanceChip netMinor={g.myNetMinor} currency={g.currency} locale={locale} />
                    </div>
                  </div>
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
