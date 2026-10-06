"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
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
  loadSplitExpenses,
} from "@/actions/split";
import { formatDateShort } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { canRecordSettlement, type SplitViewer } from "@/lib/split-access";
import type { SplitGroupDetail } from "@/services/split";
import type { SplitExpenseView, SplitSettlementView } from "@/services/split-ledger";
import { BalanceText } from "./balance-text";
import { ExpenseDialog, type ExpenseMember } from "./expense-dialog";
import { GroupSettingsDialog } from "./group-settings-dialog";
import { MembersDialog } from "./members-dialog";
import { SettleDialog, type SettleTarget } from "./settle-dialog";

type Confirm =
  | { kind: "delete-group" }
  | { kind: "leave" }
  | { kind: "delete-expense"; expense: SplitExpenseView }
  | { kind: "delete-payment"; payment: SplitSettlementView };

/**
 * One split group: balances and "settle up" suggestions on top, then the
 * expenses (newest first) and recorded payments. Dialogs for adding/editing
 * expenses, marking payments, people and settings hang off this component.
 */
export function SplitGroupView({
  detail,
  expenses: firstPage,
  expenseTotal,
  payments,
  userId,
  locale,
  today,
}: {
  detail: SplitGroupDetail;
  expenses: SplitExpenseView[];
  expenseTotal: number;
  payments: SplitSettlementView[];
  userId: string;
  locale: string;
  today: string;
}) {
  const router = useRouter();
  const { group, me } = detail;
  const currency = group.currency;
  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const viewer: SplitViewer = { userId, memberId: me.memberId, isCreator: me.isCreator };
  const names = new Map(detail.members.map((m) => [m.id, m.name]));

  const [expenses, setExpenses] = React.useState(firstPage);
  const [total, setTotal] = React.useState(expenseTotal);
  const [loadingMore, setLoadingMore] = React.useState(false);
  // A refresh from the server replaces the first page.
  const [seen, setSeen] = React.useState(firstPage);
  if (firstPage !== seen) {
    setSeen(firstPage);
    setExpenses(firstPage);
    setTotal(expenseTotal);
  }

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SplitExpenseView | null>(null);
  const [settle, setSettle] = React.useState<SettleTarget | null>(null);
  const [peopleOpen, setPeopleOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [busy, setBusy] = React.useState(false);

  const active = detail.members.filter((m) => m.status !== "left");
  const expenseMembers = (expense: SplitExpenseView | null): ExpenseMember[] => {
    const on = new Set(expense ? [expense.paidBy.memberId, ...expense.shares.map((s) => s.memberId)] : []);
    const list = active.map((m) => ({ id: m.id, name: m.name }));
    for (const id of on) {
      if (!list.some((m) => m.id === id)) list.push({ id, name: names.get(id) ?? "Former member" });
    }
    return list;
  };

  async function loadMore() {
    setLoadingMore(true);
    const res = await loadSplitExpenses(group.id, expenses.length);
    setLoadingMore(false);
    if (!res.ok) return toast.error(res.error);
    setExpenses([...expenses, ...res.items.filter((e) => !expenses.some((x) => x.id === e.id))]);
    setTotal(res.total);
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const res =
      confirm.kind === "delete-group"
        ? await deleteSplitGroup(group.id)
        : confirm.kind === "leave"
          ? await leaveSplitGroup(group.id)
          : confirm.kind === "delete-expense"
            ? await deleteSplitExpense(group.id, confirm.expense.id)
            : await deleteSplitSettlement(group.id, confirm.payment.id);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) return toast.error(res.error);
    if (confirm.kind === "delete-group" || confirm.kind === "leave") {
      toast.success(confirm.kind === "leave" ? "You left the group" : "Group deleted");
      router.push("/app/split");
      return;
    }
    toast.success(confirm.kind === "delete-expense" ? "Expense deleted" : "Payment undone");
    router.refresh();
  }

  const myNet = detail.members.find((m) => m.isYou)?.netMinor ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="space-y-3">
        <Link
          href="/app/split"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Split
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="text-3xl">
              {group.icon ?? "🧾"}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">{group.name}</h1>
              <p className="text-sm text-muted-foreground">
                {detail.peopleCount} {detail.peopleCount === 1 ? "person" : "people"} · {currency} ·{" "}
                <BalanceText netMinor={myNet} currency={currency} locale={locale} you />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPeopleOpen(true)}>
              <Users /> People
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add expense
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Group options">
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
        </div>
      </div>

      <section aria-labelledby="split-balances" className="space-y-3 rounded-xl border p-4">
        <h2 id="split-balances" className="text-sm font-medium">
          Balances
        </h2>
        <ul className="space-y-1.5">
          {detail.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                {m.name}
                {m.isYou && <span className="text-muted-foreground"> (you)</span>}
                {m.status === "invited" && <span className="text-muted-foreground"> · invited</span>}
                {m.status === "left" && <span className="text-muted-foreground"> · left</span>}
              </span>
              <BalanceText netMinor={m.netMinor} currency={currency} locale={locale} you={m.isYou} />
            </li>
          ))}
        </ul>
        {detail.suggestions.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-medium">Settle up</h3>
            <ul className="space-y-2">
              {detail.suggestions.map((s) => {
                const from = names.get(s.fromMemberId) ?? "Someone";
                const to = names.get(s.toMemberId) ?? "someone";
                return (
                  <li key={`${s.fromMemberId}-${s.toMemberId}`} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {s.fromMemberId === me.memberId ? "You" : from} {s.fromMemberId === me.memberId ? "pay" : "pays"}{" "}
                      {s.toMemberId === me.memberId ? "you" : to}{" "}
                      <span className="font-medium tabular-nums">{fmt(s.amountMinor)}</span>
                    </span>
                    {canRecordSettlement(viewer, s) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSettle({
                            fromMemberId: s.fromMemberId,
                            fromName: from,
                            toMemberId: s.toMemberId,
                            toName: to,
                            amountMinor: s.amountMinor,
                          })
                        }
                      >
                        Mark as paid
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          detail.hasActivity && <p className="border-t pt-3 text-sm text-muted-foreground">Everyone is settled up.</p>
        )}
      </section>

      <section aria-labelledby="split-expenses" className="space-y-2">
        <h2 id="split-expenses" className="text-sm font-medium">
          Expenses
        </h2>
        {expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet. Add the first expense and everyone&apos;s share is worked out for you.
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {expenses.map((e) => (
              <li key={e.id} className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(e.occurredOn, locale)} ·{" "}
                      {e.paidBy.memberId === me.memberId ? "you paid" : `${e.paidBy.name} paid`} · split{" "}
                      {e.splitType === "equal" ? "equally" : e.splitType === "exact" ? "by amounts" : "by percent"}{" "}
                      between {e.shares.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium tabular-nums">{fmt(e.amountMinor)}</span>
                    {e.canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${e.title}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(e)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setConfirm({ kind: "delete-expense", expense: e })}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                {e.myShare && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Your share <span className="font-medium text-foreground tabular-nums">{fmt(e.myShare.amountMinor)}</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {expenses.length < total && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </Button>
          </div>
        )}
      </section>

      {payments.length > 0 && (
        <section aria-labelledby="split-payments" className="space-y-2">
          <h2 id="split-payments" className="text-sm font-medium">
            Payments
          </h2>
          <ul className="divide-y rounded-xl border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">
                  {p.from.memberId === me.memberId ? "You" : p.from.name} paid{" "}
                  {p.to.memberId === me.memberId ? "you" : p.to.name}
                  <span className="text-muted-foreground"> · {formatDateShort(p.settledOn, locale)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-medium tabular-nums">{fmt(p.amountMinor)}</span>
                  {p.canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirm({ kind: "delete-payment", payment: p })}
                    >
                      Undo
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExpenseDialog
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        groupId={group.id}
        currency={currency}
        locale={locale}
        today={today}
        members={expenseMembers(editing)}
        meMemberId={me.memberId}
        expense={editing}
      />
      <SettleDialog
        target={settle}
        onOpenChange={(open) => !open && setSettle(null)}
        groupId={group.id}
        currency={currency}
        locale={locale}
        today={today}
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
