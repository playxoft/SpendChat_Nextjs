"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SplitViewer } from "@/lib/split-access";
import type { SplitGroupDetail } from "@/services/split";
import { BalanceChip, BalanceText } from "./balance-text";
import { MemberAvatar } from "./member-avatar";
import type { SettleTarget } from "./settle-dialog";
import { TransferList } from "./who-pays-whom";

/**
 * Balances and settling up: who pays whom — person to person, each pair's
 * shared bills netted (`groupDebts`), each with "Mark as paid" for whoever may
 * record it — then everyone's balance.
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
  const me = detail.members.find((m) => m.isYou);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeOnOutsideClick
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Balances</SheetTitle>
          <SheetDescription asChild>
            <div>
              <BalanceChip netMinor={me?.netMinor ?? 0} currency={currency} locale={locale} />
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4 pb-6">
          <section aria-labelledby="split-balances-settle" className="space-y-2">
            <h3 id="split-balances-settle" className="text-sm font-medium">
              Who pays whom
            </h3>
            <TransferList detail={detail} viewer={viewer} locale={locale} onSettle={onSettle} />
          </section>

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
                    {m.status === "invited" && (
                      <span className="text-muted-foreground">{m.nameOnly ? " · not invited" : " · invited"}</span>
                    )}
                    {m.status === "left" && <span className="text-muted-foreground"> · left</span>}
                  </span>
                  <BalanceText netMinor={m.netMinor} currency={currency} locale={locale} you={m.isYou} className="shrink-0" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
