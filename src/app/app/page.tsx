import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser, getUserSettings, getCurrentWorkspace } from "@/lib/auth";
import { OPEN_WORKSPACE_PARAM } from "@/lib/invite-links";
import { openWorkspaceIfAccessible } from "@/services/workspaces";
import {
  FEED_PAGE_SIZE,
  getCategories,
  getMonthlyTotals,
  getHeardFromAnswered,
  getProfiles,
  listFeedPage,
  listTransactionIds,
} from "@/lib/queries";
import { resolveWebProfile } from "@/lib/filters";
import { canWriteInWorkspace, workspaceHasMultipleUsers } from "@/lib/workspaces";
import { normalizeUiPrefs } from "@/lib/validation";
import { HEARD_FROM_MAX_ACCOUNT_AGE_DAYS } from "@/lib/attribution";
import type { InputMode } from "@/lib/validation";
import { normalizeVoiceLanguages } from "@/lib/voice-languages";
import { daysSince, monthKey, monthRange, todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { isMobileUA } from "@/lib/device.server";
import { time, timedScope } from "@/lib/timing";
import { InfiniteChatFeed } from "@/components/app/infinite-chat-feed";
import { ChatFeedSkeleton } from "@/components/app/chat-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedRegion, PendingMessagesProvider } from "@/components/app/pending-messages";
import { ActiveMonthProvider } from "@/components/app/active-month";
import { SummaryBar } from "@/components/app/summary-bar";
import { TransactionComposer } from "@/components/app/transaction-composer";
import { TrackerActions } from "@/components/app/tracker-actions";
import { ViewerNotice } from "@/components/app/viewer-notice";
import { OnboardingCards } from "@/components/app/onboarding-cards";
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

  // `/app?workspace=<id>` — the link in an "access granted" email. Switch to
  // that workspace (if the user can open it) and drop the parameter, so a
  // reload or a bookmark doesn't keep forcing the switch.
  const openParam = sp[OPEN_WORKSPACE_PARAM];
  const openWorkspaceId = Array.isArray(openParam) ? openParam[0] : openParam;
  if (openWorkspaceId) {
    const user = await requireUser();
    await openWorkspaceIfAccessible(user.id, openWorkspaceId);
    redirect("/app");
  }

  // A send's `revalidatePath("/app")` re-renders this page, so its data load is a
  // big slice of the perceived send latency. One summary line per render carries
  // the total, DB count/ms + slowest query, and the auth/workspace-data split
  // (the inner `time()` spans are debug, so they enrich the summary without
  // adding their own lines). The feed/summary streams log at debug too.
  const {
    user,
    settings,
    workspace,
    categories,
    profiles,
    canWrite,
    showAuthor,
    accountAgeDays,
    heardFromAnswered,
  } = await timedScope(
    "tracker.page render",
    "tracker.page.timing",
    async () => {
      const { user, settings, workspace } = await time("auth", async () => {
        const user = await requireUser();
        const settings = await getUserSettings(user.id);
        const workspace = await getCurrentWorkspace(user.id);
        return { user, settings, workspace };
      });
      // Off the settings row already in hand — it's written at bootstrap, i.e.
      // the account's first sign-in — so neither card costs a read for the age
      // it's gated on.
      const accountAgeDays = daysSince(settings.createdAt);
      const [categories, profiles, canWrite, showAuthor, heardFromAnswered] = await time(
        "workspaceData",
        () =>
          Promise.all([
            getCategories(workspace.id),
            getProfiles(user.id, workspace.id),
            canWriteInWorkspace(user.id, workspace.id),
            // Shared workspaces label each bubble with its author (WhatsApp-group style).
            workspaceHasMultipleUsers(workspace.id),
            // Only while the answer can still change anything — see the query.
            accountAgeDays <= HEARD_FROM_MAX_ACCOUNT_AGE_DAYS
              ? getHeardFromAnswered(user.id)
              : Promise.resolve(true),
          ]),
      );
      return {
        user,
        settings,
        workspace,
        categories,
        profiles,
        canWrite,
        showAuthor,
        accountAgeDays,
        heardFromAnswered,
      };
    },
  );

  // Web default: no `?profile=` shows the first profile; "all" is explicit.
  const filterProfileId = resolveWebProfile(profileParam ?? null, profiles[0]?.id);
  const allProfiles = !filterProfileId;
  // Which profile new transactions land in (falls back to the first profile).
  const composerProfileId = filterProfileId ?? profiles[0]?.id;

  const uiPrefs = normalizeUiPrefs(settings.uiPrefs);
  // One card at a time above the feed: the channel question for a fresh
  // account, then — once the workspace has had a day and is still solo — the
  // invite nudge. Admins only, since inviting is.
  const showInviteNudge =
    !showAuthor &&
    workspace.role === "admin" &&
    !uiPrefs.onboarding.inviteNudgeDismissed &&
    accountAgeDays >= 1;

  const timeZone = await getTimeZone();
  const today = todayISO(timeZone);
  // The feed pages through all history (infinite scroll); the summary bar shows
  // the balance of whichever month is currently under the header.
  const { start: currentStart, end } = monthRange(today);
  const currentMonthKey = monthKey(today);
  const { currency, locale } = workspace;
  // Changing the key remounts the streamed sections so their skeletons show
  // immediately on profile switch (instead of holding the stale chat).
  const streamKey = filterProfileId ?? "all";

  return (
    <PendingMessagesProvider>
      <ActiveMonthProvider initialMonth={currentMonthKey}>
      <div className="flex min-h-full flex-col">
        <header
          data-tracker-header
          className="sticky top-14 z-10 border-b bg-background/90 backdrop-blur-sm md:top-0"
        >
          <div className="mx-auto max-w-3xl px-4 pt-3 pb-2">
            {/* Profile + balance share the first row on mobile (WhatsApp-style);
                on desktop the balance drops to its own line below. */}
            <div className="flex items-center gap-3 md:block">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ProfileSwitcher
                  profiles={profiles}
                  filterProfileId={filterProfileId}
                  allProfiles={allProfiles}
                />
                {canWrite && (
                  <div className="hidden md:block">
                    <TrackerActions
                      categories={categories}
                      profiles={profiles}
                      activeProfileId={composerProfileId}
                      currency={currency}
                      locale={locale}
                      today={today}
                      allProfiles={allProfiles}
                    />
                  </div>
                )}
              </div>

              <Suspense key={streamKey} fallback={<SummaryBarSkeleton />}>
                <SummaryStream
                  userId={user.id}
                  workspaceId={workspace.id}
                  currentStart={currentStart}
                  currentEnd={end}
                  currentMonthKey={currentMonthKey}
                  profileId={filterProfileId}
                  currency={currency}
                  locale={locale}
                />
              </Suspense>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
          {canWrite && (
            <OnboardingCards
              askHeardFrom={!heardFromAnswered}
              showInviteNudge={showInviteNudge}
            />
          )}
          <Suspense key={streamKey} fallback={<ChatFeedSkeleton />}>
            <FeedStream
              userId={user.id}
              workspaceId={workspace.id}
              profileId={filterProfileId}
              currency={currency}
              locale={locale}
              timeZone={timeZone}
              today={today}
              categories={categories}
              profiles={profiles}
              showAuthor={showAuthor}
              currentUser={{ id: user.id, name: user.name, email: user.email }}
            />
          </Suspense>
        </div>

        {canWrite ? (
          <TransactionComposer
            categories={categories}
            currency={currency}
            locale={locale}
            today={today}
            profiles={profiles}
            activeProfileId={composerProfileId}
            allProfiles={allProfiles}
            inputMode={settings.inputMode as InputMode}
            density={uiPrefs.composer.density}
            isMobileHint={await isMobileUA()}
            voiceLanguages={normalizeVoiceLanguages(settings.voiceLanguages)}
          />
        ) : (
          <ViewerNotice variant="bar" />
        )}

        {/* Mobile: swipe left/right across the tracker to change profile. */}
        <ProfileSwipe profiles={profiles} filterProfileId={filterProfileId} />
      </div>
      </ActiveMonthProvider>
    </PendingMessagesProvider>
  );
}

