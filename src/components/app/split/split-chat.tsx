"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MoreHorizontal, Pencil, Scale, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteSplitExpense,
  deleteSplitGroup,
  deleteSplitSettlement,
  leaveSplitGroup,
  loadSplitFeed,
  removeSplitWorkspaceEntry,
  updateSplitWorkspaceEntry,
} from "@/actions/split";
import type { SplitViewer } from "@/lib/split-access";
import { balanceChipText, compareFeed, feedCursor, keepThroughRefresh, mergeFeed } from "@/lib/split-display";
import { formatDateLabel, formatDateShort } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SPLIT_FEED_PAGE } from "@/lib/validation";
import type { SplitGroupDetail } from "@/services/split";
import type { SplitExpenseView, SplitFeedItem, SplitSettlementView } from "@/services/split-ledger";
import { AddToWorkspaceDialog, type ShareWorkspace } from "./add-to-workspace-dialog";
import { BalanceChip } from "./balance-text";
import { BalancesSheet } from "./balances-sheet";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { ExpenseDialog, type ExpenseDraft, type ExpenseMember } from "./expense-dialog";
import { GroupSettingsDialog } from "./group-settings-dialog";
import { AvatarStack } from "./member-avatar";
import { MembersDialog } from "./members-dialog";
import { SettleDialog, type SettleTarget } from "./settle-dialog";
import { SplitComposer } from "./split-composer";
import { SplitFeed } from "./split-feed";
import { UpdateEntryDialog, type UpdateEntryTarget } from "./update-entry-dialog";

type Confirm =
  | { kind: "delete-group" }
  | { kind: "leave" }
  | { kind: "delete-expense"; expense: SplitExpenseView }
  | { kind: "delete-payment"; payment: SplitSettlementView };

/**
 * One split group as a chat — the tracker's layout: a sticky header (the
 * group, its people and where you stand), the feed of expenses and payments
 * with the newest at the bottom, and the composer pinned under it. Balances
 * and settling up open in a sheet from the header; an expense's details and
 * its "add to my workspace" actions open from its bubble.
 */
