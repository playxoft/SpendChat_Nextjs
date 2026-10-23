"use client";

import * as React from "react";
import { ArrowRight, ArrowRightLeft, Check, ChevronRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { canRecordSettlement, type SplitViewer } from "@/lib/split-access";
import {
  peopleNames,
  planSummary,
  planSummaryText,
  transferSentence,
  transfersForViewer,
  type TransferRole,
} from "@/lib/split-display";
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
      {/* Two lines rather than a cut-off name on a phone — the faces beside it are hidden from screen readers. */}
      <span className={cn("line-clamp-2 min-w-0 flex-1 text-sm", mine ? "text-foreground" : "text-muted-foreground")}>
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
        <CircleCheck aria-hidden className="size-4" />
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

/** One side's people on the bar: the names, cut to a count on a phone when there are several. */
function Names({ names }: { names: string[] }) {
  const long = peopleNames(names);
  const short = peopleNames(names, true);
  return (
    <span className="min-w-0 truncate font-semibold text-foreground">
      {short === long ? (
        long
      ) : (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="max-sm:hidden">{long}</span>
        </>
      )}
    </span>
  );
}

/**
 * "Who pays whom" as one thin bar under the group's header, on every screen
 * size: the viewer's own part in a line — "You pay **Senthil** ₹250 ·
 * **Nantha and Muthumani** pay you ₹500" (a line per side on a phone, with a
 * count for several people) — the amounts always in view, the names giving way
 * first; or "You're settled up" / "All settled up". Pressing it
 * opens the whole plan, with "Mark as paid", in the balances panel. Before
 * anything is added it isn't shown.
 */
export function WhoPaysWhomBar({
  detail,
  viewer,
  locale,
  onOpen,
}: {
  detail: SplitGroupDetail;
  viewer: SplitViewer;
  locale: string;
  onOpen: () => void;
}) {
  if (!detail.hasActivity) return null;

  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  const nameOf = (id: string) => names.get(id) || "Someone";
  const format = (minor: number) => formatMoney(minor, detail.group.currency, locale);
  const summary = planSummary(detail.suggestions, viewer.memberId);
  const { pay, receive, others } = summary;
  const count = detail.suggestions.length;
  const square = pay.memberIds.length === 0 && receive.memberIds.length === 0;
  const muted = "shrink-0 text-muted-foreground";

  return (
    <div className="mx-auto max-w-3xl px-2 pb-2 sm:px-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${planSummaryText(summary, format, nameOf)} — see who pays whom`}
        className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left text-sm shadow-xs transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {square ? (
          <CircleCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ArrowRightLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-medium max-sm:hidden">Who pays whom</span>
        <span aria-hidden className="h-4 w-px shrink-0 bg-border max-sm:hidden" />
        <span
          aria-hidden
          className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap max-sm:flex-col max-sm:items-start max-sm:gap-0.5"
        >
          {pay.memberIds.length > 0 && (
            <span className="flex max-w-full min-w-0 items-center gap-1">
              <span className={muted}>You pay</span>
              <Names names={pay.memberIds.map(nameOf)} />
              <span className="shrink-0 font-semibold tabular-nums">{format(pay.amountMinor)}</span>
            </span>
          )}
          {pay.memberIds.length > 0 && receive.memberIds.length > 0 && <span className={cn(muted, "max-sm:hidden")}>·</span>}
          {receive.memberIds.length > 0 && (
            <span className="flex max-w-full min-w-0 items-center gap-1">
              <Names names={receive.memberIds.map(nameOf)} />
              <span className={muted}>{receive.memberIds.length === 1 ? "pays you" : "pay you"}</span>
              <span className="shrink-0 font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                {format(receive.amountMinor)}
              </span>
            </span>
          )}
          {square && (
            <span className="max-w-full min-w-0 truncate">
              {others > 0 ? (
                <>
                  <span className="font-medium">You&apos;re settled up</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {others} {others === 1 ? "payment" : "payments"} between others
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">All settled up</span>
                  <span className="text-muted-foreground"> — nobody owes anyone</span>
                </>
              )}
            </span>
          )}
        </span>
        {count > 0 && !square && (
          <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
            {count === 1 ? "1 payment" : `${count} payments`}
          </span>
        )}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
