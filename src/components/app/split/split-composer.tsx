"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Equal, Maximize2, Percent, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSplitExpense } from "@/actions/split";
import { getCurrency } from "@/lib/currencies";
import { toMinorUnits } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";
import { acceptAmountInput } from "@/lib/split-display";
import { cn } from "@/lib/utils";
import { SPLIT_EXPENSE_TITLE_MAX } from "@/lib/validation";
import type { ExpenseDraft, ExpenseMember, SplitType } from "./expense-dialog";
import { MemberAvatar } from "./member-avatar";

/**
 * The chat's composer — the tracker's manual input, for a split: amount and
 * title typed inline, and a strip of quick controls above them for who paid
 * (you, by default), how it's split, who's in it and when. An equal split
 * sends straight from here; exact amounts and percents need a figure per
 * person, so picking either (or the expand button) carries what's typed into
 * the full editor.
 */
export function SplitComposer({
  groupId,
  currency,
  locale,
  today,
  members,
  meMemberId,
  onExpand,
  onSent,
}: {
  groupId: string;
  currency: string;
  locale: string;
  today: string;
  /** Everyone who can be on a new expense (active members). */
  members: ExpenseMember[];
  meMemberId: string;
  /** Open the full editor with what's typed so far. */
  onExpand: (draft: ExpenseDraft) => void;
  /** After an expense was added from here, with the date it went in under. */
  onSent?: (date: string) => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [paidBy, setPaidBy] = React.useState(meMemberId);
  const [date, setDate] = React.useState(today);
  const [included, setIncluded] = React.useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(0);
  const amountRef = React.useRef<HTMLInputElement>(null);

  // Back to the amount for the next one — after the send has re-enabled the
  // fields (focusing a still-disabled input does nothing).
  React.useEffect(() => {
    if (sent > 0) amountRef.current?.focus();
  }, [sent]);

  // People joining or leaving: keep the selection to people who are here,
  // and include newcomers by default.
  const memberKey = members.map((m) => m.id).join(",");
  const [seenMembers, setSeenMembers] = React.useState(memberKey);
  if (memberKey !== seenMembers) {
    setSeenMembers(memberKey);
    const previous = new Set(seenMembers.split(",").filter(Boolean));
    setIncluded(
      new Set(members.filter((m) => included.has(m.id) || !previous.has(m.id)).map((m) => m.id)),
    );
    if (!members.some((m) => m.id === paidBy)) setPaidBy(meMemberId);
  }

  const symbol = getCurrency(currency).symbol;
  const draft = (splitType: SplitType): ExpenseDraft => ({
    title: title.trim(),
    amount,
    paidBy,
    splitType,
    memberIds: members.filter((m) => included.has(m.id)).map((m) => m.id),
    date,
  });

  async function submit() {
    const value = amount.trim() ? parseAmountInput(amount, locale) : null;
    if (value === null || value <= 0) {
      toast.error("Enter the amount");
      amountRef.current?.focus();
      return;
    }
    if (toMinorUnits(value, currency) <= 0) {
      toast.error(`Amount is too small for ${currency}`);
      return;
    }
    if (!title.trim()) {
      toast.error("Add what it was for");
      return;
    }
    const memberIds = members.filter((m) => included.has(m.id)).map((m) => m.id);
    if (memberIds.length === 0) {
      toast.error("Pick who it's split between");
      return;
    }
    setPending(true);
    const res = await createSplitExpense(groupId, {
      title: title.trim(),
      amount: value,
      paidBy,
      occurredOn: date,
      splitType: "equal",
      memberIds,
    }).finally(() => setPending(false));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAmount("");
    setTitle("");
    setSent((n) => n + 1);
    onSent?.(date);
    router.refresh();
  }

  const everyone = included.size === members.length;
  const payerName = (id: string) =>
    id === meMemberId ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone");

  return (
    // The tracker composer's strip: page background, pinned above the mobile
    // bottom bar, one floating card holding everything.
    <div className="sticky bottom-16 z-20 bg-background px-3 pt-2 pb-2 md:bottom-0">
      <form
        className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border bg-background p-2 shadow-lg md:bg-background/95 md:backdrop-blur-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          {/* Quick controls — one recessed group, scrolling sideways on the
              narrowest phones rather than wrapping. */}
          <div className="no-scrollbar flex h-9 min-w-0 items-center gap-1.5 overflow-x-auto rounded-full border bg-muted/40 px-0.5 py-0.5">
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger aria-label="Paid by" className="h-8 w-auto shrink-0 gap-1.5 rounded-full bg-background">
                <MemberAvatar id={paidBy} name={payerName(paidBy)} size="sm" />
                <span className="max-w-24 truncate">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id === meMemberId ? "You paid" : `${m.name} paid`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div
              role="group"
              aria-label="How it's split"
              className="inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5"
            >
              <button
                type="button"
                aria-pressed
                aria-label="Split equally"
                title="Split equally"
                className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs font-medium shadow-sm"
              >
                <Equal className="size-3.5" /> <span className="hidden sm:inline">Equally</span>
              </button>
              <button
                type="button"
                aria-pressed={false}
                aria-label="Split by exact amounts"
                title="Split by exact amounts"
                onClick={() => onExpand(draft("exact"))}
                className="inline-flex items-center rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {symbol}
              </button>
              <button
                type="button"
                aria-pressed={false}
                aria-label="Split by percent"
                title="Split by percent"
                onClick={() => onExpand(draft("percent"))}
                className="inline-flex items-center rounded-full px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <Percent className="size-3.5" />
              </button>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 rounded-full bg-background"
                  aria-label={`Split between ${everyone ? "everyone" : `${included.size} of ${members.length} people`}`}
                >
                  <Users className="size-3.5" />
                  {everyone ? `All ${members.length}` : `${included.size} of ${members.length}`}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Split between</p>
                <ul className="max-h-64 overflow-y-auto">
                  {members.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <Checkbox
                          checked={included.has(m.id)}
                          onCheckedChange={(on) => {
                            const next = new Set(included);
                            if (on) next.add(m.id);
                            else next.delete(m.id);
                            setIncluded(next);
                          }}
                        />
                        <MemberAvatar id={m.id} name={m.name} size="sm" />
                        <span className="truncate">{m.id === meMemberId ? `${m.name} (you)` : m.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            <DatePicker value={date} max={today} onChange={setDate} compact dense locale={locale} className="h-8 w-auto shrink-0" />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-8 shrink-0 rounded-full"
              aria-label="Open the full editor"
              title="More options"
              onClick={() => onExpand(draft("equal"))}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                {symbol}
              </span>
              <Input
                ref={amountRef}
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  const typed = e.target.value;
                  setAmount((prev) => acceptAmountInput(prev, typed, locale));
                }}
                aria-label="Amount"
                className={cn("h-9 w-24 tabular-nums sm:w-28 md:text-base", symbol.length > 1 ? "pl-9" : "pl-7")}
              />
            </div>
            <Input
              placeholder="What was it for?"
              value={title}
              maxLength={SPLIT_EXPENSE_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="What it was for"
              className="h-9 min-w-0 flex-1 md:text-base"
            />
            <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Add expense">
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
