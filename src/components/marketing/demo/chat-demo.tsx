"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { CategoryRow } from "@/components/app/category-row";
import {
  EntryModeToggle,
  MODE_ROW_DENSE,
  type EntryMode,
} from "@/components/app/entry-mode-toggle";
import { DemoFrame } from "./demo-frame";
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import {
  DemoControlGroup,
  DemoDateChip,
  DemoProfilePicker,
  DemoTypeToggle,
} from "./demo-controls";
import { demoCategories, type DemoTxnType } from "./demo-data";
import {
  demoAmountInput,
  useDemoMoney,
  type DemoMoneyFormat,
} from "@/hooks/use-demo-currency";
import { useDemoFeed } from "./use-demo-feed";
import { featurePath, getFeature } from "@/lib/features";
import { toMinorUnits } from "@/lib/money";
import { amountPlaceholder, parseAmountInput, stripNonAmountChars } from "@/lib/parse-amount";
import { comboFor } from "@/lib/shortcuts";

/**
 * The example sentence the AI panel invites you to type.
 *
 * Priced from the visitor's own currency, for the same reason `ai-demo.tsx`'s
 * `noteFor` is and in the same shape: the balance bar two inches above this
 * line renders through `useDemoMoney`, so a hard-coded "coffee 4.50" sat
 * directly under ₹200,000.00 for every Indian reader. It also wasn't a sentence
 * they could type — where the decimal mark is a comma, "4.50" is not an amount
 * the app's parser will accept, and this line is an instruction.
 *
 * Seeded in USD minor units like every other demo amount, so `demoAmountInput`
 * scales it to something plausible rather than converting it.
 *
 * Kept here rather than imported from `ai-demo.tsx`: this component is the
 * homepage hero, and reaching into that module for one string would pull the
 * whole AI demo — its draft rows, its scheduler — into the homepage's bundle to
 * render a sentence.
 */
function aiExampleNote(money: DemoMoneyFormat): string {
  return `coffee ${demoAmountInput(450, money)} and ${demoAmountInput(6200, money)} on groceries`;
}

/**
 * The tracker, playable, on a marketing page.
 *
 * Assembled from the app's own parts — `TransactionBubble` and `DayDivider` via
 * `DemoFeed`, the real `CategoryRow`, the real `EntryModeToggle`, the real
 * `Kbd` chips reading the real shortcut registry — with local state where the
 * app would call a server action. What it can't reuse (the composer's control
 * strip, the balance header) is copied class-for-class and documented as such
 * in `demo-controls.tsx` and `demo-summary-bar.tsx`.
 *
 * It is a client component but still renders on the server, so the seeded feed
 * is in the HTML a crawler receives. That matters: a demo that only appears
 * after hydration contributes nothing to what the page is *about*.
 */
