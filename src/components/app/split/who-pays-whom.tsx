"use client";

import * as React from "react";
import { ArrowRight, ArrowRightLeft, Check, ChevronDown, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { canRecordSettlement, type SplitViewer } from "@/lib/split-access";
import { transferSentence, transfersForViewer, type TransferRole } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import type { SplitGroupDetail } from "@/services/split";
import { MemberAvatar } from "./member-avatar";
import type { SettleTarget } from "./settle-dialog";

type Line = {
  key: string;
  role: TransferRole;
  from: { id: string; name: string };
  to: { id: string; name: string };
  /** "You pay Ravi" — the amount goes after it. For the spoken label. */
  sentence: string;
  amount: string;
  target: SettleTarget;
  canSettle: boolean;
};

/**
 * The group's settle-up plan (computed on the server, person to person, the
 * same for everyone) as this viewer reads it: their own payments first.
 */
function transferLines(detail: SplitGroupDetail, viewer: SplitViewer, locale: string): Line[] {
  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  return transfersForViewer(detail.suggestions, viewer.memberId).map((s) => {
    const fromName = names.get(s.fromMemberId) || "Someone";
    const toName = names.get(s.toMemberId) || "someone";
    return {
      key: `${s.fromMemberId}-${s.toMemberId}`,
      role: s.role,
      from: { id: s.fromMemberId, name: fromName },
      to: { id: s.toMemberId, name: toName },
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

/** A payment in words, the other people's names in bold: "You pay **Ravi**", "**Asha** pays you". */
function Sentence({ line }: { line: Line }) {
  const name = (n: string) => <span className="font-semibold text-foreground">{n}</span>;
  if (line.role === "pay") return <>You pay {name(line.to.name)}</>;
  if (line.role === "receive") return <>{name(line.from.name)} pays you</>;
  return (
    <>
      {name(line.from.name)} pays {name(line.to.name)}
    </>
  );
}

/**
 * One payment: who → whom as two faces, the sentence, the amount (emerald when
 * it's coming to you), and "Mark as paid" for whoever may record it — just a
 * tick on a phone, where the words don't fit beside the amount.
 */
function TransferRow({
  line,
  onSettle,
  className,
}: {
  line: Line;
  onSettle: (target: SettleTarget) => void;
  className?: string;
}) {
  const mine = line.role !== "other";
  return (
    <li className={cn("flex min-h-11 items-center gap-2.5 px-3 py-1.5", className)}>
      <span aria-hidden className="flex shrink-0 items-center">
        <MemberAvatar id={line.from.id} name={line.from.name} size="sm" />
        <ArrowRight className="mx-0.5 size-3 text-muted-foreground" />
        <MemberAvatar id={line.to.id} name={line.to.name} size="sm" />
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", mine ? "text-foreground" : "text-muted-foreground")}>
        <Sentence line={line} />
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums",
          line.role === "receive" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {line.amount}
      </span>
      {line.canSettle && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 px-2 sm:px-2.5"
          aria-label={`Mark as paid: ${line.sentence} ${line.amount}`}
          onClick={() => onSettle(line.target)}
        >
          <Check />
          <span className="hidden sm:inline">Mark as paid</span>
        </Button>
      )}
    </li>
  );
}

const FOOTNOTE =
  "Each person pays back only the people they shared bills with, after what they owe each other cancels out. Marking a payment only records it — no money moves through SpendChat.";

/**
 * Every payment that settles the group, one row each — "You pay Ravi ₹500",
 * "Asha pays you ₹200", "Ravi pays Asha ₹100": the viewer's own under "You",
 * then everyone else's, so anyone can check the whole list.
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
        {detail.hasActivity ? "All settled up — nobody owes anyone." : "Nothing to settle yet."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <TransferGroups lines={lines} onSettle={onSettle} />
      <p className="text-xs text-muted-foreground">{FOOTNOTE}</p>
    </div>
  );
}

/** The viewer's payments, then everyone else's — each under its own small heading when both exist. */
function TransferGroups({ lines, onSettle }: { lines: Line[]; onSettle: (target: SettleTarget) => void }) {
  const mine = lines.filter((l) => l.role !== "other");
  const others = lines.filter((l) => l.role === "other");
  const both = mine.length > 0 && others.length > 0;
  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      {mine.length > 0 && (
        <section aria-label="Your payments">
          {both && <SubHeading>You</SubHeading>}
          <ul className="divide-y">
            {mine.map((l) => (
              <TransferRow key={l.key} line={l} onSettle={onSettle} />
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section aria-label="Between others">
          {both && <SubHeading>Between others</SubHeading>}
          <ul className="divide-y">
            {others.map((l) => (
              <TransferRow key={l.key} line={l} onSettle={onSettle} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

/** How many of the viewer's own payments the folded card shows: three, two on a phone. */
const FOLDED_ROWS = 3;

/**
 * "Who pays whom" as a card under the group's header, on every screen size.
 * Folded, it shows the viewer's own payments (up to three, two on a phone) as full rows with
 * "Mark as paid", or says they're square; "Show all" unfolds every payment in
 * the group. Settled, it says so; before anything is added it isn't shown.
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
  const mine = lines.filter((l) => l.role !== "other");
  // The card sits under the header row, its edges in line with the row's content.
  const frame = "mx-auto max-w-3xl px-2 pb-2 sm:px-4";

  if (lines.length === 0) {
    return (
      <div className={frame}>
        <p className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm shadow-xs">
          <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">All settled up</span>
          <span className="text-muted-foreground">— nobody owes anyone</span>
        </p>
      </div>
    );
  }

  const folded = mine.slice(0, FOLDED_ROWS);
  // A phone folds to two rows, so it may need "Show all" where a wider screen doesn't.
  const moreOnPhone = lines.length > Math.min(folded.length, FOLDED_ROWS - 1);
  const moreOnWide = lines.length > folded.length;
  return (
    <div className={frame}>
      <section aria-labelledby={`${panelId}-title`} className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <ArrowRightLeft aria-hidden className="size-3.5" />
          </span>
          <h2 id={`${panelId}-title`} className="text-sm font-semibold">
            Who pays whom
          </h2>
          <span className="truncate text-xs text-muted-foreground">
            {lines.length === 1 ? "1 payment settles everyone" : `${lines.length} payments settle everyone`}
          </span>
          {moreOnPhone && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                !moreOnWide && "sm:hidden",
              )}
            >
              {open ? "Show less" : "Show all"}
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
        <div id={panelId}>
          {open ? (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto px-3 pt-1 pb-3">
              <TransferGroups lines={lines} onSettle={onSettle} />
              <p className="text-xs text-muted-foreground">{FOOTNOTE}</p>
            </div>
          ) : folded.length > 0 ? (
            <ul className="divide-y pb-1">
              {folded.map((l, i) => (
                <TransferRow key={l.key} line={l} onSettle={onSettle} className={cn(i === FOLDED_ROWS - 1 && "max-sm:hidden")} />
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 px-3 pt-0.5 pb-2.5 text-sm text-muted-foreground">
              <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              You&apos;re settled up — the rest is between others.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
