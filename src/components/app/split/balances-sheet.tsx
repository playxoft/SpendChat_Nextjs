"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { canRecordSettlement, type SplitViewer } from "@/lib/split-access";
import type { SplitGroupDetail } from "@/services/split";
import { BalanceChip, BalanceText } from "./balance-text";
import { MemberAvatar } from "./member-avatar";
import type { SettleTarget } from "./settle-dialog";

/**
 * Balances and settling up, out of the chat's way: everyone's balance, then
 * a short list of payments that squares the group (matched greedily — few,
 * not guaranteed the fewest), each with "Mark as paid" for whoever may
 * record it.
 */
export function BalancesSheet({
  open,
  onOpenChange,
  detail,
  viewer,
  locale,
  onSettle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: SplitGroupDetail;
  viewer: SplitViewer;
  locale: string;
  onSettle: (target: SettleTarget) => void;
}) {
  const currency = detail.group.currency;
  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  const me = detail.members.find((m) => m.isYou);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Balances</SheetTitle>
          <SheetDescription asChild>
            <div>
              <BalanceChip netMinor={me?.netMinor ?? 0} currency={currency} locale={locale} />
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4 pb-6">
          <section aria-labelledby="split-balances-people" className="space-y-2">
            <h3 id="split-balances-people" className="text-sm font-medium">
              Everyone
            </h3>
            <ul className="space-y-2">
              {detail.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 text-sm">
                  <MemberAvatar id={m.id} name={m.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    {m.name}
                    {m.isYou && <span className="text-muted-foreground"> (you)</span>}
                    {m.status === "invited" && <span className="text-muted-foreground"> · invited</span>}
                    {m.status === "left" && <span className="text-muted-foreground"> · left</span>}
                  </span>
                  <BalanceText netMinor={m.netMinor} currency={currency} locale={locale} you={m.isYou} className="shrink-0" />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="split-balances-settle" className="space-y-2">
            <h3 id="split-balances-settle" className="text-sm font-medium">
              Settle up
            </h3>
            {detail.suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {detail.hasActivity ? "Everyone is settled up." : "Nothing to settle yet."}
              </p>
            ) : (
              <ul className="space-y-2">
                {detail.suggestions.map((s) => {
                  const from = names.get(s.fromMemberId) ?? "Someone";
                  const to = names.get(s.toMemberId) ?? "someone";
                  const youPay = s.fromMemberId === viewer.memberId;
                  const youGet = s.toMemberId === viewer.memberId;
                  return (
                    <li
                      key={`${s.fromMemberId}-${s.toMemberId}`}
                      className="flex items-center gap-2 rounded-lg border p-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        {youPay ? "You" : from} {youPay ? "pay" : "pays"} {youGet ? "you" : to}{" "}
                        <span className="font-medium tabular-nums">{formatMoney(s.amountMinor, currency, locale)}</span>
                      </span>
                      {canRecordSettlement(viewer, s) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() =>
                            onSettle({
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
            )}
            <p className="text-xs text-muted-foreground">
              Marking a payment only records it — no money moves through SpendChat.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
