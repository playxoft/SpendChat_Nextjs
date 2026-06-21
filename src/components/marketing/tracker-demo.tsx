"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DayDivider } from "@/components/app/day-divider";
import { TransactionBubble } from "@/components/app/transaction-bubble";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { formatMoney, signedMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

type TxnType = "income" | "expense";

type DemoTxn = {
  id: number;
  type: TxnType;
  amountMinor: number;
  title: string;
  categoryName: string;
  categoryIcon: string;
  timeLabel: string;
};

const CURRENCY = "USD";
const LOCALE = "en-US";

const SEED: DemoTxn[] = [
  {
    id: 1,
    type: "income",
    amountMinor: 200000,
    title: "June salary",
    categoryName: "Salary",
    categoryIcon: "💼",
    timeLabel: "9:02 AM",
  },
  {
    id: 2,
    type: "expense",
    amountMinor: 1250,
    title: "Lunch with the team",
    categoryName: "Food & Dining",
    categoryIcon: "🍽️",
    timeLabel: "1:14 PM",
  },
  {
    id: 3,
    type: "expense",
    amountMinor: 4000,
    title: "Weekly groceries",
    categoryName: "Groceries",
    categoryIcon: "🛒",
    timeLabel: "6:30 PM",
  },
];

function timeLabelNow(): string {
  return new Date().toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A real, interactive miniature of the tracker for the marketing hero. Type an
 * amount, pick a category, toggle income/expense, and hit send — the bubble
 * lands in the feed and the balance updates, exactly like the app. State is
 * local only (no account, no database).
 */
export function TrackerDemo() {
  const [txns, setTxns] = useState<DemoTxn[]>(SEED);
  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");

  const categories = useMemo(
    () => DEFAULT_CATEGORIES.filter((c) => c.kind === type),
    [type],
  );
  const [categoryName, setCategoryName] = useState(categories[0]?.name ?? "Other");

  const nextId = useRef(SEED.length + 1);
  const feedRef = useRef<HTMLDivElement>(null);

  const activeCategory =
    categories.find((c) => c.name === categoryName) ?? categories[0];

  const balanceMinor = useMemo(
    () => txns.reduce((sum, t) => sum + signedMinor(t.type, t.amountMinor), 0),
    [txns],
  );

  // Keep the newest bubble in view.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [txns]);

  function switchType(next: TxnType) {
    setType(next);
    const firstOfKind = DEFAULT_CATEGORIES.find((c) => c.kind === next);
    if (firstOfKind) setCategoryName(firstOfKind.name);
  }

  function send() {
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    const amountMinor = Math.round(value * 100);
    const cat = activeCategory;
    setTxns((prev) => [
      ...prev,
      {
        id: nextId.current++,
        type,
        amountMinor,
        title: title.trim() || cat?.name || "Transaction",
        categoryName: cat?.name ?? "Other",
        categoryIcon: cat?.icon ?? "💸",
        timeLabel: timeLabelNow(),
      },
    ]);
    setAmount("");
    setTitle("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs text-muted-foreground">Balance this month</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(balanceMinor, CURRENCY, LOCALE)}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          June
        </span>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="h-72 space-y-2 overflow-y-auto px-4 py-4 sm:h-80"
      >
        <DayDivider label="Today" />
        {txns.map((t) => (
          <TransactionBubble
            key={t.id}
            type={t.type}
            amountLabel={formatMoney(
              signedMinor(t.type, t.amountMinor),
              CURRENCY,
              LOCALE,
              { signed: true },
            )}
            title={t.title}
            categoryName={t.categoryName}
            categoryIcon={t.categoryIcon}
            timeLabel={t.timeLabel}
          />
        ))}
      </div>

      {/* Composer */}
      <div className="space-y-2.5 border-t bg-muted/20 px-4 py-3.5">
        {/* Type toggle */}
        <div className="inline-flex w-fit items-center rounded-full border bg-muted/50 p-0.5 text-sm">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              className={cn(
                "rounded-full px-3 py-1 capitalize transition-colors",
                type === t
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => {
            const selected = c.name === activeCategory?.name;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setCategoryName(c.name)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                <span aria-hidden>{c.icon}</span>
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Inputs + send */}
        <div className="flex items-center gap-2">
          <div className="relative w-28 shrink-0">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Amount"
              className="pl-5 tabular-nums"
            />
          </div>
          <Input
            placeholder="What was it for?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Title"
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            onClick={send}
            aria-label="Send transaction"
            className="rounded-full"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
