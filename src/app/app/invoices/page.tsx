import type { Metadata } from "next";
import Link from "next/link";
import { getAppContext } from "@/lib/auth";
import { getAddLimits } from "@/lib/entitlements";
import { todayISO } from "@/lib/dates";
import { INVOICE_KINDS, INVOICE_STATUSES, STATUS_LABEL, type InvoiceKind, type InvoiceStatus } from "@/lib/invoices";
import { parseProfileScope, resolveProfileScope } from "@/lib/profile-scope";
import { getProfiles } from "@/lib/queries";
import { getTimeZone } from "@/lib/timezone.server";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { cn } from "@/lib/utils";
import { listInvoices } from "@/services/invoices";
import { AccountControls } from "@/components/app/account-controls";
import { InvoiceList, NewDocumentButtons } from "@/components/app/invoices/invoice-list";
import { InvoicesTabs } from "@/components/app/invoices/invoices-tabs";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Invoices", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Invoices and quotes in the current workspace — the ones the person can
 * read, newest first, filtered by kind and state. `?profile=` (the sidebar's
 * selection) narrows it to those profiles.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { user, workspace } = await getAppContext();
  const kindParam = one(sp.kind);
  const statusParam = one(sp.status);
  const kind = (INVOICE_KINDS as readonly string[]).includes(kindParam ?? "") ? (kindParam as InvoiceKind) : undefined;
  const status = (INVOICE_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as InvoiceStatus)
    : undefined;
  const profileParam = one(sp.profile) ?? null;

  const [rows, profiles, limits, canWrite, timeZone] = await Promise.all([
    listInvoices(user.id, workspace.id, { kind, status }),
    getProfiles(user.id, workspace.id),
    getAddLimits(workspace.id, user.id),
    canWriteInWorkspace(user.id, workspace.id),
    getTimeZone(),
  ]);
  const scope = profileParam ? resolveProfileScope(parseProfileScope(profileParam), profiles) : null;
  const inView = scope ? new Set(scope.profileIds) : null;
  const shown = inView ? rows.filter((r) => inView.has(r.profileId)) : rows;
  const today = todayISO(timeZone);

  const reached = limits.invoices.reached;
  const reason = limits.readOnly
    ? "This workspace is view-only."
    : reached
      ? `You've made ${limits.invoices.limit} invoices and quotes this month — you can make more next month.`
      : null;
  const canAdd = canWrite && !limits.readOnly && !reached;

  const filterHref = (next: { kind?: string | null; status?: string | null }) => {
    const params = new URLSearchParams();
    const k = next.kind === undefined ? kind : next.kind;
    const s = next.status === undefined ? status : next.status;
    if (k) params.set("kind", k);
    if (s) params.set("status", s);
    if (profileParam) params.set("profile", profileParam);
    const q = params.toString();
    return q ? `/app/invoices?${q}` : "/app/invoices";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Invoices and quotes, numbered for you. {limits.invoices.used} of {limits.invoices.limit} made this month.
          </p>
        </div>
        <AccountControls />
      </div>
      <InvoicesTabs active="documents" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
          <FilterChip href={filterHref({ kind: null })} active={!kind}>
            All
          </FilterChip>
          <FilterChip href={filterHref({ kind: "invoice" })} active={kind === "invoice"}>
            Invoices
          </FilterChip>
          <FilterChip href={filterHref({ kind: "quote" })} active={kind === "quote"}>
            Quotes
          </FilterChip>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {INVOICE_STATUSES.map((s) => (
            <FilterChip key={s} href={filterHref({ status: status === s ? null : s })} active={status === s}>
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        {canWrite && <NewDocumentButtons canAdd={canAdd} reason={reason} profileParam={scope?.single ?? null} />}
      </div>

      <InvoiceList
        rows={shown}
        locale={workspace.locale}
        today={today}
        showProfile={profiles.length > 1}
        emptyAction={
          canAdd && !kind && !status ? (
            <NewDocumentButtons canAdd reason={null} profileParam={scope?.single ?? null} />
          ) : undefined
        }
      />
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-sm transition-colors",
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
