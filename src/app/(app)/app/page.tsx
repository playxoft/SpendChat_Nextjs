import type { Metadata } from "next";
import { CalendarPlus, ListPlus } from "lucide-react";
import { requireUser, getUserSettings } from "@/lib/auth";
import { getCategories, getProfiles, getSummary, listTransactionsAsc } from "@/lib/queries";
import { monthLabel, monthRange, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChatFeed } from "@/components/app/chat-feed";
import { TransactionComposer } from "@/components/app/transaction-composer";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { BulkAddDialog } from "@/components/app/bulk-add-dialog";
import { ScrollToBottom } from "@/components/app/scroll-to-bottom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tracker",
  robots: { index: false, follow: false },
};

export default async function ChatPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const [categories, profiles] = await Promise.all([
    getCategories(user.id),
    getProfiles(user.id),
  ]);
  const activeProfileId = profiles[0]?.id;

  const today = todayISO();
  const { start, end } = monthRange(today);
  const [rows, summary] = await Promise.all([
    listTransactionsAsc(user.id, { from: start, to: end, limit: 300 }),
    getSummary(user.id, { from: start, to: end }),
  ]);

  const { currency, locale } = settings;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {monthLabel(today, locale)} balance
            </p>
            <p
              className={cn(
                "text-xl font-semibold tabular-nums",
                summary.balance < 0 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatMoney(summary.balance, currency, locale)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <TransactionDialog
              mode="add"
              categories={categories}
              profiles={profiles}
              activeProfileId={activeProfileId}
              currency={currency}
              today={today}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Add with a custom date">
                  <CalendarPlus className="size-4" />
                </Button>
              }
            />
            <BulkAddDialog
              today={today}
              trigger={
                <Button variant="outline" size="sm">
                  <ListPlus className="size-4" />
                  <span className="hidden sm:inline">Bulk add</span>
                </Button>
              }
            />
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl gap-4 px-4 pt-1 pb-2 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{formatMoney(summary.income, currency, locale)} in
          </span>
          <span className="text-muted-foreground">
            −{formatMoney(summary.expense, currency, locale)} out
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <ChatFeed
          rows={rows}
          currency={currency}
          locale={locale}
          today={today}
          categories={categories}
          profiles={profiles}
        />
      </div>

      <TransactionComposer
        categories={categories}
        currency={currency}
        today={today}
        profiles={profiles}
        activeProfileId={activeProfileId}
      />
      <ScrollToBottom count={rows.length} />
    </div>
  );
}