export function SplitChat({
  detail,
  feed: firstPage,
  feedTotal,
  userId,
  locale,
  timeZone,
  today,
  workspace,
}: {
  detail: SplitGroupDetail;
  feed: SplitFeedItem[];
  feedTotal: number;
  userId: string;
  locale: string;
  timeZone: string;
  today: string;
  /** The current workspace — where "Add my share to my workspace" writes. */
  workspace: ShareWorkspace;
}) {
  const router = useRouter();
  const { group, me } = detail;
  const currency = group.currency;
  const viewer: SplitViewer = { userId, memberId: me.memberId, isCreator: me.isCreator };
  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  const active = detail.members.filter((m) => m.status !== "left");
  const myNet = detail.members.find((m) => m.isYou)?.netMinor ?? 0;
  const people = active.map((m) => ({ id: m.id, name: m.name }));

  // The feed: the server's newest page, under whatever "Show earlier" loaded
  // (`older`, oldest-first). Paging is by keyset, so nothing added or deleted
  // meanwhile shifts it.
  const [older, setOlder] = React.useState<SplitFeedItem[]>([]);
  const [total, setTotal] = React.useState(feedTotal);
  const [seen, setSeen] = React.useState(firstPage);
  // A refresh (after any change) brings a new newest page. Earlier pages stay
  // on screen, and are re-read behind it so an edit, a delete or a back-dated
  // add among them shows too — `resync` is that pending re-read.
  const [resync, setResync] = React.useState<{ page: SplitFeedItem[]; until: SplitFeedItem } | null>(null);
  if (firstPage !== seen) {
    setSeen(firstPage);
    setTotal(feedTotal);
    if (older[0]) {
      if (firstPage.length === 0) setOlder([]);
      else {
        const kept = keepThroughRefresh(older, seen);
        setOlder(kept);
        setResync({ page: firstPage, until: kept[0] ?? older[0] });
      }
    }
  }
  const items = mergeFeed(older, firstPage);
  const [loadingEarlier, setLoadingEarlier] = React.useState(false);

  React.useEffect(() => {
    if (!resync) return;
    let cancelled = false;
    void (async () => {
      // Walk back from the new page's oldest item until we pass the oldest one
      // that was on screen (or reach the start) — one read per earlier page
      // loaded, never further. If a read fails, what's on screen stays.
      let reread: SplitFeedItem[] = [];
      let from = resync.page[0];
      while (from) {
        const res = await loadSplitFeed(group.id, feedCursor(from));
        if (cancelled) return;
        if (!res.ok) break; // keep what's on screen
        reread = [...res.items, ...reread];
        setTotal(res.total);
        const oldest = res.items[0];
        const reachedStart = res.items.length < SPLIT_FEED_PAGE;
        if (reachedStart || !oldest || compareFeed(oldest, resync.until) <= 0) {
          // At the very start, the re-read is everything there is.
          setOlder((current) => (reachedStart ? reread : mergeFeed(current, reread)));
          break;
        }
        from = oldest;
      }
      if (!cancelled) setResync(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [resync, group.id]);

  // Newest at the bottom, like a chat: land there, and follow anything new.
  const lastId = items[items.length - 1]?.id ?? "";
  React.useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  }, [lastId]);

  const [detailOf, setDetailOf] = React.useState<SplitExpenseView | null>(null);
  const [editing, setEditing] = React.useState<SplitExpenseView | null>(null);
  const [draft, setDraft] = React.useState<ExpenseDraft | null>(null);
  const [composerKey, setComposerKey] = React.useState(0);
  const [balancesOpen, setBalancesOpen] = React.useState(false);
  const [settle, setSettle] = React.useState<SettleTarget | null>(null);
  const [addingShare, setAddingShare] = React.useState<SplitExpenseView | null>(null);
  const [entryTarget, setEntryTarget] = React.useState<UpdateEntryTarget | null>(null);
  const [entryBusy, setEntryBusy] = React.useState(false);
  const [peopleOpen, setPeopleOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [busy, setBusy] = React.useState(false);

  const composerMembers: ExpenseMember[] = active.map((m) => ({ id: m.id, name: m.name }));
  /** Who can be on an expense: today's people, plus anyone already on this one (named as it names them). */
  const expenseMembers = (expense: SplitExpenseView | null): ExpenseMember[] => {
    const list = [...composerMembers];
    if (!expense) return list;
    const onIt = [expense.paidBy, ...expense.shares.map((s) => ({ memberId: s.memberId, name: s.name }))];
    for (const p of onIt) {
      if (!list.some((m) => m.id === p.memberId)) {
        list.push({ id: p.memberId, name: p.name || names.get(p.memberId) || "Former member" });
      }
    }
    return list;
  };

  async function loadEarlier() {
    const oldest = items[0];
    if (!oldest) return;
    setLoadingEarlier(true);
    const res = await loadSplitFeed(group.id, feedCursor(oldest)).finally(() => setLoadingEarlier(false));
    if (!res.ok) return toast.error(res.error);
    setOlder((current) => {
      const known = new Set(current.map((i) => i.id));
      return [...res.items.filter((i) => !known.has(i.id)), ...current];
    });
    setTotal(res.total);
  }

  /** A sent expense that won't land at the bottom (it's dated earlier) says where it went. */
  function onSent(date: string) {
    const newest = items[items.length - 1];
    if (!newest || date >= newest.date) return;
    const label = date.slice(0, 4) === today.slice(0, 4) ? formatDateShort(date, locale) : formatDateLabel(date, locale);
    toast.success(`Added to ${label}`);
  }

  async function removeEntry(e: SplitExpenseView) {
    setEntryBusy(true);
    const res = await removeSplitWorkspaceEntry(group.id, e.id).finally(() => setEntryBusy(false));
    if (res.ok) toast.success("Moved to the trash in your workspace — you can restore it for 30 days");
    else toast.error(res.error);
    setDetailOf(null);
    router.refresh();
  }

  /** "Update my entry": same currency goes straight through; another asks for the amount. */
  async function updateEntry(e: SplitExpenseView) {
    setEntryBusy(true);
    const res = await updateSplitWorkspaceEntry(group.id, e.id, {}).finally(() => setEntryBusy(false));
    if (res.ok) {
      toast.success("Your entry is up to date");
      setDetailOf(null);
      router.refresh();
      return;
    }
    if (res.code === "amount_required") {
      setDetailOf(null);
      setEntryTarget({ expenseId: e.id, title: e.title, message: res.error });
      return;
    }
    toast.error(res.error);
    router.refresh();
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const res = await (
      confirm.kind === "delete-group"
        ? deleteSplitGroup(group.id)
        : confirm.kind === "leave"
          ? leaveSplitGroup(group.id)
          : confirm.kind === "delete-expense"
            ? deleteSplitExpense(group.id, confirm.expense.id)
            : deleteSplitSettlement(group.id, confirm.payment.id)
    ).finally(() => setBusy(false));
    setConfirm(null);
    if (!res.ok) return toast.error(res.error);
    if (confirm.kind === "delete-group" || confirm.kind === "leave") {
      toast.success(confirm.kind === "leave" ? "You left the group" : "Group deleted");
      router.push("/app/split");
      return;
    }
    toast.success(confirm.kind === "delete-expense" ? "Expense deleted" : "Payment undone");
    const gone = confirm.kind === "delete-expense" ? confirm.expense.id : confirm.payment.id;
    setOlder((current) => current.filter((i) => i.id !== gone));
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2 sm:px-4">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/app/split" aria-label="Back to Split">
              <ArrowLeft />
            </Link>
          </Button>
          <span aria-hidden className="shrink-0 text-2xl leading-none">
            {group.icon ?? "🧾"}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">{group.name}</h1>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPeopleOpen(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
                aria-label={`${detail.peopleCount} people — see who's in the group`}
              >
                {/* Two faces on a phone, three from `sm` — the chip needs the room. */}
                <AvatarStack people={people} max={2} className="sm:hidden" />
                <AvatarStack people={people} max={3} className="hidden sm:flex" />
                <span>{detail.peopleCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setBalancesOpen(true)}
                className="flex min-w-0 rounded-full"
                // The chip's words lead, so the balance is what's announced.
                aria-label={`${balanceChipText(myNet, formatMoney(Math.abs(myNet), currency, locale)).full} — balances and settling up`}
              >
                <BalanceChip netMinor={myNet} currency={currency} locale={locale} compact />
              </button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            // Phones tap the balance chip instead; this keeps the row to three icons.
            className="hidden shrink-0 sm:inline-flex"
            aria-label="Balances and settling up"
            title="Balances"
            onClick={() => setBalancesOpen(true)}
          >
            <Scale />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={me.isCreator ? "People — add or remove" : "People"}
            title="People"
            onClick={() => setPeopleOpen(true)}
          >
            {me.isCreator ? <UserPlus /> : <Users />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Group options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {me.isCreator ? (
                <>
                  <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                    <Pencil /> Group settings
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete-group" })}>
                    <Trash2 /> Delete group
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "leave" })}>
                  Leave group
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <SplitFeed
          items={items}
          total={total}
          meMemberId={me.memberId}
          currency={currency}
          locale={locale}
          timeZone={timeZone}
          today={today}
          loadingEarlier={loadingEarlier || resync !== null}
          onLoadEarlier={loadEarlier}
          onOpenExpense={setDetailOf}
          onEditExpense={setEditing}
          onDeleteExpense={(expense) => setConfirm({ kind: "delete-expense", expense })}
          onUndoPayment={(payment) => setConfirm({ kind: "delete-payment", payment })}
        />
      </div>

      <SplitComposer
        key={composerKey}
        groupId={group.id}
        currency={currency}
        locale={locale}
        today={today}
        members={composerMembers}
        meMemberId={me.memberId}
        onExpand={setDraft}
        onSent={onSent}
      />

      <ExpenseDetailSheet
        expense={detailOf}
        onOpenChange={(open) => !open && setDetailOf(null)}
        meMemberId={me.memberId}
        currency={currency}
        locale={locale}
        busy={entryBusy}
        onAddToWorkspace={(e) => {
          setDetailOf(null);
          setAddingShare(e);
        }}
        onUpdateEntry={updateEntry}
        onRemoveEntry={removeEntry}
        onEdit={(e) => {
          setDetailOf(null);
          setEditing(e);
        }}
        onDelete={(e) => {
          setDetailOf(null);
          setConfirm({ kind: "delete-expense", expense: e });
        }}
      />
      <ExpenseDialog
        open={editing !== null || draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setDraft(null);
          }
        }}
        groupId={group.id}
        currency={currency}
        locale={locale}
        today={today}
        members={expenseMembers(editing)}
        meMemberId={me.memberId}
        expense={editing}
        draft={draft}
        // A draft saved from the full editor clears the composer it came from.
        onSaved={() => {
          if (draft) setComposerKey((k) => k + 1);
        }}
      />
      <BalancesSheet
        open={balancesOpen}
        onOpenChange={setBalancesOpen}
        detail={detail}
        viewer={viewer}
        locale={locale}
        onSettle={(target) => {
          setBalancesOpen(false);
          setSettle(target);
        }}
      />
      <SettleDialog
        target={settle}
        onOpenChange={(open) => !open && setSettle(null)}
        groupId={group.id}
        currency={currency}
        locale={locale}
        today={today}
      />
      <UpdateEntryDialog
        target={entryTarget}
        onOpenChange={(open) => !open && setEntryTarget(null)}
        groupId={group.id}
        locale={locale}
      />
      <AddToWorkspaceDialog
        expense={addingShare}
        onOpenChange={(open) => !open && setAddingShare(null)}
        groupId={group.id}
        groupCurrency={currency}
        workspace={workspace}
      />
      <MembersDialog
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        groupId={group.id}
        members={detail.members}
        isCreator={me.isCreator}
        peopleCount={detail.peopleCount}
        maxPeople={detail.maxPeople}
        currency={currency}
        locale={locale}
      />
      {me.isCreator && (
        <GroupSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          group={group}
          currencyLocked={detail.hasActivity}
        />
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete-group"
                ? `Delete ${group.name}?`
                : confirm?.kind === "leave"
                  ? `Leave ${group.name}?`
                  : confirm?.kind === "delete-expense"
                    ? `Delete “${confirm.expense.title}”?`
                    : "Undo this payment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete-group"
                ? "Every expense and payment in it goes too, for everyone. Anything people added to their own workspaces stays there."
                : confirm?.kind === "leave"
                  ? "You'll stop seeing this group. You can only leave once you're settled up."
                  : confirm?.kind === "delete-expense"
                    ? "Everyone's balances update. Anything already added to a workspace stays there."
                    : "Balances go back to how they were before it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void runConfirm();
              }}
            >
              {confirm?.kind === "leave" ? "Leave" : confirm?.kind === "delete-payment" ? "Undo" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