async function SummaryStream({
  userId,
  workspaceId,
  currentStart,
  currentEnd,
  currentMonthKey,
  profileId,
  currency,
  locale,
}: {
  userId: string;
  workspaceId: string;
  /** The current month, whose ids reconcile the optimistic (pending) total. */
  currentStart: string;
  currentEnd: string;
  currentMonthKey: string;
  profileId?: string;
  currency: string;
  locale: string;
}) {
  // Totals for *every* month, not just the current one: the feed scrolls through
  // all history, and the summary bar retitles itself to whichever month is under
  // the header. Unbounded is the right window because the client keeps paging
  // older rows in — a fixed range would leave those months reading zero. It's one
  // grouped aggregate returning a row per month, so the payload stays tiny.
  //
  // The ids are only needed for the current month, whose pending sends the client
  // reconciles against (a pending amount is dropped once its saved id lands here).
  const [monthTotals, txnIds] = await time(
    "tracker.summary",
    () =>
      Promise.all([
        getMonthlyTotals(userId, workspaceId, { profileId }),
        listTransactionIds(userId, workspaceId, { from: currentStart, to: currentEnd, profileId }),
      ]),
    { event: "tracker.summary.timing" },
  );
  return (
    <SummaryBar
      monthTotals={monthTotals}
      currentMonthKey={currentMonthKey}
      serverTxnIds={txnIds}
      currency={currency}
      locale={locale}
      profileId={profileId ?? null}
    />
  );
}

