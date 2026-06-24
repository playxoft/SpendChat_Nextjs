import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPlus, ListPlus } from "lucide-react";
import { requireUser, getUserSettings } from "@/lib/auth";
import { getCategories, getProfiles, getSummary, listTransactionsAsc } from "@/lib/queries";
import { parseActiveProfile } from "@/lib/filters";
import { monthLabel, monthRange, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChatFeed } from "@/components/app/chat-feed";
import { ChatBalanceSkeleton, ChatFeedSkeleton } from "@/components/app/chat-skeleton";
import { TransactionComposer } from "@/components/app/transaction-composer";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { BulkAddDialog } from "@/components/app/bulk-add-dialog";
import { ScrollToBottom } from "@/components/app/scroll-to-bottom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tracker",
  robots: { index: false, follow: false },
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profileParam = Array.isArray(sp.profile) ? sp.profile[0] : sp.profile;

  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const [categories, profiles] = await Promise.all([
    getCategories(user.id),
    getProfiles(user.id),
  ]);

  const filterProfileId = parseActiveProfile(profileParam ?? null);
  const allProfiles = !filterProfileId;
  // Which profile new transactions land in (falls back to the first profile).
  const composerProfileId = filterProfileId ?? profiles[0]?.id;
  const activeProfile = filterProfileId
    ? (profiles.find((p) => p.id === filterProfileId) ?? null)
    : null;

  const today = todayISO();
  const { start, end } = monthRange(today);
  const { currency, locale } = settings;
  // Changing the key remounts the streamed sections so their skeletons show
  // immediately on profile switch (instead of holding the stale chat).
  const streamKey = filterProfileId ?? "all";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
            >
              {activeProfile?.icon ?? (filterProfileId ? "👤" : "🗂️")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {activeProfile?.name ?? "All profiles"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {allProfiles
                  ? `${profiles.length} profile${profiles.length === 1 ? "" : "s"}`
                  : "Transactions this month"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <TransactionDialog
                mode="add"
                categories={categories}
                profiles={profiles}
                activeProfileId={composerProfileId}
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
                categories={categories}
                profiles={profiles}
                activeProfileId={composerProfileId}
                allProfiles={allProfiles}
                currency={currency}
                trigger={
                  <Button variant="outline" size="sm">
                    <ListPlus className="size-4" />
                    <span className="hidden sm:inline">Bulk add</span>
                  </Button>
                }
              />
            </div>
          </div>

          <Suspense key={streamKey} fallback={<ChatBalanceSkeleton />}>
            <SummaryStream
              userId={user.id}
              from={start}
              to={end}
              profileId={filterProfileId}
              currency={currency}
              locale={locale}
              today={today}
            />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <Suspense key={streamKey} fallback={<ChatFeedSkeleton />}>
          <FeedStream
            userId={user.id}
            from={start}
            to={end}
            profileId={filterProfileId}
            currency={currency}
            locale={locale}
            today={today}
            categories={categories}
            profiles={profiles}
          />
        </Suspense>
      </div>

      <TransactionComposer
        categories={categories}
        currency={currency}
        today={today}
        profiles={profiles}
        activeProfileId={composerProfileId}
        allProfiles={allProfiles}
      />
    </div>
  );
}

async function SummaryStream({
  userId,
  from,
  to,
  profileId,
  currency,
  locale,
  today,
}: {
  userId: string;
  from: string;
  to: string;
  profileId?: string;
  currency: string;
  locale: string;
  today: string;
}) {
  const summary = await getSummary(userId, { from, to, profileId });
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <div>
        <p className="text-xs text-muted-foreground">{monthLabel(today, locale)} balance</p>
        <p
          className={cn(
            "text-xl font-semibold tabular-nums",
            summary.balance < 0 && "text-rose-600 dark:text-rose-400",
          )}
        >
          {formatMoney(summary.balance, currency, locale)}
        </p>
      </div>
      <div className="flex gap-4 pb-1 text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">
          +{formatMoney(summary.income, currency, locale)} in
        </span>
        <span className="text-muted-foreground">
          −{formatMoney(summary.expense, currency, locale)} out
        </span>
      </div>
    </div>
  );
}

async function FeedStream({
  userId,
  from,
  to,
  profileId,
  currency,
  locale,
  today,
  categories,
  profiles,
}: {
  userId: string;
  from: string;
  to: string;
  profileId?: string;
  currency: string;
  locale: string;
  today: string;
  categories: Awaited<ReturnType<typeof getCategories>>;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
}) {
  const rows = await listTransactionsAsc(userId, {
    from,
    to,
    limit: 300,
    profileId,
  });
  return (
    <>
      <ChatFeed
        rows={rows}
        currency={currency}
        locale={locale}
        today={today}
        categories={categories}
        profiles={profiles}
      />
      <ScrollToBottom count={rows.length} />
    </>
  );
}