export function ChatDemo({
  sidebar = true,
  className = "h-[36rem]",
}: {
  /** Drop the app rail — the hero has no room for it beside the copy. */
  sidebar?: boolean;
  /** Pinned frame height; the hero runs shorter than a feature page. */
  className?: string;
} = {}) {
  const feed = useDemoFeed("Personal");
  const [mode, setMode] = useState<EntryMode>("manual");
  const [type, setType] = useState<DemoTxnType>("expense");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");

  const cats = useMemo(
    () =>
      demoCategories(type).map((c) => ({
        // The default set has an "Other" in both kinds, so the kind has to be
        // part of the key even though only one kind is on screen at a time.
        id: `${c.kind}:${c.name}`,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
      })),
    [type],
  );

  const [categoryId, setCategoryId] = useState<string | null>(
    `expense:${demoCategories("expense")[0]?.name}`,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const money = useDemoMoney();
  const aiPage = getFeature("ai-expense-tracker");

  // Keep the newest bubble in view. Scoped to the demo's own scroller, so it
  // never moves the page under the reader.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.txns]);

  function switchType(next: DemoTxnType) {
    setType(next);
    const first = demoCategories(next)[0];
    setCategoryId(first ? `${next}:${first.name}` : null);
  }

  /**
   * What this amount would actually be saved as — the real conversion, so the
   * demo can't drift into float arithmetic, and so the Send button is deciding
   * about the same number the feed will receive.
   *
   * Guarding the *typed* value instead was subtly wrong on any currency with no
   * minor units: "0.4" parses to a perfectly good 0.4, passes a `> 0` check on
   * the major number, and then rounds to zero ¥. The demo would file a ¥0
   * transaction, which is the one thing the app's composer will never do.
   */
  const amountMinor = useMemo(() => {
    const major = parseAmountInput(amount, money.locale);
    if (major === null) return null;
    return toMinorUnits(major, money.code, money.locale);
  }, [amount, money.code, money.locale]);
  const canSend = amountMinor !== null && amountMinor > 0;

  function send() {
    if (amountMinor === null || amountMinor <= 0) return;
    const cat = cats.find((c) => c.id === categoryId) ?? cats[0];
    feed.add({
      type,
      amountMinor,
      title: title.trim() || cat?.name || "Transaction",
      categoryName: cat?.name ?? "Other",
      categoryIcon: cat?.icon ?? "💸",
    });
    setAmount("");
    setTitle("");
  }

  /**
   * Enter moves on rather than sending, which is what the app does here and for
   * the same reason (`transaction-composer.tsx`'s `onAmountKeyDown`): this
   * composer is amount-first, so Enter on the amount alone would file a
   * transaction with no title — and the fallback names it after its category,
   * so the feed filled up with rows called "Food & Dining". The title is the
   * last field, so that one sends.
   */
  function onAmountKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    titleRef.current?.focus();
  }

  function onTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    send();
  }

  return (
    <DemoFrame
      label="Interactive tracker demo"
      active="/app"
      sidebar={sidebar}
      // Pinned so switching Manual → AI, which swaps the composer for a taller
      // panel, doesn't move the rest of the page. Tall enough that the feed
      // shows a real stretch of history rather than a sliver of it.
      className={className}
      header={
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <DemoSummaryBar
            label="August"
            balanceMinor={feed.balanceMinor}
            incomeMinor={feed.totals.incomeMinor}
            expenseMinor={feed.totals.expenseMinor}
            className="min-w-0 flex-1"
          />
          {/* Below `lg` the frame drops its sidebar, so the header carries the
              switcher — the same split the app makes at `md`. Above it, the
              composer's control group is the one that switches profile. */}
          <div className="lg:hidden">
            <DemoProfilePicker profile={feed.profile} onChange={feed.setProfile} />
          </div>
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="shrink-0 space-y-1.5 border-t bg-muted/20 px-4 py-3">
          {/* Control strip at compact density — the app's one-line layout:
              the Manual/AI switch outside the group (it changes what the
              composer *is*), everything that only fills in a field inside it. */}
          <div className={MODE_ROW_DENSE}>
            <EntryModeToggle mode={mode} onChange={setMode} dense pane={mode} />
            {mode === "manual" && (
              <DemoControlGroup>
                <DemoTypeToggle dense type={type} onChange={switchType} />
                <DemoDateChip />
                <DemoProfilePicker dense profile={feed.profile} onChange={feed.setProfile} />
                <div className="min-w-0 flex-1">
                  <CategoryRow
                    dense
                    categories={cats}
                    value={categoryId}
                    onChange={setCategoryId}
                  />
                </div>
              </DemoControlGroup>
            )}
          </div>

          {mode === "manual" ? (
            <>
              <div className="flex items-end gap-2">
                <div className="relative shrink-0">
                  <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    {money.currency.symbol}
                  </span>
                  <Input
                    inputMode="decimal"
                    placeholder={amountPlaceholder(money.locale, money.currency.decimals)}
                    value={amount}
                    onChange={(e) => setAmount(stripNonAmountChars(e.target.value, money.locale))}
                    onKeyDown={onAmountKeyDown}
                    aria-label="Amount"
                    className="h-9 w-28 pl-7 tabular-nums"
                  />
                </div>
                <Input
                  ref={titleRef}
                  placeholder="What was it for?"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={onTitleKeyDown}
                  aria-label="Title"
                  className="h-9 min-w-0 flex-1"
                />
                {/*
                  `aria-disabled`, not `disabled`: sending clears the amount,
                  which turns this button off in the same commit — and a browser
                  blurs a focused element the moment it becomes disabled, so a
                  keyboard visitor was dropped to `<body>` and had to tab
                  through the nav and hero again to add a second row. `send`
                  already no-ops when there's nothing to send.
                */}
                <Button
                  type="button"
                  onClick={send}
                  aria-disabled={!canSend}
                  aria-label="Send transaction"
                  className="h-9 shrink-0 gap-1.5 px-3 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                >
                  <ArrowUp className="size-4" />
                  <Kbd
                    combo={comboFor("tracker.submit")}
                    className="hidden opacity-80 sm:inline-flex"
                  />
                </Button>
              </div>
            </>
          ) : (
            // Switching to AI here doesn't run a model — a marketing page never
            // calls one. It points at the page that demonstrates it properly,
            // which is also a useful internal link.
            <div className="flex min-h-[104px] flex-col items-start justify-center gap-2 rounded-xl border border-dashed px-4 py-3">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-4 text-violet-600" />
                AI entry turns a sentence into transactions
              </p>
              <p className="text-sm text-muted-foreground">
                Type “{aiExampleNote(money)}” and review the drafts before
                anything saves.
              </p>
              {aiPage ? (
                <Link
                  href={featurePath(aiPage.slug)}
                  data-track-event="nav_link_click"
                  data-track-params={JSON.stringify({
                    location: "chat_demo",
                    label: "ai-expense-tracker",
                  })}
                  className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
                >
                  See how AI entry works
                  <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          )}
        </div>
      }
    >
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
        {/* The feed grows from the bottom, as it does in the app: the newest
            transaction sits just above the composer rather than leaving a gap
            beneath a short history. */}
        <div className="flex min-h-full flex-col justify-end">
          <DemoFeed txns={feed.txns} />
        </div>
      </div>
    </DemoFrame>
  );
}