/** Balance placeholder that matches SummaryStream's responsive positioning. */
function SummaryBarSkeleton() {
  return (
    <div className="shrink-0 md:mt-3">
      <div className="flex flex-col items-end gap-1 md:hidden">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="hidden items-end justify-between gap-3 md:flex">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

async function FeedStream({
  userId,
  workspaceId,
  profileId,
  currency,
  locale,
  timeZone,
  today,
  categories,
  profiles,
  showAuthor,
  currentUser,
}: {
  userId: string;
  workspaceId: string;
  profileId?: string;
  currency: string;
  locale: string;
  timeZone: string;
  today: string;
  categories: Awaited<ReturnType<typeof getCategories>>;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
  showAuthor: boolean;
  currentUser: { id: string; name: string | null; email: string | null };
}) {
  // The latest page across all history (newest-first), reversed to oldest-first
  // for the chat. Older pages stream in as the user scrolls up.
  const newestFirst = await time(
    "tracker.feed",
    () => listFeedPage(userId, workspaceId, { profileId, limit: FEED_PAGE_SIZE }),
    { event: "tracker.feed.timing" },
  );
  const rows = [...newestFirst].reverse();
  return (
    <FeedRegion
      hasRows={rows.length > 0}
      rowIds={rows.map((r) => r.id)}
      currency={currency}
      locale={locale}
      timeZone={timeZone}
      profileId={profileId ?? null}
      showAuthor={showAuthor}
      currentUser={currentUser}
    >
      <InfiniteChatFeed
        initialRows={rows}
        profileId={profileId ?? null}
        pageSize={FEED_PAGE_SIZE}
        hasMoreInitially={newestFirst.length === FEED_PAGE_SIZE}
        currency={currency}
        locale={locale}
        timeZone={timeZone}
        today={today}
        categories={categories}
        profiles={profiles}
        showAuthor={showAuthor}
      />
    </FeedRegion>
  );
}
