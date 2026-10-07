"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ChevronDown, Equal, Maximize2, Percent, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { ShareSliderRow, SplitPeopleList, type SplitPerson } from "@/components/split/split-people-list";
import { createSplitExpense } from "@/actions/split";
import { getCurrency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";
import { acceptAmountInput } from "@/lib/split-display";
import { percentToInputString } from "@/lib/split-math";
import { cn } from "@/lib/utils";
import { SPLIT_EXPENSE_TITLE_MAX } from "@/lib/validation";
import { typedMinor, type ExpenseDraft, type ExpenseMember } from "./expense-dialog";
import { MemberAvatar } from "./member-avatar";
import { PaidByPicker } from "./paid-by-picker";
import { PayerSliders } from "./payer-sliders";
import { useExpenseEditor, type SplitType } from "./use-expense-editor";

const SPLIT_TITLE: Record<Exclude<SplitType, "equal">, string> = {
  exact: "Split by amounts",
  percent: "Split by percent",
};

/**
 * The chat's composer — the tracker's manual input, for a split: amount and
 * title typed inline, and a strip of quick controls for who paid (you, or
 * several people), how it's split, who's in it and when.
 *
 * Everything opens *inside* the widget rather than over the chat: the people
 * list expands in place (an "All" box in its corner), and picking ₹ or % — or
 * a second payer — grows a panel of sliders above the controls, where the
 * tracker shows AI drafts above its input. The expand button carries it all
 * into the full editor.
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
  /** Everyone who can be on a new expense (active members); emails only where the viewer may see them. */
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
  const [date, setDate] = React.useState(today);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(0);
  const [peopleOpen, setPeopleOpen] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);
  const peopleId = React.useId();
  const panelId = React.useId();
  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const totalMinor = typedMinor(amount, currency, locale);
  const editor = useExpenseEditor({
    members,
    meMemberId,
    currency,
    totalMinor,
    start: { splitType: "equal", included: members.map((m) => m.id), payers: [{ memberId: meMemberId }] },
    format: fmt,
  });

  // Back to the amount for the next one — after the send has re-enabled the
  // fields (focusing a still-disabled input does nothing).
  React.useEffect(() => {
    if (sent > 0) amountRef.current?.focus();
  }, [sent]);

  // People joining or leaving: keep the selection to people who are here,
  // include newcomers by default, and fall back to you as the payer.
  const memberKey = members.map((m) => m.id).join(",");
  const [seenMembers, setSeenMembers] = React.useState(memberKey);
  if (memberKey !== seenMembers) {
    setSeenMembers(memberKey);
    const previous = new Set(seenMembers.split(",").filter(Boolean));
    editor.setIncluded(members.filter((m) => editor.included.has(m.id) || !previous.has(m.id)).map((m) => m.id));
    if (editor.payerIds.length === 0) editor.setPayerIds([meMemberId]);
  }

  const people: SplitPerson[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email ?? null,
    isYou: m.id === meMemberId,
  }));
  const symbol = getCurrency(currency).symbol;
  const type = editor.splitType;
  const shares = editor.preview.shares;
  const percentText = (bp: number) => `${percentToInputString(bp, locale)}%`;
  const panelOpen = type !== "equal" || editor.payers !== null;
  const everyone = editor.includedIds.length === members.length;

  async function submit() {
    const value = amount.trim() ? parseAmountInput(amount, locale) : null;
    if (value === null || value <= 0) {
      toast.error("Enter the amount");
      amountRef.current?.focus();
      return;
    }
    if (totalMinor <= 0) {
      toast.error(`Amount is too small for ${currency}`);
      return;
    }
    if (!title.trim()) {
      toast.error("Add what it was for");
      return;
    }
    if (editor.preview.error || !shares) {
      toast.error(editor.preview.error ?? "Pick who it's split between");
      return;
    }
    setPending(true);
    const res = await createSplitExpense(
      groupId,
      editor.input({ title: title.trim(), amount: value, occurredOn: date }),
    ).finally(() => setPending(false));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAmount("");
    setTitle("");
    // Who's in it and who paid carry over to the next one; the split goes
    // back to equal (its sliders were for this amount).
    editor.setSplitType("equal");
    setSent((n) => n + 1);
    onSent?.(date);
    router.refresh();
  }

  const typeButton = (value: SplitType, label: string, content: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={type === value}
      aria-label={label}
      aria-controls={value !== "equal" && panelOpen ? panelId : undefined}
      title={label}
      onClick={() => editor.setSplitType(value)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
        type === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {content}
    </button>
  );

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
          {/* The extension: sliders for several payers and for an exact or
              percent split, growing above the controls. */}
          {panelOpen && (
            <div id={panelId} className="scrollbar-slim max-h-[30dvh] overflow-y-auto rounded-xl border bg-muted/20">
              <PayerSliders editor={editor} people={people} totalMinor={totalMinor} format={fmt} />
              {type !== "equal" && (
                <section aria-label={SPLIT_TITLE[type]} className={cn("px-3 pb-1", editor.payers && "border-t")}>
                  <div className="flex items-center gap-2 pt-1.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{SPLIT_TITLE[type]}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => editor.setSplitType("equal")}
                    >
                      <X className="size-3.5" /> Split equally
                    </Button>
                  </div>
                  {editor.includedIds.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">Pick who it&apos;s split between.</p>
                  ) : type === "exact" && totalMinor === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                      Enter the amount to set each person&apos;s part.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {editor.includedIds.map((id) => {
                        const person = people.find((p) => p.id === id) ?? { id, name: "Someone" };
                        const share = shares?.get(id);
                        return (
                          <ShareSliderRow
                            key={id}
                            person={person}
                            avatar={<MemberAvatar id={id} name={person.name} size="sm" />}
                            aside={type === "percent" ? (share !== undefined ? fmt(share) : "—") : undefined}
                            binding={
                              type === "exact"
                                ? { state: editor.exact, step: editor.moneyStep, format: fmt, onMove: editor.moveExact }
                                : {
                                    state: editor.percent,
                                    step: editor.percentStep,
                                    format: percentText,
                                    onMove: editor.movePercent,
                                  }
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Who's in it — an accordion inside the widget. */}
          {peopleOpen && (
            <div id={peopleId}>
              <SplitPeopleList
                header="checkbox"
                people={people}
                included={editor.included}
                onIncludedChange={editor.setIncluded}
                avatar={(p) => <MemberAvatar id={p.id} name={p.name} size="sm" />}
                shareText={(id) => (shares?.has(id) ? fmt(shares.get(id)!) : null)}
                className="scrollbar-slim max-h-[30dvh] overflow-y-auto"
              />
            </div>
          )}

          {/* Quick controls — one recessed group, scrolling sideways on the
              narrowest phones rather than wrapping. */}
          <div className="no-scrollbar flex h-9 min-w-0 items-center gap-1.5 overflow-x-auto rounded-full border bg-muted/40 px-0.5 py-0.5">
            <PaidByPicker
              compact
              members={members}
              meMemberId={meMemberId}
              payerIds={editor.payerIds}
              included={editor.included}
              onChange={editor.setPayerIds}
            />

            <div
              role="group"
              aria-label="How it's split"
              className="inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5"
            >
              {typeButton(
                "equal",
                "Split equally",
                <>
                  <Equal className="size-3.5" /> <span className="hidden sm:inline">Equally</span>
                </>,
              )}
              {typeButton("exact", "Split by amounts", symbol)}
              {typeButton("percent", "Split by percent", <Percent className="size-3.5" />)}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-full bg-background"
              aria-expanded={peopleOpen}
              aria-controls={peopleOpen ? peopleId : undefined}
              aria-label={`Split between ${everyone ? "everyone" : `${editor.includedIds.length} of ${members.length} people`}`}
              onClick={() => setPeopleOpen((o) => !o)}
            >
              <Users className="size-3.5" />
              {everyone ? `All ${members.length}` : `${editor.includedIds.length} of ${members.length}`}
              <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", peopleOpen && "rotate-180")} />
            </Button>

            <DatePicker
              value={date}
              max={today}
              onChange={setDate}
              compact
              dense
              locale={locale}
              className="h-8 w-auto shrink-0"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-8 shrink-0 rounded-full"
              aria-label="Open the full editor"
              title="More options"
              onClick={() => onExpand({ ...editor.snapshot(), title: title.trim(), amount, date })}
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
