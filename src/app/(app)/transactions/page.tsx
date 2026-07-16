import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import {
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { getCurrentWorkspace, getUserSettings, requireUser } from "@/lib/auth";
import {
  countTransactions,
  getCategories,
  getProfiles,
  getSummary,
  listTransactions,
  type TxnFilters,
} from "@/lib/queries";
import { parseTxnFilters, resolveWebProfile } from "@/lib/filters";
import { parseISODate, todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { formatMoney } from "@/lib/money";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TransactionFilters } from "@/components/app/transaction-filters";
import { TransactionsTable } from "@/components/app/transactions-table";
import { TransactionsResultsSkeleton } from "@/components/app/transactions-skeleton";
import { TransactionsActions } from "@/components/app/transactions-actions";
import { PrintButton } from "@/components/app/print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

/** Human date-range label for the print header. When the range is exactly one
 * calendar month, the month name is surfaced separately so it can be shown big. */
function printRange(from?: string, to?: string): { month: string | null; label: string } {
  if (from && to) {
    const f = parseISODate(from);
    const t = parseISODate(to);
    const label = `${format(f, "d MMM yyyy")} to ${format(t, "d MMM yyyy")}`;
    const singleMonth =
      isSameMonth(f, t) && isSameDay(f, startOfMonth(f)) && isSameDay(t, endOfMonth(t));
    return { month: singleMonth ? format(f, "MMMM yyyy") : null, label };
  }
  if (from) return { month: null, label: `From ${format(parseISODate(from), "d MMM yyyy")}` };
  if (to) return { month: null, label: `Until ${format(parseISODate(to), "d MMM yyyy")}` };
  return { month: null, label: "All transactions" };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };

  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const workspace = await getCurrentWorkspace(user.id);
  const [categories, profiles] = await Promise.all([
    getCategories(user.id),
    getProfiles(user.id, workspace.id),
  ]);
  const today = todayISO(await getTimeZone());

  const filters = parseTxnFilters(one);
  // Web default: no `?profile=` shows the first profile; "all" is explicit.
  filters.profileId = resolveWebProfile(one("profile"), profiles[0]?.id);
  const allProfiles = !filters.profileId;
  const composerProfileId = filters.profileId ?? profiles[0]?.id;
  const profileName = filters.profileId
    ? (profiles.find((p) => p.id === filters.profileId)?.name ?? "Selected profile")
    : "All profiles";
  const printLabel = printRange(filters.from, filters.to).label;
  const page = Math.max(1, Number(one("page")) || 1);
  const { currency, locale } = settings;

  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "page" && k !== "profile") baseParams.set(k, val);
  }
  // Carry the resolved profile so export/print/pagination links match the view.
  baseParams.set("profile", filters.profileId ?? "all");
  const base = baseParams.toString();
  const exportHref = `/api/transactions/export${base ? `?${base}` : ""}`;
  // Remount the results on any filter/page change so the skeleton shows at once.
  const streamKey = `${base}|${page}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Print-only branded report header. */}
      <div className="mb-4 hidden border-b pb-3 print:block">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-heading text-2xl font-bold tracking-tight">{siteConfig.name}</p>
            <p className="text-sm text-muted-foreground">Transactions report</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Workspace:</span> {workspace.name}
            </p>
            <p>
              <span className="font-medium text-foreground">Profile:</span> {profileName}
            </p>
            <p>
              <span className="font-medium text-foreground">Date range:</span> {printLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-1.5">
          <TransactionsActions
            categories={categories}
            profiles={profiles}
            activeProfileId={composerProfileId}
            currency={currency}
            locale={locale}
            today={today}
            allProfiles={allProfiles}
          />
          <Button asChild variant="outline">
            <a href={exportHref}>
              <Download className="size-4" />
              <span className="hidden sm:inline">CSV</span>
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <div className="mt-4">
        <Suspense fallback={null}>
          <TransactionFilters categories={categories} />
        </Suspense>
      </div>

      <div className="mt-4">
        <Suspense key={streamKey} fallback={<TransactionsResultsSkeleton />}>
          <TransactionsData
            userId={user.id}
            workspaceId={workspace.id}
            filters={filters}
            page={page}
            base={base}
            currency={currency}
            locale={locale}
            categories={categories}
            profiles={profiles}
            today={today}
          />
        </Suspense>
      </div>

      {/* Print-only marketing footer. */}
      <div className="mt-6 hidden border-t pt-3 text-center text-xs text-muted-foreground print:block">
        <p>{siteConfig.tagline}</p>
        <p>Track your spending at {siteConfig.domain}</p>
      </div>
    </div>
  );
}

async function TransactionsData({
  userId,
  workspaceId,
  filters,
  page,
  base,
  currency,
  locale,
  categories,
  profiles,
  today,
}: {
  userId: string;
  workspaceId: string;
  filters: TxnFilters;
  page: number;
  base: string;
  currency: string;
  locale: string;
  categories: Awaited<ReturnType<typeof getCategories>>;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
  today: string;
}) {
  const offset = (page - 1) * PAGE_SIZE;
  const [rows, total, summary] = await Promise.all([
    listTransactions(userId, workspaceId, { ...filters, limit: PAGE_SIZE, offset }),
    countTransactions(userId, workspaceId, filters),
    getSummary(userId, workspaceId, filters),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const pr = new URLSearchParams(base);
    if (p > 1) pr.set("page", String(p));
    const qs = pr.toString();
    return qs ? `/transactions?${qs}` : "/transactions";
  };

  return (
    <>
      <p className="text-sm text-muted-foreground print:hidden">
        {total} record{total === 1 ? "" : "s"} · Net{" "}
        {formatMoney(summary.balance, currency, locale)}
      </p>

      {/* Print-only totals (the branded header/footer live on the page). */}
      <div className="mb-3 hidden flex-wrap items-baseline gap-x-6 gap-y-1 border-b pb-2 text-sm print:flex">
        <span>
          <span className="text-muted-foreground">Income:</span>{" "}
          {formatMoney(summary.income, currency, locale)}
        </span>
        <span>
          <span className="text-muted-foreground">Expenses:</span>{" "}
          {formatMoney(summary.expense, currency, locale)}
        </span>
        <span>
          <span className="text-muted-foreground">Net (income − expense):</span>{" "}
          {formatMoney(summary.balance, currency, locale)}
        </span>
        <span className="ml-auto text-muted-foreground">
          {total} record{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4">
        <TransactionsTable
          rows={rows}
          currency={currency}
          locale={locale}
          categories={categories}
          profiles={profiles}
          today={today}
        />
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm print:hidden">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={pageHref(page - 1)}
                className={cn(page <= 1 && "pointer-events-none opacity-50")}
                aria-disabled={page <= 1}
              >
                Previous
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={pageHref(page + 1)}
                className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                aria-disabled={page >= totalPages}
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
