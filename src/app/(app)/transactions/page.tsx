import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarPlus, Download, ListPlus } from "lucide-react";
import { getUserSettings, requireUser } from "@/lib/auth";
import {
  countTransactions,
  getCategories,
  getProfiles,
  getSummary,
  listTransactions,
  type TxnFilters,
} from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TransactionFilters } from "@/components/app/transaction-filters";
import { TransactionsTable } from "@/components/app/transactions-table";
import { TransactionsResultsSkeleton } from "@/components/app/transactions-skeleton";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { BulkAddDialog } from "@/components/app/bulk-add-dialog";
import { PrintButton } from "@/components/app/print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

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
  const [categories, profiles] = await Promise.all([
    getCategories(user.id),
    getProfiles(user.id),
  ]);
  const today = todayISO();

  const filters = parseTxnFilters(one);
  const allProfiles = !filters.profileId;
  const composerProfileId = filters.profileId ?? profiles[0]?.id;
  const page = Math.max(1, Number(one("page")) || 1);
  const { currency, locale } = settings;

  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "page") baseParams.set(k, val);
  }
  const base = baseParams.toString();
  const exportHref = `/api/transactions/export${base ? `?${base}` : ""}`;
  // Remount the results on any filter/page change so the skeleton shows at once.
  const streamKey = `${base}|${page}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-1.5">
          <TransactionDialog
            mode="add"
            categories={categories}
            profiles={profiles}
            activeProfileId={composerProfileId}
            currency={currency}
            today={today}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Add a transaction">
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
            trigger={
              <Button variant="outline" size="sm">
                <ListPlus className="size-4" />
                <span className="hidden sm:inline">Bulk add</span>
              </Button>
            }
          />
          <Button asChild variant="outline" size="sm">
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
    </div>
  );
}

async function TransactionsData({
  userId,
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
    listTransactions(userId, { ...filters, limit: PAGE_SIZE, offset }),
    countTransactions(userId, filters),
    getSummary(userId, filters),
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

      <div className="mt-4 mb-3 hidden print:block">
        <h2 className="text-lg font-semibold">MoneyTracker — Transactions</h2>
        <p className="text-sm">
          {total} records · Net {formatMoney(summary.balance, currency, locale)}
        </p>
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
