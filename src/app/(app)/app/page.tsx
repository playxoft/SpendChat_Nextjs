import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser, getUserSettings, getCurrentWorkspace } from "@/lib/auth";
import { getCategories, getProfiles, getSummary, listTransactionsAsc } from "@/lib/queries";
import { parseActiveProfile } from "@/lib/filters";
import type { InputMode } from "@/lib/validation";
import { monthLabel, monthRange, todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ChatFeed } from "@/components/app/chat-feed";
import { ChatBalanceSkeleton, ChatFeedSkeleton } from "@/components/app/chat-skeleton";
import { FeedRegion, PendingMessagesProvider } from "@/components/app/pending-messages";
import { TransactionComposer } from "@/components/app/transaction-composer";
import { TrackerActions } from "@/components/app/tracker-actions";
import { ScrollToBottom } from "@/components/app/scroll-to-bottom";
import { ProfileSwitcher } from "@/components/app/profile-switcher";
import { ProfileSwipe } from "@/components/app/profile-swipe";

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
  const workspace = await getCurrentWorkspace(user.id);
  const [categories, profiles] = await Promise.all([
    getCategories(user.id),
    getProfiles(user.id, workspace.id),
  ]);

  const filterProfileId = parseActiveProfile(profileParam ?? null);
  const allProfiles = !filterProfileId;
  // Which profile new transactions land in (falls back to the first profile).
  const composerProfileId = filterProfileId ?? profiles[0]?.id;

  const timeZone = await getTimeZone();
  const today = todayISO(timeZone);
  const { start, end } = monthRange(today);
  const { currency, locale } = settings;
  // Changing the key remounts the streamed sections so their skeletons show
  // immediately on profile switch (instead of holding the stale chat).
  const streamKey = filterProfileId ?? "all";

  return (
    <PendingMessagesProvider>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0">
          <div className="mx-auto max-w-2xl px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <ProfileSwitcher
                profiles={profiles}
                filterProfileId={filterProfileId}
                allProfiles={allProfiles}
              />
              <TrackerActions
                categories={categories}
                profiles={profiles}
                activeProfileId={composerProfileId}
                currency={currency}
                today={today}
                allProfiles={allProfiles}
              />
            </div>

            <Suspense key={streamKey} fallback={<ChatBalanceSkeleton />}>
              <SummaryStream
                userId={user.id}
                workspaceId={workspace.id}
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
              workspaceId={workspace.id}
              from={start}
              to={end}
              profileId={filterProfileId}
              currency={currency}
              locale={locale}
              timeZone={timeZone}
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
          inputMode={settings.inputMode as InputMode}
        />

        {/* Mobile: swipe left/right across the tracker to change profile. */}
        <ProfileSwipe profiles={profiles} filterProfileId={filterProfileId} />
      </div>
    </PendingMessagesProvider>
  );
}

async function SummaryStream({
  userId,
  workspaceId,
  from,
  to,
  profileId,
  currency,
  locale,
  today,
}: {
  userId: string;
  workspaceId: string;
  from: string;
  to: string;
  profileId?: string;
  currency: string;
  locale: string;
  today: string;
}) {
  const summary = await getSummary(userId, workspaceId, { from, to, profileId });
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
  workspaceId,
  from,
  to,
  profileId,
  currency,
  locale,
  timeZone,
  today,
  categories,
  profiles,
}: {
  userId: string;
  workspaceId: string;
  from: string;
  to: string;
  profileId?: string;
  currency: string;
  locale: string;
  timeZone: string;
  today: string;
  categories: Awaited<ReturnType<typeof getCategories>>;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
}) {
  const rows = await listTransactionsAsc(userId, workspaceId, {
    from,
    to,
    limit: 300,
    profileId,
  });
  return (
    <>
      <FeedRegion
        hasRows={rows.length > 0}
        rowIds={rows.map((r) => r.id)}
        currency={currency}
        locale={locale}
        timeZone={timeZone}
        profileId={profileId ?? null}
      >
        <ChatFeed
          rows={rows}
          currency={currency}
          locale={locale}
          timeZone={timeZone}
          today={today}
          categories={categories}
          profiles={profiles}
        />
      </FeedRegion>
      <ScrollToBottom count={rows.length} />
    </>
  );
}
