"use client";

import * as React from "react";
import { ArrowRightLeft, ChevronDown, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { canRecordSettlement, type SplitViewer } from "@/lib/split-access";
import { transferSentence, transfersForViewer, type TransferRole } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import type { SplitGroupDetail } from "@/services/split";
import type { SettleTarget } from "./settle-dialog";

type Line = {
  key: string;
  role: TransferRole;
  /** "You pay Ravi" — the amount goes after it. */
  sentence: string;
  amount: string;
  target: SettleTarget;
  canSettle: boolean;
};

/**
 * The group's settle-up plan (computed on the server, the same for everyone)
 * as this viewer reads it: their own payments first, every line in their words.
 */
function transferLines(detail: SplitGroupDetail, viewer: SplitViewer, locale: string): Line[] {
  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  return transfersForViewer(detail.suggestions, viewer.memberId).map((s) => {
    const fromName = names.get(s.fromMemberId) || "Someone";
    const toName = names.get(s.toMemberId) || "someone";
    return {
      key: `${s.fromMemberId}-${s.toMemberId}`,
      role: s.role,
      sentence: transferSentence(s.role, fromName, toName),
      amount: formatMoney(s.amountMinor, detail.group.currency, locale),
      target: {
        fromMemberId: s.fromMemberId,
        fromName,
        toMemberId: s.toMemberId,
        toName,
        amountMinor: s.amountMinor,
      },
      canSettle: canRecordSettlement(viewer, s),
    };
  });
}

/** An amount in the colour of its direction: emerald coming to you, plain otherwise. */
function Amount({ role, children }: { role: TransferRole; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "font-medium whitespace-nowrap tabular-nums",
        role === "receive" && "text-emerald-700 dark:text-emerald-400",
        role === "pay" && "text-foreground",
      )}
    >
      {children}
    </span>
  );
}

const FOOTNOTE = "Paying these squares everyone up. Marking a payment only records it — no money moves through SpendChat.";

/**
 * Every payment that settles the group, one line each — "You pay Ravi ₹500",
 * "Asha pays you ₹200", "Ravi pays Asha ₹100" — the viewer's own first and
 * stronger, so anyone can check the whole list. A line the viewer may record
 * gets "Mark as paid", which opens the settle dialog at that amount.
 */
export function TransferList({
  detail,
  viewer,
  locale,
  onSettle,
}: {
  detail: SplitGroupDetail;
  viewer: SplitViewer;
  locale: string;
  onSettle: (target: SettleTarget) => void;
}) {
  const lines = transferLines(detail, viewer, locale);
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {detail.hasActivity ? "All settled up — nobody owes anyone." : "Nothing to settle yet."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {lines.map((l) => {
          const mine = l.role !== "other";
          return (
            <li
              key={l.key}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                mine ? "border bg-muted/40" : "text-muted-foreground",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn(mine && "font-medium text-foreground")}>{l.sentence}</span>{" "}
                <Amount role={l.role}>{l.amount}</Amount>
              </span>
              {l.canSettle && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  aria-label={`Mark as paid: ${l.sentence} ${l.amount}`}
                  onClick={() => onSettle(l.target)}
                >
                  Mark as paid
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{FOOTNOTE}</p>
    </div>
  );
}

/**
 * "Who pays whom" on the group screen itself, under the header on every
 * screen size: folded, it's one line — the viewer's own payment if they have
 * one ("You pay Ravi ₹500 · +2 more"); unfolded, the whole list. Settled, it
 * says so; before anything is added it isn't shown.
 */
export function WhoPaysWhom({
  detail,
  viewer,
  locale,
  onSettle,
}: {
  detail: SplitGroupDetail;
  viewer: SplitViewer;
  locale: string;
  onSettle: (target: SettleTarget) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  if (!detail.hasActivity) return null;

  const lines = transferLines(detail, viewer, locale);
  const first = lines[0];
  // The header row's padding above, so the icon lines up with its back button.
  const row = "mx-auto flex max-w-3xl items-center gap-2 px-2 py-1.5 text-sm sm:px-4";
  if (!first) {
    return (
      <div className="border-t">
        <p className={cn(row, "text-muted-foreground")}>
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          <span className="sr-only sm:not-sr-only">Who pays whom:</span>
          <span>All settled up</span>
        </p>
      </div>
    );
  }

  const more = lines.length - 1;
  return (
    <div className="border-t">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(row, "w-full text-left hover:bg-muted/40")}
      >
        <ArrowRightLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {/* Folded on a phone, the line itself says it; the label is still its name. */}
        <span className={cn("shrink-0 text-muted-foreground", !open && "sr-only sm:not-sr-only")}>Who pays whom</span>
        {open ? (
          <span className="min-w-0 truncate text-muted-foreground">
            · {lines.length === 1 ? "1 payment" : `${lines.length} payments`}
          </span>
        ) : (
          <>
            <span className={cn("min-w-0 truncate", first.role === "other" ? "text-muted-foreground" : "font-medium")}>
              {first.sentence}
            </span>
            <Amount role={first.role}>{first.amount}</Amount>
            {more > 0 && <span className="shrink-0 text-muted-foreground">+{more} more</span>}
          </>
        )}
        <ChevronDown
          aria-hidden
          className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open} className="mx-auto max-h-[50vh] max-w-3xl overflow-y-auto px-4 pt-1 pb-3">
        {open && <TransferList detail={detail} viewer={viewer} locale={locale} onSettle={onSettle} />}
      </div>
    </div>
  );
}
